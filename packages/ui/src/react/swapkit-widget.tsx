"use client";

import "@swapkit/ui/swapkit.css";
import { AssetValue, Chain, type ChainId, ChainToChainId, SKConfig } from "@swapkit/helpers";
import {
  type QuoteResponseRoute,
  type StellarApprovalTransaction,
  SwapKitApi,
  type SwapRouteV2Response,
  TxnStatus,
} from "@swapkit/helpers/api";
import { AlertTriangleIcon, ArrowDownUpIcon, HistoryIcon, Loader2Icon, LogOutIcon, Wallet2Icon } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { NuqsAdapter } from "nuqs/adapters/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { match, P } from "ts-pattern";
import { cn, formatTokenAmount } from "../lib/utils";
import { SwapKitLogoHorizontalWhite } from "./assets/swapkit-logo-horizontal-white";
import { DestinationAddressInput } from "./components/composable/destination-address-input";
import { SwapInputWithChainSelector } from "./components/composable/swap-input-chain-selector";
import { SwapQuotePreview } from "./components/composable/swap-quote-preview";
import { showTransactionHistoryDrawer } from "./components/composable/transaction-history-drawer";
import { applyThemeTokensToElement, type SwapKitThemeTokens } from "./components/config";
import { ApprovalConfirmDialog } from "./components/dialogs/approval-confirm-dialog";
import { SwapConfirmDialog } from "./components/dialogs/swap-confirm-dialog";
import { ALL_WALLET_OPTIONS, WalletConnectDialog } from "./components/dialogs/wallet-connect-dialog";
import { WidgetErrorBoundary } from "./components/sentry-error-boundary";
import { QuoteRefreshButton } from "./components/simple/quote-refresh-button";
import { SwapSuccessToast } from "./components/simple/swap-success-toast";
import { WalletIcon } from "./components/simple/wallet-icon";
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
import { SWAPKIT_WIDGET_TOASTER_ID, Toaster, toast } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { useDebouncedEffect } from "./hooks/use-debounced-effect";
import { useDevRequestParams } from "./hooks/use-dev-request-params";
import { ModalSpawner, showModal } from "./hooks/use-modal";
import { useSwapQuote } from "./hooks/use-swap-quote";
import { useSwapTo } from "./hooks/use-swap-to";
import { useTokenPrices } from "./hooks/use-token-prices";
import { useTransactionTracker } from "./hooks/use-transaction-tracker";
import { pickDefaultAssetPair } from "./lib/chain-catalog";
import { decodeApproveSpender } from "./lib/decode-approve-spender";
import {
  addSentryBreadcrumb,
  captureWidgetError,
  disableTelemetry,
  initSentry,
  isErrorCaptured,
  setSentryContext,
} from "./sentry";
import {
  type TransactionStatus,
  type TransactionType,
  useTransactionHistory,
} from "./stores/transaction-history-store";
import { SwapKitConfigProvider, useWalletsConfig } from "./swapkit-config-context";
import { API_SUPPORTED_CHAINS, scheduleBackgroundTokenLoad, useSwapKit } from "./swapkit-context";
import { showSwapKitWalletDrawer } from "./swapkit-wallet-drawer";
import type { ChainConfig, WalletConfig } from "./types";

const DEFAULT_INPUT_ASSET = "BTC.BTC";
const DEFAULT_OUTPUT_ASSET = "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7";
const DEFAULT_API_URL = SKConfig.getState().envs.apiUrl;
const DEFAULT_DEV_API_URL = SKConfig.getState().envs.devApiUrl;

/** Normalizes a URL by adding http:// scheme if missing */
function normalizeApiUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  // If URL already has a scheme, return as-is
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  // Add http:// for localhost, https:// for everything else
  if (trimmed.startsWith("localhost") || trimmed.startsWith("127.0.0.1")) {
    return `http://${trimmed}`;
  }

  return `https://${trimmed}`;
}

function hasSwapToCredentials({
  apiKey,
  widgetId,
  widgetKey,
}: {
  apiKey: string | undefined;
  widgetId: string | undefined;
  widgetKey: string | undefined;
}) {
  const configuredApiKey = SKConfig.get("apiKeys")?.swapKit;
  const configuredWidgetId = SKConfig.get("widgetId");
  const configuredWidgetKey = SKConfig.get("widgetKey");

  return (
    Boolean((apiKey ?? "").trim()) ||
    Boolean((widgetId ?? "").trim() && (widgetKey ?? "").trim()) ||
    Boolean(configuredApiKey) ||
    Boolean(configuredWidgetId && configuredWidgetKey)
  );
}

const EVM_CHAINS = [
  Chain.Ethereum,
  Chain.Arbitrum,
  Chain.Avalanche,
  Chain.Base,
  Chain.BinanceSmartChain,
  Chain.Berachain,
  Chain.Gnosis,
  Chain.Monad,
  Chain.Optimism,
  Chain.Polygon,
  Chain.XLayer,
] as const;

type ApprovalTx = { data: string; from: string; to: string; value?: string };
type EVMWallet = {
  sendTransaction: (tx: { data: string; from: string; to: string; value: bigint }) => Promise<string>;
};

function isStellarApprovalTx(approvalTx: SwapRouteV2Response["approvalTx"]): approvalTx is StellarApprovalTransaction {
  return !!approvalTx && "txType" in approvalTx && approvalTx.txType === "STELLAR";
}

// HTTP 400 destinationTrustlineRequired with data.reason "account_not_funded": the
// destination account doesn't exist on Stellar, so a changeTrust can't even be built.
function isStellarAccountNotFundedError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const info = (error as { info?: unknown }).info;
  if (typeof info !== "object" || info === null) return false;
  const { data, error: errorCode } = info as { data?: unknown; error?: unknown };
  if (errorCode !== "destinationTrustlineRequired") return false;
  return typeof data === "object" && data !== null && (data as { reason?: unknown }).reason === "account_not_funded";
}

