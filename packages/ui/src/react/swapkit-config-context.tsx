"use client";

import { type Chain, swapKitConfigStore, WalletOption } from "@swapkit/helpers";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
import { ALL_CONTROLLABLE_CHAINS, computeWalletsBlockedByChains } from "./lib/chain-catalog";
import { isExperimentalWallet } from "./lib/experimental-wallets";
import { isMobileUserAgent, isWalletMobileSupported } from "./lib/mobile-wallet-support";
import { useDisallowedWallets } from "./lib/wallet-config-requirements";
import { API_SUPPORTED_CHAINS } from "./swapkit-context";
import type { ChainConfig, WalletConfig } from "./types";

// Wallets that route through WalletConnect under the hood and throw on connect
// without a Project ID. Hidden when the key is missing rather than letting the
// user tap into a guaranteed failure.
const WALLETS_REQUIRING_WALLETCONNECT_KEY = new Set<WalletOption>([WalletOption.TRUSTWALLET_WEB]);

type SwapKitConfigContextValue = {
  allowDerivationSelection: boolean;
  enabledWallets: WalletOption[] | "all";
  enabledChains: Chain[] | "all";
  /** API_SUPPORTED_CHAINS intersected with the integrator's selection. Prefer over re-filtering. */
  effectiveChains: Chain[];
  isWalletAllowed: (wallet: WalletOption) => boolean;
  isChainAllowed: (chain: Chain) => boolean;
  /** Dev mode or the integrator's `showExperimentalWallets` opt-in. */
  showExperimental: boolean;
};

const SwapKitConfigContext = createContext<SwapKitConfigContextValue>({
  allowDerivationSelection: false,
  effectiveChains: [],
  enabledChains: "all",
  enabledWallets: "all",
  isChainAllowed: () => true,
  isWalletAllowed: () => true,
  showExperimental: false,
});

/**
 * Resolve WalletConfig to a normalized form
 */
function resolveWalletConfig(config: WalletConfig | undefined): WalletOption[] | "all" {
  if (!config || config === "all") return "all";
  if (config === "none") return [];
  if (Array.isArray(config)) return config;

  if ("include" in config) return config.include;
  if ("exclude" in config) {
    // All wallets except excluded ones
    return Object.values(WalletOption).filter((w) => !config.exclude.includes(w)) as WalletOption[];
  }

  return "all";
}

function resolveChainConfig(config: ChainConfig | undefined, allKnownChains: ReadonlyArray<Chain>): Chain[] | "all" {
  if (!config || config === "all") return "all";
  if (Array.isArray(config)) return config;
  if ("include" in config) return config.include;
  if ("exclude" in config) return allKnownChains.filter((c) => !config.exclude.includes(c));
  return "all";
}

export function SwapKitConfigProvider({
  children,
  wallets,
  chains,
  allowDerivationSelection,
  showExperimentalWallets,
}: {
  children: ReactNode;
  wallets?: WalletConfig;
  chains?: ChainConfig;
  allowDerivationSelection?: boolean;
  showExperimentalWallets?: boolean;
}) {
  const enabledWallets = useMemo(() => resolveWalletConfig(wallets), [wallets]);
  const enabledChains = useMemo(() => resolveChainConfig(chains, ALL_CONTROLLABLE_CHAINS), [chains]);
  const derivationSelectionAllowed = allowDerivationSelection ?? false;

  const chainBlockedWallets = useMemo(() => new Set(computeWalletsBlockedByChains(enabledChains)), [enabledChains]);

  // UA-based, evaluated once on mount. Doesn't react to runtime UA changes — the
  // mobile/desktop split is fixed for the session. Tests that need to override
  // can mock `navigator.userAgent` before mount.
  const isMobile = useMemo(() => isMobileUserAgent(), []);

  const isDev = useStore(swapKitConfigStore, (state) => state?.envs?.isDev ?? false);
  const showExperimental = isDev || (showExperimentalWallets ?? false);
  const hasWalletConnectProjectId = useStore(swapKitConfigStore, (state) =>
    Boolean(state?.apiKeys?.walletConnectProjectId),
  );
  // Single source of truth — any wallet whose `required` config paths are
  // empty in SKConfig is filtered out here, same as the studio's toggle UI
  // and the form's effective `enabledWalletOptions` value.
  const disallowedWallets = useDisallowedWallets();

  const isWalletAllowed = useMemo(() => {
    return (wallet: WalletOption) => {
      if (isMobile && !isWalletMobileSupported(wallet)) return false;
      if (!showExperimental && isExperimentalWallet(wallet)) return false;
      if (chainBlockedWallets.has(wallet)) return false;
      if (!hasWalletConnectProjectId && WALLETS_REQUIRING_WALLETCONNECT_KEY.has(wallet)) return false;
      if (disallowedWallets.has(wallet)) return false;
      if (enabledWallets === "all") return true;
      return enabledWallets.includes(wallet);
    };
  }, [enabledWallets, isMobile, showExperimental, chainBlockedWallets, hasWalletConnectProjectId, disallowedWallets]);

  const isChainAllowed = useMemo(() => {
    if (enabledChains === "all") return () => true;
    const set = new Set(enabledChains);
    return (chain: Chain) => set.has(chain);
  }, [enabledChains]);

  const effectiveChains = useMemo(() => API_SUPPORTED_CHAINS.filter((c) => isChainAllowed(c)), [isChainAllowed]);

  return (
    <SwapKitConfigContext.Provider
      value={{
        allowDerivationSelection: derivationSelectionAllowed,
        effectiveChains,
        enabledChains,
        enabledWallets,
        isChainAllowed,
        isWalletAllowed,
        showExperimental,
      }}>
      {children}
    </SwapKitConfigContext.Provider>
  );
}

export function useWalletsConfig() {
  return useContext(SwapKitConfigContext);
}

export const useSwapKitConfig = () =>
  useStore(
    swapKitConfigStore,
    useShallow((state) => ({
      apiKeys: state?.apiKeys,
      chains: state?.chains,
      endpoints: state?.endpoints,
      envs: state?.envs,
      feeMultipliers: state?.feeMultipliers,
      integrations: state?.integrations,
      rpcUrls: state?.rpcUrls,
      v3SwapFlow: state?.v3SwapFlow,
      wallets: state?.wallets,
      widgetId: state?.widgetId,
      widgetKey: state?.widgetKey,
    })),
  );
