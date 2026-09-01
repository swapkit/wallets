"use client";

import {
  AssetValue,
  Chain,
  type ChainWallet,
  type DerivationPathArray,
  type EIP6963ProviderInfo,
  type Eip1193Provider,
  type EVMChain,
  NetworkDerivationPath,
  SKConfig,
  type SKConfigState,
  type TokenNames,
  WalletOption,
} from "@swapkit/helpers";
import type { GetExtendedPublicKey } from "@swapkit/wallets";
import { useCallback, useMemo } from "react";
import type { LoadedWallet, LoadedWallets, LoadedWalletsCache, SwapKitClient } from "../swapkit-types";
import { createSwapKitStore } from "./create-swapkit-store";
import { useTokenPrices } from "./hooks/use-token-prices";
import { MINIMAL_TOKENS } from "./minimal-tokens";
import { addSentryBreadcrumb, captureWidgetError, setSentryContext } from "./sentry";
import type { BalanceDetails, KeystoreFile } from "./types";

// Pre-ordered by real-world importance (most used chains first)
export const API_SUPPORTED_CHAINS = [
  Chain.Bitcoin,
  Chain.Ethereum,
  Chain.Tron,
  Chain.BinanceSmartChain,
  Chain.Solana,
  Chain.Zcash,
  Chain.Ripple,
  Chain.Arbitrum,
  Chain.Base,
  Chain.Optimism,
  Chain.Polygon,
  Chain.Avalanche,
  Chain.Cardano,
  Chain.Cosmos,
  Chain.Sui,
  Chain.Near,
  Chain.Dogecoin,
  Chain.Litecoin,
  Chain.BitcoinCash,
  Chain.Dash,
  Chain.Gnosis,
  Chain.XLayer,
  Chain.THORChain,
  Chain.Maya,
  Chain.Berachain,
  Chain.Monad,
  Chain.Robinhood,
  Chain.Hyperevm,
  Chain.Hype,
  Chain.Radix,
  Chain.Kujira,
  Chain.Ton,
  Chain.Starknet,
  Chain.Stellar,
  Chain.Aleo,
] as const;

type HardwareConnectOptions = { address?: string };

// helpers 5.2.0 types DerivationPathArray as readonly tuples, but the published
// wallet-hardware 4.9.33 d.ts still bakes the pre-1.1.0 mutable tuple unions into the
// connectLedger/connectTrezor/connectKeepkey signatures. The tuples are never mutated
// (helpers freezes them), so stripping readonly at the call sites is safe. Drop this
// once wallets republishes against @swapkit/types >= 1.1.0.
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type MutableDerivationPath = Mutable<DerivationPathArray>;

function initializeMinimalAssets() {
  const tokenMap = new Map<string, { identifier: string; decimal: number }>();

  for (const { identifier, decimals } of MINIMAL_TOKENS) {
    tokenMap.set(identifier, { decimal: decimals, identifier });
  }

  AssetValue.setStaticAssets(tokenMap);

  const assetsMap = new Map<TokenNames | (string & {}), AssetValue>();

  for (const { identifier } of MINIMAL_TOKENS) {
    try {
      const asset = AssetValue.from({ asset: identifier as TokenNames });
      assetsMap.set(identifier, asset);
    } catch (error) {
      console.warn(`Failed to initialize minimal token ${identifier}:`, error);
    }
  }

  return assetsMap;
}

export const assetsMap = initializeMinimalAssets();

// Pre-indexed assets by chain for O(1) network filtering (only API-supported chains)
const supportedChainsSet = new Set<Chain>(API_SUPPORTED_CHAINS);

export const assetsByChain = new Map<Chain, AssetValue[]>();

for (const asset of assetsMap.values()) {
  if (!asset?.chain || !supportedChainsSet.has(asset.chain)) continue;
  const chainAssets = assetsByChain.get(asset.chain) || [];
  chainAssets.push(asset);
  assetsByChain.set(asset.chain, chainAssets);
}

