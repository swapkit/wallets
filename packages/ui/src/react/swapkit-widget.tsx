"use client";

import { MissingCredentialsWarning } from "./components/missing-credentials-warning";
import "@swapkit/ui/swapkit.css";
import { SKConfig, swapKitConfigStore } from "@swapkit/helpers";
import { parseAsString, useQueryStates } from "nuqs";
import { NuqsAdapter } from "nuqs/adapters/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand/react";
import { cn } from "../lib/utils";
import { SwapKitLogoHorizontalWhite } from "./assets/swapkit-logo-horizontal-white";
import { WidgetModeSwitcher } from "./components/composable/widget-mode-switcher";
import { getThemeTokenStyleProps, type SwapKitThemeTokens } from "./components/config";
import { ALL_WALLET_OPTIONS } from "./components/dialogs/wallet-connect-dialog";
import { WidgetErrorBoundary } from "./components/sentry-error-boundary";
import { ThemeStyleContext, useThemeStyle } from "./components/theme-style-context";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { type LimitFormPair, WidgetModesContext } from "./components/widget-modes-context";
import { useDebouncedEffect } from "./hooks/use-debounced-effect";
import { ModalSpawner } from "./hooks/use-modal";
import { useTokenPricesQuery } from "./hooks/use-token-prices";
import { useApplyWidgetSKConfig } from "./hooks/use-widget-sk-config";
import { SwapKitQueryClientProvider } from "./lib/query-client";
import { startTransactionTracking } from "./lib/transaction-tracker";
import { resolveWidgetModes } from "./lib/widget-modes";
import { resetLimitOrderStore, useLimitOrderStore } from "./modes/limit/limit-order-store";
import { LimitPanel } from "./modes/limit/limit-panel";
import { SwapPanel } from "./modes/swap/swap-panel";
import { captureWidgetError, disableTelemetry, initSentry } from "./sentry";
import { resetWidgetFormStore, useWidgetFormStore } from "./stores/widget-form-store";
import { SwapKitConfigProvider, useWalletsConfig } from "./swapkit-config-context";
import { GAS_ASSET_IDS, scheduleBackgroundTokenLoad, useSwapKit } from "./swapkit-context";
import type { ChainConfig, WalletConfig, WidgetMode } from "./types";

export type SwapKitWidgetProps = {
  /** Widget ID (UUID) — required alongside `widgetKey` for HMAC auth. */
  widgetId?: string;
  /** Widget secret used to sign requests. Pair with `widgetId`. Mutually exclusive with `apiKey`. */
  widgetKey?: string;
  /** API key for authenticating requests. Takes precedence over widget auth. */
  apiKey?: string;
  apiBaseUrl?: string | null;
  inputAsset?: string | null;
  outputAsset?: string | null;
  /** URL of an integrator-provided logo displayed in the widget header. */
  logoUrl?: string | null;
  /** Show the widget logo above the permanent SwapKit attribution. Defaults to true. */
  showLogo?: boolean;
  className?: string;
  /** Custom theme tokens. Color values use HSL format: "H S% L%" or "H S% L% / A". */
  theme?: SwapKitThemeTokens;
  /** @deprecated Use `theme` instead. */
  colors?: SwapKitThemeTokens;
  /** Configuration for which wallets to show. Defaults to showing all wallets. */
  wallets?: WalletConfig;
  /**
   * Configuration for which chains the widget should operate on. Defaults to all
   * API-supported chains. Disabling a chain hides it from the asset selector and
   * auto-disables wallets whose only chains are dropped (e.g. removing Ripple
   * removes Xaman).
   */
  chains?: ChainConfig;
  /** Disable widget telemetry (Sentry). Off by default — we collect errors so we can fix them. */
  disableTelemetry?: boolean;
  /**
   * Toggle developer mode. Mirrors the web component's `develop-mode` attribute —
   * sets `SKConfig.envs.isDev`, which enables experimental wallets and the
   * dev-only API URL when paired with `devApiUrl`.
   */
  developMode?: boolean;
  /**
   * Show wallets and chains that are still experimental, without switching to dev mode
   * or the dev API. Mirrors the web component's `show-experimental-wallets` attribute.
   */
  showExperimentalWallets?: boolean;
  /** Override the API URL used when `developMode` is true. Mirrors `dev-api-url`. */
  devApiUrl?: string | null;
  /**
   * SKConfig credentials payload — typically `{ apiKeys: { walletConnectProjectId, ... }, integrations: {...} }`.
   * Mirrors the web component's `config` JSON attribute. Merged into the global
   * SKConfig store before any wallet connect, so wallet/integration credentials
   * are available on first paint.
   */
  config?: { apiKeys?: Record<string, unknown>; integrations?: Record<string, unknown> };
  allowDerivationSelection?: boolean;
  modes?: WidgetMode[];
  /** Sync amount and selected assets to the URL query string. Disabled by default; the studio enables it. */
  syncUrl?: boolean;
};