function useWidgetStateParam(
  key: string,
  defaultValue: string,
  syncUrl: boolean,
): readonly [string, (value: string) => void] {
  const [queryValue, setQueryValue] = useQueryState(key, parseAsString.withDefault(defaultValue));
  const [localValue, setLocalValue] = useState(defaultValue);
  const previousDefaultValueRef = useRef(defaultValue);

  useEffect(() => {
    if (syncUrl || previousDefaultValueRef.current === defaultValue) return;

    previousDefaultValueRef.current = defaultValue;
    setLocalValue(defaultValue);
  }, [defaultValue, syncUrl]);

  const setValue = useCallback(
    (value: string) => {
      if (syncUrl) {
        void setQueryValue(value);
        return;
      }

      setLocalValue(value);
    },
    [setQueryValue, syncUrl],
  );

  return [syncUrl ? queryValue : localValue, setValue] as const;
}

async function handleApprovalIfNeeded({
  addTransaction,
  approvalTx,
  getRouteParams,
  route,
  sourceAsset,
  wallet,
}: {
  addTransaction: (tx: {
    chainId: ChainId;
    hash: string;
    sellAmount: string;
    sellAsset: string;
    status: TransactionStatus;
    type: TransactionType;
  }) => void;
  approvalTx: ApprovalTx;
  getRouteParams: { destinationAddress: string; routeId: string; sourceAddress: string };
  route: QuoteResponseRoute;
  sourceAsset: AssetValue;
  wallet: EVMWallet;
}): Promise<{ confirmed: false } | { confirmed: true; updatedRoute: SwapRouteV2Response }> {
  const { confirmed: approvalConfirmed } = await showModal(
    <ApprovalConfirmDialog
      amount={route.sellAmount}
      onApproveClick={async () => {
        const approvalTxHash = await wallet.sendTransaction({
          data: approvalTx.data,
          from: approvalTx.from,
          to: approvalTx.to,
          value: BigInt(approvalTx.value || "0"),
        });

        addTransaction({
          chainId: ChainToChainId[sourceAsset.chain],
          hash: String(approvalTxHash),
          sellAmount: route.sellAmount,
          sellAsset: sourceAsset.toString(),
          status: "pending",
          type: "approval",
        });

        try {
          await waitForTransactionConfirmation(String(approvalTxHash), sourceAsset.chain);
          toast.success(`Approval confirmed: ${String(approvalTxHash).slice(0, 10)}...`, {
            toasterId: SWAPKIT_WIDGET_TOASTER_ID,
          });
        } catch (error) {
          captureWidgetError(error, { category: "transaction", tags: { stage: "approval_confirm" } });
          console.warn("Failed to wait for approval confirmation:", error);
          toast.warning(`Approval sent: ${String(approvalTxHash).slice(0, 10)}... - proceeding with caution`, {
            toasterId: SWAPKIT_WIDGET_TOASTER_ID,
          });
        }
      }}
      spenderAddress={decodeApproveSpender(approvalTx.data)}
      tokenAsset={route.sellAsset}
    />,
  );

  if (!approvalConfirmed) {
    return { confirmed: false };
  }

  try {
    const updatedRoute = await SwapKitApi.getRouteWithTx(getRouteParams);
    return { confirmed: true, updatedRoute };
  } catch (error) {
    captureWidgetError(error, {
      category: "transaction",
      tags: { provider: route?.providers?.[0] ?? "unknown", stage: "approval" },
    });
    throw error;
  }
}