let fullTokensLoaded = false;
let fullTokensLoadingPromise: Promise<boolean> | null = null;

export function loadFullTokenLists() {
  if (fullTokensLoaded) return Promise.resolve(true);
  if (fullTokensLoadingPromise) {
    return fullTokensLoadingPromise;
  }

  fullTokensLoadingPromise = (async () => {
    try {
      const startTime = performance.now();

      try {
        await AssetValue.loadStaticAssets();
      } catch (error) {
        console.error("[SwapKit] loadStaticAssets failed — some tokens may use fallback decimals:", error);
      }

      const loadTime = performance.now() - startTime;

      assetsMap.clear();
      assetsByChain.clear();

      for (const identifier of AssetValue.staticAssets.keys()) {
        try {
          const asset = AssetValue.from({ asset: identifier as TokenNames });
          assetsMap.set(identifier, asset);

          if (asset?.chain && supportedChainsSet.has(asset.chain)) {
            const chainAssets = assetsByChain.get(asset.chain) || [];
            chainAssets.push(asset);
            assetsByChain.set(asset.chain, chainAssets);
          }
        } catch {
          // Skip tokens with unsupported/renamed chains — they'll be excluded from the asset list
        }
      }

      console.log(`[SwapKit] Loaded ${assetsMap.size} tokens in ${loadTime.toFixed(0)}ms`);
      fullTokensLoaded = true;

      return true;
    } catch (error) {
      console.error("[SwapKit] Failed to load full token lists:", error);
      fullTokensLoadingPromise = null;
      return false;
    }
  })();

  return fullTokensLoadingPromise;
}

type SwapKitGlobals = {
  __swapkit_store__?: ReturnType<typeof createSwapKitStore>;
  __swapkit_wallets_cache__?: LoadedWalletsCache;
  __swapkit_config__?: typeof SKConfig;
};

const swapKitGlobals = globalThis as unknown as SwapKitGlobals;

swapKitGlobals.__swapkit_wallets_cache__ = swapKitGlobals.__swapkit_wallets_cache__ || {};
swapKitGlobals.__swapkit_store__ = swapKitGlobals.__swapkit_store__ || createSwapKitStore();
swapKitGlobals.__swapkit_config__ = swapKitGlobals.__swapkit_config__ || SKConfig;

export const useSwapKitStore = swapKitGlobals.__swapkit_store__;
const loadedWalletsCache = swapKitGlobals.__swapkit_wallets_cache__;

/**
 * Extract chains that support direct signing from a loaded wallet module.
 * Wallet modules have shape `{ connect<Name>: { directSigningSupport, supportedChains, connectWallet } }`.
 * Result is additionally intersected with `API_SUPPORTED_CHAINS` so wallets cannot surface
 * chains the widget itself does not support (e.g. ADI on CTRL/Bitget).
 */
function extractDirectSigningChains(wallet: unknown): Chain[] {
  if (!wallet || typeof wallet !== "object") return [];
  const apiSet = supportedChainsSet;

  for (const value of Object.values(wallet as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || !("directSigningSupport" in value)) continue;
    const support = (value as { directSigningSupport: Partial<Record<Chain, boolean>> }).directSigningSupport;
    if (!support) continue;
    return Object.entries(support)
      .filter(([chain, enabled]) => enabled === true && apiSet.has(chain as Chain))
      .map(([chain]) => chain as Chain);
  }

  return [];
}

function extractExtendedPublicKeyGetter(wallet: unknown): GetExtendedPublicKey | undefined {
  if (!wallet || typeof wallet !== "object") return undefined;

  for (const value of Object.values(wallet as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || !("getExtendedPublicKey" in value)) continue;
    const getExtendedPublicKey = (value as { getExtendedPublicKey?: unknown }).getExtendedPublicKey;
    if (typeof getExtendedPublicKey === "function") return getExtendedPublicKey as GetExtendedPublicKey;
  }

  return undefined;
}