export function SwapKitWidget(props: SwapKitWidgetProps) {
  const { apiBaseUrl, apiKey, config, devApiUrl, developMode, widgetId, widgetKey } = props;
  useApplyWidgetSKConfig({ apiBaseUrl, apiKey, config, devApiUrl, developMode, widgetId, widgetKey });

  const themeTokens = props.theme ?? props.colors;
  // Shared through context so portaled content can apply the same variables inline
  const themeStyle = useMemo(() => getThemeTokenStyleProps(themeTokens), [themeTokens]);

  return (
    // NuqsAdapter is required for `useQueryState` calls inside the widget
    // (amount + selected asset URL sync). The web component wraps its own
    // adapter at the root; React consumers used to have to remember to do
    // the same — now bundled here so `<SwapKitWidget />` works out of the box.
    // If a host app already provides an outer NuqsAdapter (e.g. a Next.js
    // app using `nuqs/adapters/next`), nesting is harmless — nuqs reads
    // from the nearest adapter context.
    <NuqsAdapter>
      <SwapKitQueryClientProvider>
        <WidgetErrorBoundary>
          <SwapKitConfigProvider
            allowDerivationSelection={props.allowDerivationSelection}
            chains={props.chains}
            showExperimentalWallets={props.showExperimentalWallets}
            wallets={props.wallets}>
            <ThemeStyleContext.Provider value={themeStyle}>
              <SwapKitWidgetInner {...props} />
            </ThemeStyleContext.Provider>
          </SwapKitConfigProvider>
        </WidgetErrorBoundary>
      </SwapKitQueryClientProvider>
    </NuqsAdapter>
  );
}

const ASSET_PAIR_PARAMS = { input_asset: parseAsString, output_asset: parseAsString };

function useLimitFormOpener({ selectMode, syncUrl }: { selectMode: (mode: WidgetMode) => void; syncUrl: boolean }) {
  const [, setPairParams] = useQueryStates(ASSET_PAIR_PARAMS);

  return useCallback(
    ({ buyAsset, sellAsset }: LimitFormPair) => {
      const { pendingOperation, setInputAsset, setOutputAsset } = useWidgetFormStore.getState();
      if (pendingOperation) return;
      if (!useLimitOrderStore.getState().held) {
        if (syncUrl) {
          void setPairParams({ input_asset: sellAsset, output_asset: buyAsset });
        } else {
          setInputAsset(sellAsset);
          setOutputAsset(buyAsset);
        }
      }
      selectMode("limit");
    },
    [selectMode, setPairParams, syncUrl],
  );
}

function getSwapKitConfig() {
  const { envs, v3SwapFlow } = SKConfig.getState();
  return { envs, v3SwapFlow };
}