async function waitForTransactionConfirmation(hash: string, chain: Chain): Promise<void> {
  const chainId = ChainToChainId[chain];
  const maxAttempts = 20;
  const pollInterval = 3000;
  let attempts = 0;
  let pollingErrorCaptured = false;

  while (attempts < maxAttempts) {
    try {
      const response = await SwapKitApi.getTrackerDetails({ chainId, hash });

      const status = response.status || response.legs?.[0]?.status;
      const isTerminal = status === TxnStatus.completed || status === TxnStatus.failed || status === TxnStatus.refunded;
      if (isTerminal && status !== TxnStatus.completed) {
        const txError = new Error(`Transaction ${status}`);
        captureWidgetError(txError, { category: "transaction", tags: { stage: "confirm", status } });
        throw txError;
      }
      if (isTerminal) return;
    } catch (error) {
      if (!pollingErrorCaptured && !isErrorCaptured(error)) {
        captureWidgetError(error, { category: "api", extra: { chain, hash }, tags: { endpoint: "tracker" } });
        pollingErrorCaptured = true;
      }
      if (error instanceof Error && (error.message.includes("failed") || error.message.includes("refunded"))) {
        throw error;
      }
    }

    attempts++;
    if (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error("Transaction confirmation timeout - please check manually");
}

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
  /** Override the API URL used when `developMode` is true. Mirrors `dev-api-url`. */
  devApiUrl?: string | null;
  /**
   * SKConfig credentials payload — typically `{ apiKeys: { walletConnectProjectId, ... }, integrations: {...} }`.
   * Mirrors the web component's `config` JSON attribute. Merged into the global
   * SKConfig store before any wallet connect, so wallet/integration credentials
   * are available on first paint.
   */
  config?: { apiKeys?: Record<string, unknown>; integrations?: Record<string, unknown> };
  /** Sync amount and selected assets to the URL query string. Disabled by default; the studio enables it. */
  syncUrl?: boolean;
};

export function SwapKitWidget(props: SwapKitWidgetProps) {
  useTransactionTracker();

  return (
    // NuqsAdapter is required for `useQueryState` calls inside the widget
    // (amount + selected asset URL sync). The web component wraps its own
    // adapter at the root; React consumers used to have to remember to do
    // the same — now bundled here so `<SwapKitWidget />` works out of the box.
    // If a host app already provides an outer NuqsAdapter (e.g. a Next.js
    // app using `nuqs/adapters/next`), nesting is harmless — nuqs reads
    // from the nearest adapter context.
    <NuqsAdapter>
      <WidgetErrorBoundary>
        <SwapKitConfigProvider chains={props.chains} wallets={props.wallets}>
          <SwapKitWidgetInner {...props} />
        </SwapKitConfigProvider>
      </WidgetErrorBoundary>
    </NuqsAdapter>
  );
}

function SwapKitWidgetInner({
  widgetId,
  widgetKey,
  apiKey,
  apiBaseUrl,
  inputAsset: initialInputAsset,
  outputAsset: initialOutputAsset,
  className,
  theme,
  colors: propColors,
  disableTelemetry: disableTelemetryProp,
  developMode,
  devApiUrl,
  config: configProp,
  syncUrl = false,
}: Omit<SwapKitWidgetProps, "wallets">) {
  useEffect(() => {
    if (disableTelemetryProp) {
      disableTelemetry();
      return;
    }
    initSentry();
  }, [disableTelemetryProp]);

  // Merge any wallet/integration credentials (apiKeys, integrations) from the
  // `config` prop into SKConfig before mounting children. Mirrors the WC's
  // walletConfig handling at swapkit-widget-web-component.tsx:219-225.
  useEffect(() => {
    if (!configProp) return;
    try {
      SKConfig.set(configProp as Parameters<typeof SKConfig.set>[0]);
    } catch (error) {
      console.warn("[SwapKit] Failed to apply `config` prop payload:", error);
    }
  }, [configProp]);

  // Dev-mode/env flags. Mirrors WC's setEnv calls at swapkit-widget-web-component.tsx:253-256.
  useEffect(() => {
    SKConfig.setEnv("apiUrl", normalizeApiUrl(apiBaseUrl) ?? DEFAULT_API_URL);
    SKConfig.setEnv("isDev", developMode ?? false);
    SKConfig.setEnv("devApiUrl", normalizeApiUrl(devApiUrl) ?? DEFAULT_DEV_API_URL);
  }, [apiBaseUrl, developMode, devApiUrl]);

  // V3 swap flow is always on for embedded widgets. Mirrors WC at :259.
  useEffect(() => {
    SKConfig.set({ v3SwapFlow: { enabled: true } });
  }, []);

  const themeTokens = theme ?? propColors;

  const widgetRef = useRef<HTMLDivElement>(null);

  // Apply theme tokens via DOM manipulation to ensure proper CSS variable cascading
  // (derived variables like --sk-ui-card reference base variables like --sk-bg-surface)
  useEffect(() => {
    if (widgetRef.current && themeTokens) {
      applyThemeTokensToElement(widgetRef.current, themeTokens);
    }
  }, [themeTokens]);

  useEffect(() => {
    scheduleBackgroundTokenLoad();
  }, []);

  const { enabledWallets, effectiveChains, isChainAllowed } = useWalletsConfig();
  const walletOptionsToLoad = useMemo(
    () => (enabledWallets === "all" ? ALL_WALLET_OPTIONS : enabledWallets),
    [enabledWallets],
  );

  const defaultAssetPair = useMemo(() => pickDefaultAssetPair(effectiveChains), [effectiveChains]);

  const [amount, setAmount] = useWidgetStateParam("amount", "", syncUrl);
  const [inputAsset, setInputAsset] = useWidgetStateParam(
    "input_asset",
    initialInputAsset || defaultAssetPair.input,
    syncUrl,
  );
  const [outputAsset, setOutputAsset] = useWidgetStateParam(
    "output_asset",
    initialOutputAsset || defaultAssetPair.output,
    syncUrl,
  );
  const [isSwapping, setIsSwapping] = useState(false);
  const [addressForInputAsset, setAddressForInputAsset] = useState<string | undefined>();
  const [customDestinationAddress, setCustomDestinationAddress] = useState("");
  const [isDestinationFieldExpanded, setIsDestinationFieldExpanded] = useState(false);
  const [destinationAddressError, setDestinationAddressError] = useState<string | null>(null);
  const [isCustomAddressValidated, setIsCustomAddressValidated] = useState(false);

  const {
    swapKit,
    loadSwapKit,
    isWalletConnected,
    walletType,
    eip6963WalletInfo,
    disconnectWallet,
    balancesByChain,
    checkIfChainConnected,
  } = useSwapKit();
  const { clearTokenPrices, fetchTokenPrices } = useTokenPrices();
  const { addTransaction } = useTransactionHistory();
  const { swapParams: devSwapParams } = useDevRequestParams();

  const hasApiCredentials = hasSwapToCredentials({ apiKey, widgetId, widgetKey });
  const { fetchSwapQuote, isFetchingQuote, selectedRoute, setSelectedRouteIndex, routes, reset } = useSwapQuote({
    amount,
    enabled: hasApiCredentials,
    inputAsset,
    outputAsset,
  });

  // Update Sentry context when a route is selected
  // biome-ignore lint/correctness/useExhaustiveDependencies: only fire when routeId changes
  useEffect(() => {
    if (selectedRoute?.route) {
      setSentryContext({ currentProvider: selectedRoute.route.providers?.[0], routeId: selectedRoute.route.routeId });
      addSentryBreadcrumb("Route selected", "ui", {
        provider: selectedRoute.route.providers?.[0],
        routeId: selectedRoute.route.routeId,
      });
    }
  }, [selectedRoute?.route?.routeId]);

  // Fetch available output assets based on selected input asset.
  useSwapTo(inputAsset, { enabled: hasApiCredentials });

  const inputAssetChain = useMemo(() => {
    if (!inputAsset) return undefined;
    try {
      return AssetValue.from({ asset: inputAsset }).chain;
    } catch {
      return undefined;
    }
  }, [inputAsset]);

  const outputAssetChain = useMemo(() => {
    if (!outputAsset) return undefined;
    try {
      return AssetValue.from({ asset: outputAsset }).chain;
    } catch {
      return undefined;
    }
  }, [outputAsset]);

  // The previous-default ref distinguishes "user picked this" from "we picked
  // this" — current === previous default means the user never overrode the
  // picker, so we're free to promote a new default. Without this, broadening
  // the chain set would clobber any same-chain pair the user picked manually.
  const previousDefaultPair = useRef(defaultAssetPair);
  useEffect(() => {
    const prev = previousDefaultPair.current;
    const inputDisallowed = inputAssetChain && !isChainAllowed(inputAssetChain);
    const outputDisallowed = outputAssetChain && !isChainAllowed(outputAssetChain);
    const inputUntouched = inputAsset === prev.input;
    const outputUntouched = outputAsset === prev.output;
    const defaultsChanged = prev.input !== defaultAssetPair.input || prev.output !== defaultAssetPair.output;

    if (inputDisallowed || (defaultsChanged && inputUntouched)) {
      setInputAsset(defaultAssetPair.input);
    }
    if (outputDisallowed || (defaultsChanged && outputUntouched)) {
      setOutputAsset(defaultAssetPair.output);
    }
    previousDefaultPair.current = defaultAssetPair;
  }, [
    inputAsset,
    outputAsset,
    inputAssetChain,
    outputAssetChain,
    isChainAllowed,
    defaultAssetPair,
    setInputAsset,
    setOutputAsset,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute when wallet state changes
  const isInputChainConnected = useMemo(
    () => (inputAssetChain ? checkIfChainConnected(inputAssetChain) : false),
    [inputAssetChain, checkIfChainConnected, isWalletConnected, balancesByChain],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute when wallet state changes
  const isOutputChainConnected = useMemo(
    () => (outputAssetChain ? checkIfChainConnected(outputAssetChain) : false),
    [outputAssetChain, checkIfChainConnected, isWalletConnected, balancesByChain],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute when wallet state changes
  const walletDestinationAddress = useMemo(
    () => (outputAssetChain && swapKit ? swapKit.getAddress(outputAssetChain) : ""),
    [outputAssetChain, swapKit, isWalletConnected, balancesByChain],
  );

  const effectiveDestinationAddress = customDestinationAddress || walletDestinationAddress;

  // Validate custom destination address with debounce
  useDebouncedEffect(
    () => {
      if (!customDestinationAddress || !outputAssetChain || !swapKit) {
        setDestinationAddressError(null);
        setIsCustomAddressValidated(false);
        return;
      }

      let cancelled = false;

      void swapKit.validateAddress({ address: customDestinationAddress, chain: outputAssetChain }).then((isValid) => {
        if (cancelled) return;
        setDestinationAddressError(isValid ? null : `Invalid ${outputAssetChain} address`);
        setIsCustomAddressValidated(isValid);
      });

      return () => {
        cancelled = true;
      };
    },
    [customDestinationAddress, outputAssetChain, swapKit],
    { delay: 500, runImmediately: false },
  );

  // Reset destination address state when output chain changes or wallet disconnects
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on chain/wallet change
  useEffect(() => {
    setCustomDestinationAddress("");
    setIsDestinationFieldExpanded(false);
    setDestinationAddressError(null);
    setIsCustomAddressValidated(false);
  }, [outputAssetChain, isWalletConnected]);

  const inputAssetBalance = useMemo(() => {
    if (!inputAsset || !isWalletConnected) return null;
    const parsedAsset = AssetValue.from({ asset: inputAsset });
    const chainBalances = balancesByChain.get(parsedAsset.chain);
    return chainBalances?.find((b) => b.balance.toString().toLowerCase() === inputAsset.toLowerCase())?.balance;
  }, [inputAsset, isWalletConnected, balancesByChain]);

  const hasInsufficientBalance = useMemo(() => {
    if (!inputAssetBalance || !amount || !inputAsset) return false;
    try {
      const inputAmount = AssetValue.from({ asset: inputAsset, value: amount });
      return inputAmount.gt(inputAssetBalance);
    } catch {
      // Invalid amount string (e.g., non-numeric input)
      return false;
    }
  }, [inputAssetBalance, amount, inputAsset]);

  const isInitialLoad = useRef(true);

  const getSwapKitConfig = useCallback(() => {
    const { envs, v3SwapFlow } = SKConfig.getState();

    return { envs: { ...envs, ...(apiBaseUrl && { apiUrl: normalizeApiUrl(apiBaseUrl) }) }, v3SwapFlow };
  }, [apiBaseUrl]);

  // Keep a live ref to the current auth props so the debounced config effect
  // always reads the freshest values — avoids a stale-closure race where a
  // pending debounced call could overwrite fresh auth with an older key.
  const authPropsRef = useRef({ apiKey, widgetId, widgetKey });
  authPropsRef.current = { apiKey, widgetId, widgetKey };

  const applyAuthConfig = useCallback(() => {
    const { apiKey: currentApiKey, widgetId: currentWidgetId, widgetKey: currentWidgetKey } = authPropsRef.current;
    // apiKey takes precedence over widget auth, matching the web-component behavior.
    if (currentApiKey) {
      SKConfig.set({ apiKeys: { swapKit: currentApiKey } });
      SKConfig.setWidgetId("");
      SKConfig.setWidgetKey("");
    } else if (currentWidgetId && currentWidgetKey) {
      SKConfig.set({ apiKeys: { swapKit: "" } });
      SKConfig.setWidgetId(currentWidgetId);
      SKConfig.setWidgetKey(currentWidgetKey);
    }
  }, []);

  // Apply auth synchronously during the first render so any API call fired
  // from a sibling effect finds populated headers. SKConfig is a zustand store — sync
  // writes from render are safe because they don't touch React's own state
  // graph. Subsequent renders skip the apply; prop changes are re-applied
  // through the debounced effect below.
  const authBootRef = useRef(false);
  if (!authBootRef.current) {
    authBootRef.current = true;
    applyAuthConfig();
  }

  // Clear auth from the shared SKConfig singleton on unmount so a subsequently
  // mounted widget (or host code path) doesn't inherit this instance's keys.
  useEffect(() => {
    return () => {
      SKConfig.set({ apiKeys: { swapKit: "" } });
      SKConfig.setWidgetId("");
      SKConfig.setWidgetKey("");
    };
  }, []);

  // Load SDK in background on initial mount (non-blocking)
  useEffect(() => {
    if (!isInitialLoad.current) return;

    applyAuthConfig();

    const effectiveWidgetId = widgetId || SKConfig.get("widgetId");
    const effectiveWidgetKey = widgetKey || SKConfig.get("widgetKey");
    const hasWidgetAuth = effectiveWidgetId && effectiveWidgetKey;
    const hasApiKey = apiKey || SKConfig.get("apiKeys")?.swapKit;
    const hasPartialWidgetAuth = !hasWidgetAuth && Boolean(effectiveWidgetId) !== Boolean(effectiveWidgetKey);
    if (hasPartialWidgetAuth && !hasApiKey) {
      console.warn(
        "[SwapKit] Partial widget auth: widgetId and widgetKey must be set together. Requests will fail authentication.",
      );
    } else if (!hasWidgetAuth && !hasApiKey) {
      console.warn(
        "[SwapKit] No widget auth or api-key configured. API requests will fail authentication. " +
          "Pass both widgetId + widgetKey, or apiKey, or configure auth via SKConfig.",
      );
    }

    const initSdk = () => {
      const config = getSwapKitConfig();
      void loadSwapKit({ config, walletOptions: walletOptionsToLoad });
      isInitialLoad.current = false;
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(initSdk, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }

    const timeoutId = setTimeout(initSdk, 0);
    return () => clearTimeout(timeoutId);
  }, [widgetId, widgetKey, apiKey, applyAuthConfig, getSwapKitConfig, loadSwapKit, walletOptionsToLoad]);

  // Handle config changes after initial load — rebuild the SDK so toolboxes pick up
  // fresh SKConfig values (apiKey, isDev, apiUrl). Wallet modules are cached, so
  // this is a cheap rebuild, not a re-import.
  useDebouncedEffect(
    () => {
      if (isInitialLoad.current) return;

      applyAuthConfig();

      const config = getSwapKitConfig();
      void loadSwapKit({ config, walletOptions: walletOptionsToLoad });
    },
    [applyAuthConfig, getSwapKitConfig, loadSwapKit, walletOptionsToLoad],
    { delay: 700, runImmediately: false },
  );

  useEffect(() => {
    if (!hasApiCredentials) {
      clearTokenPrices();
      return;
    }

    const gasIdentifiers: string[] = [];
    for (const chain of API_SUPPORTED_CHAINS.slice(0, 10)) {
      try {
        const id = AssetValue.from({ chain }).toString();
        gasIdentifiers.push(id);
      } catch (error) {
        console.error(`[SwapKit] AssetValue.from({ chain: "${chain}" }) failed:`, error);
      }
    }

    console.debug("[SwapKit] Price fetch identifiers:", {
      gasIdentifiers,
      inputAsset: inputAsset || DEFAULT_INPUT_ASSET,
      outputAsset: outputAsset || DEFAULT_OUTPUT_ASSET,
      staticAssetsLoaded:
        (AssetValue as unknown as { getStaticAssets?: () => Map<string, unknown> }).getStaticAssets?.()?.size ??
        "getStaticAssets not available",
    });

    const tokensToFetch = [inputAsset || DEFAULT_INPUT_ASSET, outputAsset || DEFAULT_OUTPUT_ASSET, ...gasIdentifiers];

    const uniqueTokensToFetch = new Set(tokensToFetch);

    void fetchTokenPrices(Array.from(uniqueTokensToFetch));
  }, [clearTokenPrices, hasApiCredentials, inputAsset, outputAsset, fetchTokenPrices]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: balancesByChain needed to re-run effect on wallet connect
  useEffect(() => {
    if (!swapKit || !inputAsset || !isWalletConnected) {
      setAddressForInputAsset(undefined);
      return;
    }

    let cancelled = false;

    try {
      const address = swapKit.getAddress(AssetValue.from({ asset: inputAsset }).chain);
      if (!cancelled) setAddressForInputAsset(address);
    } catch {
      if (!cancelled) setAddressForInputAsset(undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [swapKit, inputAsset, isWalletConnected, balancesByChain]);

  const connectRequiredWallet = useCallback(
    async (requiredChain?: Chain, requiredFor: "input" | "output" = "output") => {
      await showModal(<WalletConnectDialog requiredChain={requiredChain} requiredFor={requiredFor} />);
    },
    [],
  );

  const connectInputAssetWallet = useCallback(async () => {
    await connectRequiredWallet(inputAssetChain, "input");
  }, [connectRequiredWallet, inputAssetChain]);

  const connectOutputAssetWallet = useCallback(async () => {
    await connectRequiredWallet(outputAssetChain, "output");
  }, [connectRequiredWallet, outputAssetChain]);

  // Adopt an asset picked from the wallet drawer as the swap input. Identifiers
  // can differ in case (see balance lookups elsewhere), so compare lowercased.
  const handleSelectInputAssetFromWallet = useCallback(
    (asset: string) => {
      if (!asset) return;
      const normalized = asset.toLowerCase();
      // Already the input asset — nothing to change.
      if (inputAsset && normalized === inputAsset.toLowerCase()) return;
      // Picking the current output asset would collide; swap sides so the pair
      // stays valid (the old input becomes the output).
      if (outputAsset && normalized === outputAsset.toLowerCase()) {
        setOutputAsset(inputAsset);
      }
      addSentryBreadcrumb("Input asset selected from wallet drawer", "ui", { asset });
      setInputAsset(asset);
      setAmount("");
    },
    [inputAsset, outputAsset, setInputAsset, setOutputAsset, setAmount],
  );

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity somewhat justified
  const performSwap = async (route: QuoteResponseRoute) => {
    let currentStage: "build" | "broadcast" | "confirm" = "build";

    try {
      setIsSwapping(true);
      addSentryBreadcrumb("User initiated swap", "transaction", {
        buyAsset: route.buyAsset,
        sellAmount: route.sellAmount,
        sellAsset: route.sellAsset,
      });

      if (!swapKit) {
        throw new Error("SwapKit not initialized");
      }

      if (customDestinationAddress && !isCustomAddressValidated) {
        throw new Error("Destination address has not been validated");
      }

      const destinationAsset = AssetValue.from({ asset: route?.buyAsset });
      const sourceAsset = AssetValue.from({ asset: route?.sellAsset });

      // Extra params spread first so the UI-driven core fields always win.
      const getRouteParams = {
        ...devSwapParams,
        destinationAddress: effectiveDestinationAddress || swapKit.getAddress(destinationAsset.chain),
        routeId: route.routeId,
        sourceAddress: swapKit.getAddress(sourceAsset.chain),
      };

      currentStage = "build";
      addSentryBreadcrumb(`Swap stage: ${currentStage}`, "transaction", {
        provider: route?.providers?.[0],
        routeId: route.routeId,
      });

      let routeWithTx = await SwapKitApi.getRouteWithTx(getRouteParams);

      if (!routeWithTx) throw new Error("No route with TX found");

      if (routeWithTx.approvalTx) {
        // Stellar trustline: the widget only supplies the wording — the swapkit plugin
        // owns the mechanics (hasTrustline check, receiving wallet signs the
        // API-delivered changeTrust XDR, skip when the trustline exists) and its
        // errors surface through the shared catch below.
        if (isStellarApprovalTx(routeWithTx.approvalTx)) {
          const trustlineRoute = routeWithTx;
          const { confirmed } = await showModal(
            <ApprovalConfirmDialog
              description="This sets a one-time trustline that lets your receiving account hold this asset. It locks 0.5 XLM as a base reserve on your Stellar account."
              onApproveClick={async () => {
                const result = await swapKit.approveAssetValue(trustlineRoute);
                // Only a real signature returns a transaction hash worth recording.
                if (typeof result === "string" && result !== "approved") {
                  addTransaction({
                    chainId: ChainToChainId[Chain.Stellar],
                    hash: result,
                    sellAmount: "0",
                    sellAsset: destinationAsset.toString(),
                    status: "pending",
                    type: "approval",
                  });
                }
              }}
              title={`Approve ${destinationAsset.ticker} on Stellar`}
              tokenAsset={route.buyAsset}
            />,
          );
          if (!confirmed) return;

          routeWithTx = await SwapKitApi.getRouteWithTx(getRouteParams);
          if (!routeWithTx.tx) {
            throw new Error("Trustline is set, but the swap route isn't ready yet — please retry the swap.");
          }
        } else if (EVM_CHAINS.includes(sourceAsset.chain as (typeof EVM_CHAINS)[number])) {
          const wallet = swapKit.getWallet(sourceAsset.chain) as EVMWallet | undefined;
          if (!wallet) {
            throw new Error("Wallet not connected for approval transaction");
          }

          const approvalResult = await handleApprovalIfNeeded({
            addTransaction,
            approvalTx: routeWithTx.approvalTx,
            getRouteParams,
            route,
            sourceAsset,
            wallet,
          });

          if (!approvalResult.confirmed) return;
          routeWithTx = approvalResult.updatedRoute;
        } else {
          throw new Error("Approval transactions are only supported on EVM chains");
        }
      }

      const { expectedBuyAmount, expectedBuyAmountMaxSlippage } = routeWithTx;

      if (
        !routeWithTx?.sourceAddress ||
        !routeWithTx?.destinationAddress ||
        !expectedBuyAmount ||
        !expectedBuyAmountMaxSlippage ||
        !routeWithTx.legs.length ||
        Number.parseFloat(routeWithTx?.sellAmount) <= 0
      ) {
        throw new Error("Invalid route parameters. Please check the route details and try again.");
      }

      const legs = routeWithTx.legs.map((leg) => {
        const { buyAmount, buyAmountMaxSlippage } = leg;
        if (!buyAmount || !buyAmountMaxSlippage) {
          throw new Error("Invalid route leg amounts. Please check the route details and try again.");
        }

        return { ...leg, buyAmount, buyAmountMaxSlippage };
      });

      const swapRoute = { ...routeWithTx, expectedBuyAmount, expectedBuyAmountMaxSlippage, legs };

      // Show swap confirmation dialog
      const { confirmed: swapConfirmed } = await showModal(
        <SwapConfirmDialog destinationAddress={getRouteParams.destinationAddress} swapRoute={selectedRoute} />,
      );

      if (!swapConfirmed) return;

      currentStage = "broadcast";
      addSentryBreadcrumb(`Swap stage: ${currentStage}`, "transaction", {
        provider: route?.providers?.[0],
        routeId: route.routeId,
      });

      const txHash = await swapKit.swap({ route: swapRoute });

      const chainId = ChainToChainId[sourceAsset.chain];

      addTransaction({
        buyAmount: route.expectedBuyAmount,
        buyAsset: destinationAsset.toString(),
        chainId,
        hash: String(txHash),
        sellAmount: route.sellAmount,
        sellAsset: sourceAsset.toString(),
        status: "pending",
        type: "swap",
      });

      currentStage = "confirm";
      addSentryBreadcrumb(`Swap stage: ${currentStage}`, "transaction", {
        provider: route?.providers?.[0],
        routeId: route.routeId,
      });

      toast(<SwapSuccessToast chainId={chainId} txHash={String(txHash)} />, {
        duration: 10_000,
        toasterId: SWAPKIT_WIDGET_TOASTER_ID,
      });
    } catch (error) {
      // The destination Stellar account doesn't exist yet — a trustline can't even
      // be built. Surface a distinct, actionable message instead of the generic one.
      if (isStellarAccountNotFundedError(error)) {
        let buyTicker = "the asset";
        try {
          buyTicker = AssetValue.from({ asset: route.buyAsset }).ticker;
        } catch {
          // Fall back to the generic label if the asset can't be parsed.
        }
        toast.error(
          `The receiving Stellar account must be created and funded (needs ~1 XLM minimum, plus 0.5 XLM per trustline) before it can receive ${buyTicker}.`,
          { toasterId: SWAPKIT_WIDGET_TOASTER_ID },
        );
        return;
      }

      console.error("Swap process failed:", error);
      if (!isErrorCaptured(error)) {
        captureWidgetError(error, {
          category: "transaction",
          extra: { routeId: route?.routeId },
          tags: {
            buyAsset: route?.buyAsset,
            provider: route?.providers?.[0] ?? "unknown",
            sellAsset: route?.sellAsset,
            stage: currentStage,
          },
        });
      }

      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        const causeMessage = (error as any).cause?.message;
        if (causeMessage && typeof causeMessage === "string") {
          errorMessage = causeMessage;
        } else {
          errorMessage = error.message;
        }
      }

      toast.error(`Swap process failed: ${errorMessage}`, { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
    } finally {
      setIsSwapping(false);
    }
  };

  const handleSubmitButtonClick = async () => {
    if (!inputAsset || !outputAsset) return;

    addSentryBreadcrumb("Swap button clicked", "ui", { amount, inputAsset, outputAsset });

    // Before a quote exists we only offer a plain "Connect wallet" — don't steer
    // the dialog toward the input chain until the route makes that meaningful.
    if (!isWalletConnected && !hasRoute) {
      await connectRequiredWallet();
      return;
    }

    if (!isWalletConnected || needsInputChainWallet) {
      await connectInputAssetWallet();
      return;
    }

    if (needsOutputChainWallet) {
      await connectOutputAssetWallet();
      return;
    }

    if (!selectedRoute?.route) return;

    try {
      await performSwap(selectedRoute?.route);
    } catch (error) {
      console.error("Failed to prepare swap:", error);

      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        const causeMessage = (error as any).cause?.message;
        if (causeMessage && typeof causeMessage === "string") {
          errorMessage = causeMessage;
        } else {
          errorMessage = error.message;
        }
      }

      toast.error(`Failed to prepare swap: ${errorMessage}`, { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
    }
  };

  const hasRoute = !!selectedRoute?.route;
  // The input chain (what the user pays from) is always resolved before the
  // output chain — the `!needsInputChainWallet` guard on the output check plus
  // the label/handler ordering below guarantee it.
  const needsInputChainWallet = hasRoute && !!inputAssetChain && !isInputChainConnected;
  const needsOutputChainWallet =
    hasRoute && isWalletConnected && !needsInputChainWallet && !isOutputChainConnected && !customDestinationAddress;
  // Clicking the button connects a wallet (rather than swapping) in any of
  // these states. Such clicks stay enabled even before an amount/quote exists.
  const isConnectWalletAction = !isWalletConnected || needsInputChainWallet || needsOutputChainWallet;
  const needsDestinationAddress = isWalletConnected && !effectiveDestinationAddress;
  const hasDestinationAddressError = !!destinationAddressError;
  const isCustomAddressPending = !!customDestinationAddress && !isCustomAddressValidated && !hasDestinationAddressError;

  const submitButtonContent = match({
    amount,
    hasDestinationAddressError,
    hasInsufficientBalance,
    hasRoute,
    inputAsset,
    isFetchingQuote,
    isInputChainConnected,
    isSwapping,
    isWalletConnected,
    needsDestinationAddress,
    needsInputChainWallet,
    needsOutputChainWallet,
    outputAsset,
  })
    .with({ isSwapping: true }, () => (
      <>
        <Loader2Icon className="sk-ui-mr-2 sk-ui-h-4 sk-ui-w-4 sk-ui-animate-spin" />
        Swapping...
      </>
    ))
    .with({ isFetchingQuote: true }, () => (
      <>
        <Loader2Icon className="sk-ui-mr-2 sk-ui-h-4 sk-ui-w-4 sk-ui-animate-spin" />
        Checking for the best quote...
      </>
    ))
    // No wallet + no quote yet: lead with the connect CTA instead of nudging
    // the user to pick tokens / enter an amount first.
    .with({ hasRoute: false, isWalletConnected: false }, () => "Connect wallet")
    .with({ inputAsset: P.nullish }, () => "Select tokens")
    .with({ outputAsset: P.nullish }, () => "Select tokens")
    .with({ amount: P.nullish.or(P.string.length(0).or(P.number.lte(0))) }, () => "Enter transfer amount")
    // Input chain (what you pay from) is always asked before the output chain.
    .with({ needsInputChainWallet: true }, () => `Connect ${inputAssetChain} wallet`)
    .with({ isWalletConnected: false }, () => "Connect wallet")
    .with({ hasInsufficientBalance: true }, () => "Insufficient balance")
    .with({ hasDestinationAddressError: true }, () => "Invalid destination address")
    .with({ needsOutputChainWallet: true }, () => `Connect ${outputAssetChain} wallet`)
    .with({ needsDestinationAddress: true }, () => "Enter destination address")
    .otherwise(() => "Swap");

  const isSubmitButtonDisabled =
    isSwapping ||
    isFetchingQuote ||
    // Connect-wallet clicks stay enabled even with no tokens / amount / quote —
    // a fresh user should be able to connect before doing anything else.
    (!isConnectWalletAction &&
      (!(inputAsset && outputAsset && Number.parseFloat(amount ?? "0") > 0) ||
        hasInsufficientBalance ||
        (needsDestinationAddress && !needsOutputChainWallet) ||
        hasDestinationAddressError ||
        isCustomAddressPending));

  return (
    <div
      className={cn("swapkit-ui-preflight swapkit-widget-target sk-ui-flex sk-ui-flex-col sk-ui-gap-4", className)}
      ref={widgetRef}>
      <TooltipProvider delayDuration={500}>
        <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between">
          <SwapKitLogoHorizontalWhite className="sk-ui-h-6 sk-ui-w-auto" />

          <div className="sk-ui-ml-auto sk-ui-flex sk-ui-items-center">
            <QuoteRefreshButton
              className={cn("sk-ui-mr-2", !selectedRoute?.route && "sk-ui-invisible")}
              isRefreshing={isFetchingQuote}
              onRefresh={() => fetchSwapQuote({ preserveSelection: true })}
            />

            <Button
              onClick={() => {
                void showTransactionHistoryDrawer();
              }}
              size="xs"
              variant="ghost">
              <HistoryIcon className="sk-ui-size-4" />
            </Button>

            {!isWalletConnected ? (
              <Button
                className="sk-ui-ml-2"
                onClick={() => {
                  void showModal(<WalletConnectDialog />);
                }}
                size="xs"
                variant="ghost">
                <Wallet2Icon className="sk-ui-size-4" />

                <span>Connect wallet</span>
              </Button>
            ) : walletType ? (
              <div className="sk-ui-ml-2 sk-ui-flex sk-ui-items-center sk-ui-gap-px">
                <Button
                  className="sk-ui-rounded-r-none"
                  onClick={() => {
                    void showSwapKitWalletDrawer({ inputAssetChain }).then((result) => {
                      if (result.confirmed && typeof result.data === "string") {
                        handleSelectInputAssetFromWallet(result.data);
                      }
                    });
                  }}
                  size="xs"
                  variant="secondary">
                  <WalletIcon eip6963Info={eip6963WalletInfo} wallet={walletType} />

                  <div>
                    {addressForInputAsset?.slice(0, 6)}...{addressForInputAsset?.slice(-4)}
                  </div>
                </Button>

                <Button
                  className="sk-ui-rounded-l-none"
                  onClick={() => disconnectWallet()}
                  size="xs"
                  variant="secondary">
                  <LogOutIcon className="sk-ui-size-3.5" />
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <Card>
          <CardContent className="sk-ui-grid sk-ui-gap-6">
            <div className="sk-ui-space-y-4">
              <div className="sk-ui-grid sk-ui-gap-4">
                <SwapInputWithChainSelector
                  amount={amount}
                  balance={inputAssetBalance}
                  formattedAmountUSD={selectedRoute?.formattedInputAssetPriceUSD}
                  isSwapping={isSwapping}
                  label="Pay"
                  selectedAsset={inputAsset?.toString()}
                  setAmount={setAmount}
                  setSelectedAsset={(asset: string) => {
                    addSentryBreadcrumb("Input asset changed", "ui", { asset });
                    setInputAsset(asset);
                    setAmount("");
                  }}
                />

                <div className="sk-ui--my-4 sk-ui-flex sk-ui-items-center sk-ui-space-x-4">
                  <span className="sk-ui-h-px sk-ui-w-full sk-ui-bg-border" />

                  <Button
                    className="sk-ui-size-10 sk-ui-shrink-0 sk-ui-rounded-full"
                    onClick={() => {
                      setInputAsset(outputAsset);
                      setOutputAsset(inputAsset);
                      setAmount(selectedRoute?.expectedBuyAmount?.toString() ?? "");
                      reset();
                    }}
                    size="unstyled"
                    variant="tertiary">
                    <ArrowDownUpIcon className="sk-ui-size-6" />
                  </Button>

                  <span className="sk-ui-h-px sk-ui-w-full sk-ui-bg-border" />
                </div>

                <SwapInputWithChainSelector
                  amount={formatTokenAmount(selectedRoute?.expectedBuyAmount)}
                  formattedAmountUSD={selectedRoute?.formattedOutputAssetPriceUSD ?? "$0.00"}
                  isLoading={isFetchingQuote}
                  isOutputSelect
                  isSwapping={isSwapping}
                  label="Receive"
                  selectedAsset={outputAsset?.toString()}
                  setSelectedAsset={(asset: string) => {
                    addSentryBreadcrumb("Output asset changed", "ui", { asset });
                    setOutputAsset(asset);
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <DestinationAddressInput
          chain={outputAssetChain}
          customAddress={customDestinationAddress}
          error={destinationAddressError}
          isExpanded={isDestinationFieldExpanded}
          isOutputChainConnected={isOutputChainConnected}
          isWalletConnected={isWalletConnected}
          onAddressChange={(address) => {
            setCustomDestinationAddress(address);
            setIsCustomAddressValidated(false);
            setDestinationAddressError(null);
          }}
          onExpandedChange={(expanded) => {
            setIsDestinationFieldExpanded(expanded);
            if (!expanded) {
              setCustomDestinationAddress("");
              setDestinationAddressError(null);
              setIsCustomAddressValidated(false);
            }
          }}
          walletAddress={walletDestinationAddress}
        />

        <Button
          className="sk-ui-w-full"
          disabled={isSubmitButtonDisabled}
          onClick={handleSubmitButtonClick}
          size="xl"
          variant="primary">
          {submitButtonContent}
        </Button>

        {selectedRoute?.route && (
          <SwapQuotePreview
            className="!mt-6"
            routes={routes}
            selectedRoute={selectedRoute}
            setSelectedRouteIndex={setSelectedRouteIndex}
          />
        )}

        {!hasApiCredentials && (
          <div
            aria-live="polite"
            className="sk-ui-ml-auto sk-ui-flex sk-ui-w-full sk-ui-items-start sk-ui-gap-2 sk-ui-rounded-md sk-ui-border sk-ui-border-destructive/40 sk-ui-bg-destructive/10 sk-ui-px-2.5 sk-ui-py-2 sk-ui-text-[11.5px] sk-ui-text-foreground"
            role="status"
            style={{ maxWidth: 360 }}>
            <AlertTriangleIcon className="sk-ui-mt-0.5 sk-ui-h-3.5 sk-ui-w-3.5 sk-ui-shrink-0 sk-ui-text-destructive-foreground" />
            <span>
              <strong className="sk-ui-font-medium">Widget auth missing.</strong> Add an API key or widget credentials
              to enable quotes and prices.
            </span>
          </div>
        )}

        <Toaster position="bottom-right" />
        <ModalSpawner />
      </TooltipProvider>
    </div>
  );
}