let backgroundTokenLoadScheduled = false;

/**
 * Schedule background load of full token lists. Safe to call multiple times —
 * only the first call actually schedules the work. Call from a component mount
 * effect, not at module eval, to avoid SSR and duplicate-chunk pitfalls.
 */
export function scheduleBackgroundTokenLoad() {
  if (backgroundTokenLoadScheduled || typeof window === "undefined") return;
  backgroundTokenLoadScheduled = true;

  const start = () => void loadFullTokenLists();

  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(start, { timeout: 3000 });
  } else {
    setTimeout(start, 100);
  }
}

type UseSwapKitReturn = {
  swapKit: SwapKitClient | null;
  loadSwapKit: (params: { walletOptions: WalletOption[]; config?: SKConfigState }) => Promise<SwapKitClient>;
  balancesByChain: Map<Chain, BalanceDetails[]>;
  eip6963WalletInfo: EIP6963ProviderInfo | null;
  isWalletConnected: boolean;
  isConnectingWallet: boolean;
  isRefreshingBalances: boolean;
  walletType: WalletOption | null;
  checkIfChainConnected: (chain: Chain) => boolean;
  connectKeystore: (keystoreFile: KeystoreFile, password: string) => Promise<void>;
  connectWallet: (
    option: WalletOption,
    chains: Chain[],
    eip6963Provider?: Eip1193Provider,
    eip6963Info?: EIP6963ProviderInfo,
    derivationPath?: DerivationPathArray,
    connectOptions?: HardwareConnectOptions,
  ) => Promise<void>;
  disconnectWallet: () => void;
  getWalletExtendedPublicKey: (option: WalletOption) => GetExtendedPublicKey | undefined;
  refreshBalances: () => Promise<void>;
};

