"use client";

import { Chain, swapKitConfigStore, WalletOption } from "@swapkit/helpers";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
import { ALL_CONTROLLABLE_CHAINS, computeWalletsBlockedByChains } from "./lib/chain-catalog";
import { isExperimentalWallet } from "./lib/experimental-wallets";
import { isMobileUserAgent, isWalletMobileSupported } from "./lib/mobile-wallet-support";
import { useDisallowedWallets } from "./lib/wallet-config-requirements";
import { addSentryBreadcrumb } from "./sentry";
import { API_SUPPORTED_CHAINS } from "./swapkit-context";
import type { ChainConfig, WalletConfig } from "./types";

// Wallets that route through WalletConnect under the hood and throw on connect
// without a Project ID. Hidden when the key is missing rather than letting the
// user tap into a guaranteed failure.
const WALLETS_REQUIRING_WALLETCONNECT_KEY = new Set<WalletOption>([WalletOption.TRUSTWALLET_WEB]);

type SwapKitConfigContextValue = {
  enabledWallets: WalletOption[] | "all";
  enabledChains: Chain[] | "all";
  /** API_SUPPORTED_CHAINS intersected with the integrator's selection. Prefer over re-filtering. */
  effectiveChains: Chain[];
  isWalletAllowed: (wallet: WalletOption) => boolean;
  isChainAllowed: (chain: Chain) => boolean;
  isDev: boolean;
};

const SwapKitConfigContext = createContext<SwapKitConfigContextValue>({
  effectiveChains: [],
  enabledChains: "all",
  enabledWallets: "all",
  isChainAllowed: () => true,
  isDev: false,
  isWalletAllowed: () => true,
});

/**
 * Parse wallet configuration from localStorage (persisted from settings panel)
 * Validates against current WalletOption enum values
 */
function parseWalletsFromLocalStorage(): WalletOption[] | "all" | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const formValues = localStorage.getItem("formValues");
    if (!formValues) return undefined;

    const parsed = JSON.parse(formValues);
    const enabledWalletOptions = parsed?.enabledWalletOptions;

    if (!enabledWalletOptions) return undefined;
    if (enabledWalletOptions === "all") return "all";

    // Validate array of wallet options
    if (Array.isArray(enabledWalletOptions)) {
      const walletValues = Object.values(WalletOption);
      const validatedWallets = enabledWalletOptions.filter((w) =>
        walletValues.includes(w as WalletOption),
      ) as WalletOption[];

      return validatedWallets.length > 0 ? validatedWallets : undefined;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

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

// Validates against the Chain enum so stale entries from an older schema
// don't crash the resolver. Same priority cascade as parseWalletsFromLocalStorage.
function parseChainsFromLocalStorage(): Chain[] | "all" | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const formValues = localStorage.getItem("formValues");
    if (!formValues) return undefined;
    const parsed = JSON.parse(formValues);
    const value = parsed?.enabledChains;
    if (value === "all") return "all";
    if (Array.isArray(value)) {
      const knownChains = new Set(Object.values(Chain));
      const validated = value.filter((c): c is Chain => knownChains.has(c as Chain));
      return validated.length > 0 ? validated : [];
    }
    return undefined;
  } catch {
    return undefined;
  }
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
}: {
  children: ReactNode;
  wallets?: WalletConfig;
  chains?: ChainConfig;
}) {
  // Track localStorage changes to re-compute enabled wallets
  const [localStorageVersion, setLocalStorageVersion] = useState(0);

  // Listen for storage events (changes from other tabs or same-tab updates)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "formValues") {
        setLocalStorageVersion((v) => v + 1);
      }
    };

    // Also listen for custom event dispatched when settings change in same tab
    const handleLocalUpdate = () => {
      setLocalStorageVersion((v) => v + 1);
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("swapkit-settings-changed", handleLocalUpdate);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("swapkit-settings-changed", handleLocalUpdate);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: localStorageVersion triggers re-read of localStorage
  const enabledWallets = useMemo(() => {
    // Priority order:
    // 1. localStorage (from settings panel)
    const localStorageWallets = parseWalletsFromLocalStorage();
    if (localStorageWallets !== undefined) return localStorageWallets;

    // 2. Widget prop
    // 3. Default "all"
    return resolveWalletConfig(wallets);
  }, [wallets, localStorageVersion]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: localStorageVersion triggers re-read of localStorage
  const enabledChains = useMemo((): Chain[] | "all" => {
    const localStorageChains = parseChainsFromLocalStorage();
    if (localStorageChains !== undefined) return localStorageChains;
    return resolveChainConfig(chains, ALL_CONTROLLABLE_CHAINS);
  }, [chains, localStorageVersion]);

  const chainBlockedWallets = useMemo(() => new Set(computeWalletsBlockedByChains(enabledChains)), [enabledChains]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: track config changes via localStorageVersion
  useEffect(() => {
    if (localStorageVersion > 0) {
      addSentryBreadcrumb("Config updated", "config", {
        enabledWallets: enabledWallets === "all" ? "all" : `${enabledWallets.length} wallets`,
      });
    }
  }, [localStorageVersion]);

  // UA-based, evaluated once on mount. Doesn't react to runtime UA changes — the
  // mobile/desktop split is fixed for the session. Tests that need to override
  // can mock `navigator.userAgent` before mount.
  const isMobile = useMemo(() => isMobileUserAgent(), []);

  const isDev = useStore(swapKitConfigStore, (state) => state?.envs?.isDev ?? false);
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
      if (!isDev && isExperimentalWallet(wallet)) return false;
      if (chainBlockedWallets.has(wallet)) return false;
      if (!hasWalletConnectProjectId && WALLETS_REQUIRING_WALLETCONNECT_KEY.has(wallet)) return false;
      if (disallowedWallets.has(wallet)) return false;
      if (enabledWallets === "all") return true;
      return enabledWallets.includes(wallet);
    };
  }, [enabledWallets, isMobile, isDev, chainBlockedWallets, hasWalletConnectProjectId, disallowedWallets]);

  const isChainAllowed = useMemo(() => {
    if (enabledChains === "all") return () => true;
    const set = new Set(enabledChains);
    return (chain: Chain) => set.has(chain);
  }, [enabledChains]);

  const effectiveChains = useMemo(() => API_SUPPORTED_CHAINS.filter((c) => isChainAllowed(c)), [isChainAllowed]);

  return (
    <SwapKitConfigContext.Provider
      value={{ effectiveChains, enabledChains, enabledWallets, isChainAllowed, isDev, isWalletAllowed }}>
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