function SwapKitWidgetInner({
  apiBaseUrl,
  inputAsset: initialInputAsset,
  logoUrl,
  showLogo,
  outputAsset: initialOutputAsset,
  className,
  disableTelemetry: disableTelemetryProp,
  modes: modesProp,
  syncUrl = false,
}: Omit<SwapKitWidgetProps, "wallets">) {
  useEffect(() => startTransactionTracking(), []);

  const isDev = useStore(swapKitConfigStore, (state) => state?.envs?.isDev ?? false);
  const modesKey = JSON.stringify(modesProp ?? null);
  const modes = useMemo(() => resolveWidgetModes({ isDev, modes: JSON.parse(modesKey) }), [isDev, modesKey]);
  const [selectedMode, setSelectedMode] = useState<WidgetMode>(() => modes[0]);
  const activeMode = modes.includes(selectedMode) ? selectedMode : modes[0];
  const openLimitForm = useLimitFormOpener({ selectMode: setSelectedMode, syncUrl });
  const modesContext = useMemo(() => ({ modes, openLimitForm }), [modes, openLimitForm]);
  useEffect(
    () => () => {
      resetWidgetFormStore();
      resetLimitOrderStore();
    },
    [],
  );
  const isOperationPending = useWidgetFormStore((state) => state.pendingOperation !== null);

  const modeSwitcher =
    modes.length > 1 ? (
      <WidgetModeSwitcher
        activeMode={activeMode}
        disabled={isOperationPending}
        modes={modes}
        onModeChange={setSelectedMode}
      />
    ) : undefined;

  useEffect(() => {
    if (disableTelemetryProp) {
      disableTelemetry();
      return;
    }
    initSentry();
  }, [disableTelemetryProp]);

  // Provided by `SwapKitWidget`; portaled content (dialogs, drawers, tooltips) reads the same context
  const themeStyle = useThemeStyle();

  useEffect(() => {
    scheduleBackgroundTokenLoad();
  }, []);

  const { enabledWallets } = useWalletsConfig();
  const walletOptionsToLoad = useMemo(
    () => (enabledWallets === "all" ? ALL_WALLET_OPTIONS : enabledWallets),
    [enabledWallets],
  );

  const { loadSwapKit } = useSwapKit();
  useTokenPricesQuery(GAS_ASSET_IDS);

  const isInitialLoad = useRef(true);

  // Load SDK in background on initial mount (non-blocking)
  useEffect(() => {
    if (!isInitialLoad.current) return;

    const initSdk = () => {
      const config = getSwapKitConfig();
      loadSwapKit({ config, walletOptions: walletOptionsToLoad }).catch((error) => {
        captureWidgetError(error, { category: "wallet", tags: { action: "load_swapkit" } });
      });
      isInitialLoad.current = false;
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(initSdk, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }

    const timeoutId = setTimeout(initSdk, 0);
    return () => clearTimeout(timeoutId);
  }, [loadSwapKit, walletOptionsToLoad]);

  // Handle config changes after initial load — rebuild the SDK so toolboxes pick up
  // fresh SKConfig values (apiKey, isDev, apiUrl). Wallet modules are cached, so
  // this is a cheap rebuild, not a re-import.
  useDebouncedEffect(
    () => {
      if (isInitialLoad.current) return;

      const config = getSwapKitConfig();
      loadSwapKit({ config, walletOptions: walletOptionsToLoad }).catch((error) => {
        captureWidgetError(error, { category: "wallet", tags: { action: "load_swapkit" } });
      });
    },
    [apiBaseUrl, loadSwapKit, walletOptionsToLoad],
    { delay: 700, runImmediately: false },
  );

  return (
    <div
      className={cn(
        "swapkit-ui-preflight swapkit-widget-target sk-ui-relative sk-ui-flex sk-ui-flex-col sk-ui-gap-4",
        className,
      )}
      style={themeStyle}>
      <MissingCredentialsWarning />
      <TooltipProvider delayDuration={500}>
        <WidgetModesContext.Provider value={modesContext}>
          {activeMode === "limit" ? (
            <LimitPanel
              initialInputAsset={initialInputAsset}
              initialOutputAsset={initialOutputAsset}
              logoUrl={logoUrl}
              modeSwitcher={modeSwitcher}
              showLogo={showLogo}
              syncUrl={syncUrl}
            />
          ) : (
            <SwapPanel
              initialInputAsset={initialInputAsset}
              initialOutputAsset={initialOutputAsset}
              logoUrl={logoUrl}
              modeSwitcher={modeSwitcher}
              showLogo={showLogo}
              syncUrl={syncUrl}
            />
          )}

          <Toaster position="bottom-right" />
          <ModalSpawner />
        </WidgetModesContext.Provider>
      </TooltipProvider>
      <div
        className="sk-ui-absolute sk-ui-right-0 sk-ui-flex sk-ui-select-none sk-ui-items-center sk-ui-gap-1 sk-ui-text-[10px] sk-ui-leading-none"
        style={{ bottom: -14 }}>
        Powered by
        <SwapKitLogoHorizontalWhite className="sk-ui-h-2.5 sk-ui-w-auto" />
      </div>
    </div>
  );
}