export const useSwapKit = (): UseSwapKitReturn => {
  const {
    swapKit,
    walletType,
    isWalletConnected,
    isConnectingWallet,
    walletRefreshKey,
    isRefreshingBalances,
    eip6963WalletInfo,
    setSwapKit,
    setWalletState,
    setIsConnectingWallet,
    setInitialized,
    setIsRefreshingBalances,
    setBalanceRefreshError,
    incrementWalletRefreshKey,
    setWalletChains,
  } = useSwapKitStore((state) => state);
  const { fetchTokenPrices, clearTokenPrices } = useTokenPrices();

  const loadSwapKit = useCallback(
    async ({ walletOptions, config }: { walletOptions: WalletOption[]; config?: SKConfigState }) => {
      if (config) SKConfig?.set(config);

      const { loadWallet } = await import("@swapkit/wallets");
      const cacheByOption = loadedWalletsCache as Partial<Record<WalletOption, LoadedWallet>>;
      await Promise.all(
        walletOptions.map(async (option) => {
          if (cacheByOption[option]) return;
          try {
            const wallet = (await loadWallet(option)) as LoadedWallet;
            cacheByOption[option] = wallet;
            setWalletChains(option, extractDirectSigningChains(wallet));
          } catch (error) {
            console.warn(`[SwapKit] Failed to load wallet module ${option}:`, error);
          }
        }),
      );

      const walletsMap = new Map<string, unknown>();
      for (const wallet of Object.values(loadedWalletsCache)) {
        if (!wallet || typeof wallet !== "object") continue;
        for (const [key, value] of Object.entries(wallet)) {
          walletsMap.set(key, value);
        }
      }
      const allWallets = Object.fromEntries(walletsMap) as LoadedWallets;

      const [{ SwapKit }, { loadDefaultPlugins }] = await Promise.all([
        import("@swapkit/core"),
        import("@swapkit/plugins"),
      ]);
      const plugins = await loadDefaultPlugins();

      const swapKitClient = SwapKit<typeof plugins, LoadedWallets>({ plugins, wallets: allWallets });

      setSwapKit(swapKitClient);
      setInitialized(true);

      return swapKitClient;
    },
    [setSwapKit, setInitialized, setWalletChains],
  );

  const connectWallet = useCallback(
    async (
      option: WalletOption,
      chains: Chain[],
      eip6963Provider?: Eip1193Provider,
      eip6963Info?: EIP6963ProviderInfo,
      derivationPath?: DerivationPathArray,
      connectOptions?: HardwareConnectOptions,
    ) => {
      // Defence-in-depth against double-tap connect: read live store state (the
      // captured `isConnectingWallet` from useSwapKitStore() can be stale by the
      // time the user re-taps). MetaMask returns -32002 "already processing
      // eth_requestAccounts" if a request is in flight; bail before reaching it.
      if (useSwapKitStore.getState().isConnectingWallet) return;

      setIsConnectingWallet(true);
      setWalletState({ connected: false, eip6963Info: eip6963Info, type: option });

      addSentryBreadcrumb("Connecting wallet", "wallet", { chains, provider: option });

      try {
        if (!swapKit) {
          throw new Error("SwapKit SDK is not ready yet — please try again in a moment");
        }

        switch (option) {
          case WalletOption.METAMASK:
          case WalletOption.COINBASE_WEB:
          case WalletOption.BRAVE:
          case WalletOption.EIP6963:
            await swapKit.connectEVMWallet?.(chains as EVMChain[], option, eip6963Provider);
            break;

          case WalletOption.TRUSTWALLET_WEB:
            await swapKit.connectTrustWallet?.(chains);
            break;

          case WalletOption.PHANTOM:
            await swapKit.connectPhantom?.(chains);
            break;

          case WalletOption.KEPLR:
          case WalletOption.LEAP:
            await swapKit.connectKeplr?.(chains);
            break;

          case WalletOption.COSMOSTATION:
            await swapKit.connectCosmostation?.(chains);
            break;

          case WalletOption.LEDGER:
            await swapKit.connectLedger?.(chains, derivationPath as MutableDerivationPath | undefined, connectOptions);
            break;

          case WalletOption.TREZOR: {
            const [chain] = chains;
            if (!chain) throw new Error("Chain is required for Trezor");
            await swapKit.connectTrezor?.(
              chains,
              (derivationPath ?? NetworkDerivationPath[chain]) as MutableDerivationPath,
              connectOptions,
            );
            break;
          }

          case WalletOption.WALLETCONNECT:
            await swapKit.connectWalletconnect?.(chains);
            break;

          case WalletOption.COINBASE_MOBILE:
            await swapKit.connectCoinbaseWallet?.(chains);
            break;

          case WalletOption.BITGET:
            await swapKit.connectBitget?.(chains);
            break;

          case WalletOption.CTRL:
            await swapKit.connectCtrl?.(chains);
            break;

          case WalletOption.VULTISIG:
            await swapKit.connectVultisig?.(chains);
            break;

          case WalletOption.KEEPKEY: {
            const [chain] = chains;
            const derivationPathMap =
              derivationPath && chain
                ? ({ [chain]: derivationPath } as Record<Chain, MutableDerivationPath>)
                : undefined;
            await swapKit.connectKeepkey?.(chains, derivationPathMap);
            break;
          }

          case WalletOption.KEEPKEY_BEX:
            await swapKit.connectKeepkeyBex?.(chains);
            break;

          case WalletOption.ONEKEY:
            await swapKit.connectOnekeyWallet?.(chains);
            break;

          case WalletOption.OKX:
          case WalletOption.OKX_MOBILE:
            await swapKit.connectOkx?.(chains);
            break;

          case WalletOption.RADIX_WALLET:
            await swapKit.connectRadixWallet?.(chains);
            break;

          case WalletOption.TALISMAN:
            await swapKit.connectTalisman?.(chains);
            break;

          case WalletOption.TRONLINK:
            await swapKit.connectTronLink?.(chains);
            break;

          case WalletOption.XAMAN:
            await swapKit.connectXaman?.(chains);
            break;

          case WalletOption.PASSKEYS:
            await swapKit.connectPasskeys?.(chains);
            break;

          default:
            throw new Error(`Unsupported wallet option: ${option}`);
        }

        const isConnected = chains.some((chain) => !!swapKit.getAddress(chain));

        if (!isConnected) throw new Error("Failed to connect wallet");

        // Update state immediately so UI reflects connected chains before balances load
        setWalletState({ connected: isConnected, eip6963Info: eip6963Info, type: option });
        incrementWalletRefreshKey();

        setSentryContext({ connectedChains: chains.map(String), walletType: option });

        const nativeTokenIds = chains.map((chain) => AssetValue.from({ chain, symbol: chain }).toString());

        void fetchTokenPrices(nativeTokenIds);

        await Promise.allSettled(
          chains.map(async (chain) => {
            const wallet = await swapKit?.getWalletWithBalance(chain);

            const tokenIds = wallet?.balance?.map((balance) => balance.toString()) ?? [];

            return await fetchTokenPrices(tokenIds);
          }),
        );

        incrementWalletRefreshKey();
      } catch (error) {
        console.error(`Failed to connect ${option}:`, error);
        captureWidgetError(error, {
          category: "wallet",
          extra: { chains, walletOption: option },
          tags: { action: "connect", chain: chains?.[0] ?? "unknown", provider: option },
        });
        setWalletState({ connected: false, eip6963Info: null, type: null });
        throw new Error(`Failed to connect ${option}: ${error instanceof Error ? error.message : "Unknown error"}`);
      } finally {
        setIsConnectingWallet(false);
      }
    },
    [swapKit, setWalletState, setIsConnectingWallet, fetchTokenPrices, incrementWalletRefreshKey],
  );

  const clearWalletsCache = useCallback(() => {
    if (!loadedWalletsCache) return;
    const cacheByOption = loadedWalletsCache as Partial<Record<WalletOption, LoadedWallet>>;
    for (const key of Object.keys(cacheByOption)) {
      delete cacheByOption[key as WalletOption];
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    swapKit?.disconnectAll();

    clearWalletsCache();
    clearTokenPrices();

    setWalletState({ connected: false, eip6963Info: null, type: null });
    incrementWalletRefreshKey();

    setSentryContext({ connectedChains: undefined, walletType: undefined });
  }, [swapKit, setWalletState, incrementWalletRefreshKey, clearWalletsCache, clearTokenPrices]);

  const refreshBalances = useCallback(async () => {
    if (!swapKit || !isWalletConnected) return;

    setIsRefreshingBalances(true);
    setBalanceRefreshError(null);

    try {
      const allWallets = swapKit.getAllWallets?.() || {};
      const connectedChains = Object.keys(allWallets) as Chain[];

      await Promise.allSettled(
        connectedChains.map(async (chain) => {
          const wallet = await swapKit.getWalletWithBalance(chain);
          const tokenIds = wallet?.balance?.map((balance) => balance.toString()) ?? [];
          return await fetchTokenPrices(tokenIds);
        }),
      );

      incrementWalletRefreshKey();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setBalanceRefreshError(errorMessage);
      captureWidgetError(error, { category: "wallet", tags: { action: "refresh_balances" } });

      const { toast, SWAPKIT_WIDGET_TOASTER_ID } = await import("./components/ui/sonner");
      toast.error(`Failed to refresh balances: ${errorMessage}`, { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
    } finally {
      setIsRefreshingBalances(false);
    }
  }, [
    swapKit,
    isWalletConnected,
    setIsRefreshingBalances,
    setBalanceRefreshError,
    fetchTokenPrices,
    incrementWalletRefreshKey,
  ]);

  const checkIfChainConnected = useCallback((chain: Chain) => !!swapKit?.getAddress(chain), [swapKit]);

  const getWalletExtendedPublicKey = useCallback((option: WalletOption) => {
    const cacheByOption = loadedWalletsCache as Partial<Record<WalletOption, LoadedWallet>>;
    return extractExtendedPublicKeyGetter(cacheByOption[option]);
  }, []);

  const connectKeystore = useCallback(
    async (keystoreFile: KeystoreFile, password: string) => {
      if (!keystoreFile?.keystore) return;

      try {
        setIsConnectingWallet(true);

        if (!swapKit) {
          throw new Error("SwapKit SDK is not ready yet — please try again in a moment");
        }

        const { decryptFromKeystore } = await import("@swapkit/wallet-keystore");
        const phrase = await decryptFromKeystore(keystoreFile.keystore, password);

        if (!phrase) throw new Error("Failed to decrypt keystore");

        await swapKit.connectKeystore?.(keystoreFile.chains, phrase);

        const nativeTokenIds = keystoreFile.chains.map((chain) => AssetValue.from({ chain, symbol: chain }).toString());

        void fetchTokenPrices(nativeTokenIds);

        await Promise.allSettled(
          keystoreFile.chains.map(async (chain) => {
            const wallet = await swapKit?.getWalletWithBalance(chain);

            const tokenIds = wallet?.balance?.map((balance) => balance.toString()) ?? [];

            return await fetchTokenPrices(tokenIds);
          }),
        );

        setWalletState({ connected: true, type: WalletOption.KEYSTORE });
        incrementWalletRefreshKey();
      } catch (error) {
        console.error("Failed to decrypt keystore:", error);
        captureWidgetError(error, { category: "wallet", tags: { action: "decrypt", provider: "keystore" } });
        throw new Error("Failed to decrypt keystore");
      } finally {
        setIsConnectingWallet(false);
      }
    },
    [swapKit, setWalletState, setIsConnectingWallet, fetchTokenPrices, incrementWalletRefreshKey],
  );

  const allWalletsRecord = (swapKit?.getAllWallets?.() || {}) as Record<Chain, ChainWallet<Chain>>;

  const stableWalletsMemoKey = Object.entries(allWalletsRecord)
    .map(([chain, wallet]) => `${chain}:${wallet?.balance?.map((bal: AssetValue) => bal.toString()).join("_")}`)
    .join(",");

  // biome-ignore lint/correctness/useExhaustiveDependencies: uses stable memo key for performance reasons
  const balancesByChain = useMemo(() => {
    const balancesByChain = new Map<Chain, BalanceDetails[]>();

    for (const wallet of Object.values(allWalletsRecord)) {
      for (const balance of wallet?.balance ?? []) {
        const balances = balancesByChain.get(wallet.chain) || [];

        balances.push({ balance, chain: wallet.chain, identifier: balance.toString(), wallet });

        balancesByChain.set(wallet.chain, balances);
      }
    }

    return balancesByChain;
  }, [stableWalletsMemoKey, walletRefreshKey]);

  return useMemo(
    // biome-ignore assist/source/useSortedKeys: sort by variable type/use case, not alphabetically
    () => ({
      swapKit,
      loadSwapKit,

      balancesByChain,
      eip6963WalletInfo,
      isWalletConnected,
      isConnectingWallet,
      isRefreshingBalances,
      walletType,

      checkIfChainConnected,
      connectKeystore,
      connectWallet,
      disconnectWallet,
      getWalletExtendedPublicKey,
      refreshBalances,
    }),
    [
      swapKit,
      balancesByChain,
      eip6963WalletInfo,
      isWalletConnected,
      isConnectingWallet,
      isRefreshingBalances,
      walletType,
      checkIfChainConnected,
      connectKeystore,
      connectWallet,
      disconnectWallet,
      getWalletExtendedPublicKey,
      loadSwapKit,
      refreshBalances,
    ],
  );
};
