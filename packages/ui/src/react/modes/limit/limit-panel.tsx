"use client";

import { AssetValue, type Chain, type LimitOrderQuoteRoute } from "@swapkit/helpers";
import { Loader2Icon } from "lucide-react";
import { type ReactNode, useEffect, useMemo } from "react";
import { match } from "ts-pattern";
import { useShallow } from "zustand/react/shallow";
import { cn, formatCurrency, formatTokenAmount } from "../../../lib/utils";
import { AssetPairCard } from "../../components/composable/asset-pair-card";
import { DestinationAddressInput } from "../../components/composable/destination-address-input";
import { SwapInputWithChainSelector } from "../../components/composable/swap-input-chain-selector";
import { WidgetHeader } from "../../components/composable/widget-header";
import { WalletConnectDialog } from "../../components/dialogs/wallet-connect-dialog";
import { QuoteRefreshButton } from "../../components/simple/quote-refresh-button";
import { Button } from "../../components/ui/button";
import { SWAPKIT_WIDGET_TOASTER_ID, toast } from "../../components/ui/sonner";
import { useAssetPair } from "../../hooks/use-asset-pair";
import { useDestinationAddress } from "../../hooks/use-destination-address";
import { useLimitOrderTokens } from "../../hooks/use-limit-order-tokens";
import { showModal } from "../../hooks/use-modal";
import { useTokenPrices, useTokenPricesQuery } from "../../hooks/use-token-prices";
import { exceedsBalance, findBalance } from "../../lib/balance";
import { getExpiryBounds, resolveLimitExpiry } from "../../lib/limit-orders/expiry";
import { formatQuoteAmount } from "../../lib/limit-orders/price";
import { getSubmitState, type SubmitBlocker } from "../../lib/submit-state";
import { addSentryBreadcrumb, setSentryContext } from "../../sentry";
import { useSwapKit } from "../../swapkit-context";
import { showSwapKitWalletDrawer } from "../../swapkit-wallet-drawer";
import { LimitDirectionTrigger } from "./components/limit-direction-trigger";
import { LimitExpiryField } from "./components/limit-expiry-field";
import { LimitNoticeSlot } from "./components/limit-notice-slot";
import { LimitOrderSummary } from "./components/limit-order-summary";
import { LimitPriceSection } from "./components/limit-price-section";
import { LimitRecoveryPanel } from "./components/limit-recovery-panel";
import { useLimitAssetFilters } from "./hooks/use-limit-asset-filters";
import { useLimitFormSource } from "./hooks/use-limit-form-source";
import { useLimitOrderActions } from "./hooks/use-limit-order-actions";
import { useLimitOrderPricing } from "./hooks/use-limit-order-pricing";
import { LIMIT_NO_ROUTES_MESSAGE, LIMIT_QUOTE_ERROR_KEYS } from "./hooks/use-limit-order-quote";
import { isLimitPairSupported } from "./lib/pairs";
import { type LimitHeldLock, type LimitHeldOrder, useLimitOrderStore } from "./limit-order-store";
import { type PlaceLimitOrder, placeLimitOrder } from "./place-limit-order";

const BAND_WARNING_CODES = new Set(["limitPriceBelowSpot", "limitPriceWithinFeeGap"]);

const SUBMIT_LABELS = { fetchingQuote: "Checking price…", inProgress: "Placing order…" } as const;

const SUBMIT_ACTION_LABELS = { buy: "Place buy order", sell: "Place sell order" } as const;

const SENDING_DEPOSIT_LABEL = "Sending deposit…";

const FIELDSET_STYLE = { border: 0, margin: 0, minWidth: 0, padding: 0 } as const;

function isLockedOrder(held: LimitHeldOrder | null): held is LimitHeldOrder & { lock: LimitHeldLock } {
  return !!held?.lock;
}

function getSubmitLabels(direction: "buy" | "sell", held: LimitHeldOrder | null) {
  const labels = { ...SUBMIT_LABELS, submit: SUBMIT_ACTION_LABELS[direction] };
  const isSendingDeposit = held?.kind.flow === "deposit" && held.stage === "sign";
  return isSendingDeposit ? { ...labels, inProgress: SENDING_DEPOSIT_LABEL } : labels;
}

function safeAssetValue(asset: string | null | undefined) {
  if (!asset) return null;
  try {
    return AssetValue.from({ asset });
  } catch {
    return null;
  }
}

function getLimitBlocker({
  errorKey,
  hasRequoteNotice,
  isAmountValid,
  isExpiryValid,
  isPriceValid,
  isQuoteUnavailable,
  isUnsupportedPair,
}: {
  errorKey: string | undefined;
  hasRequoteNotice: boolean;
  isAmountValid: boolean;
  isExpiryValid: boolean;
  isPriceValid: boolean;
  isQuoteUnavailable: boolean;
  isUnsupportedPair: boolean;
}) {
  const isInvalidPrice =
    !isPriceValid ||
    errorKey === LIMIT_QUOTE_ERROR_KEYS.amountAmbiguous ||
    errorKey === LIMIT_QUOTE_ERROR_KEYS.invalidParam;
  const rungs: [boolean, SubmitBlocker][] = [
    [isUnsupportedPair, { disabled: true, id: "unsupportedPair", label: "Select a supported pair" }],
    [
      errorKey === LIMIT_QUOTE_ERROR_KEYS.insufficientLiquidity,
      { disabled: true, id: "insufficientLiquidity", label: "Enter a smaller amount" },
    ],
    [
      errorKey === LIMIT_QUOTE_ERROR_KEYS.actionUnavailable,
      { disabled: true, id: "paused", label: "Limit orders paused" },
    ],
    [
      errorKey === LIMIT_QUOTE_ERROR_KEYS.noSignableProvider,
      { disabled: true, id: "walletUnsupported", label: "Wallet not supported" },
    ],
    [!isAmountValid, { disabled: true, id: "invalidAmount", label: "Enter a valid amount" }],
    [isInvalidPrice, { disabled: true, id: "invalidPrice", label: "Enter a limit price" }],
    [!isExpiryValid, { disabled: true, id: "invalidExpiry", label: "Enter a valid expiry" }],
    [isQuoteUnavailable, { disabled: false, id: "quoteUnavailable", label: "Retry quote" }],
    [hasRequoteNotice, { disabled: false, id: "requote", label: "Review updated order" }],
  ];
  return rungs.find(([when]) => when)?.[1];
}

function getQuoteRequestState({
  errorKey,
  hasOrderRoute,
  isChecking,
  isFetching,
  isWalletConnected,
}: {
  errorKey: string | undefined;
  hasOrderRoute: boolean;
  isChecking: boolean;
  isFetching: boolean;
  isWalletConnected: boolean;
}) {
  const hasQuoteError = !!errorKey && !hasOrderRoute;
  return {
    isFetchingQuote: isChecking || (hasQuoteError && isFetching),
    isQuoteUnavailable: hasQuoteError && isWalletConnected,
  };
}

function getQuoteWarnings(route: LimitOrderQuoteRoute | null, hasOrderRoute: boolean) {
  if (!hasOrderRoute || !route?.warnings) return [];
  return route.warnings.filter(({ code }) => !BAND_WARNING_CODES.has(code));
}

function LimitFormFieldset({
  children,
  disabled,
  isLocked,
}: {
  children: ReactNode;
  disabled: boolean;
  isLocked: boolean;
}) {
  return (
    <fieldset
      className={cn("sk-ui-flex sk-ui-flex-col sk-ui-gap-4", isLocked && "sk-ui-opacity-50")}
      disabled={disabled}
      style={FIELDSET_STYLE}>
      {children}
    </fieldset>
  );
}

function LimitSubmitSlot({
  held,
  isPlacing,
  onDiscard,
  onRetry,
  onSubmit,
  submitState,
}: {
  held: LimitHeldOrder | null;
  isPlacing: boolean;
  onDiscard: () => void;
  onRetry: () => void;
  onSubmit: () => void;
  submitState: ReturnType<typeof getSubmitState>;
}) {
  if (isLockedOrder(held)) {
    return <LimitRecoveryPanel isBusy={isPlacing} onDiscard={onDiscard} onRetry={onRetry} order={held} />;
  }

  const isBusy = submitState.kind === "inProgress" || submitState.kind === "fetchingQuote";
  return (
    <Button className="sk-ui-w-full" disabled={submitState.disabled} onClick={onSubmit} size="xl" variant="primary">
      {isBusy && <Loader2Icon className="sk-ui-mr-2 sk-ui-h-4 sk-ui-w-4 sk-ui-animate-spin" />}
      {submitState.label}
    </Button>
  );
}

function LimitDestinationField({
  chain,
  destination,
  heldAddress,
  isWalletConnected,
}: {
  chain: Chain | undefined;
  destination: ReturnType<typeof useDestinationAddress>;
  heldAddress: string | undefined;
  isWalletConnected: boolean;
}) {
  if (heldAddress) {
    return (
      <DestinationAddressInput
        chain={chain}
        customAddress=""
        error={null}
        isExpanded={false}
        isOutputChainConnected
        isWalletConnected
        onAddressChange={() => undefined}
        onExpandedChange={() => undefined}
        walletAddress={heldAddress}
      />
    );
  }

  return (
    <DestinationAddressInput
      chain={chain}
      customAddress={destination.customDestinationAddress}
      error={destination.destinationAddressError}
      isExpanded={destination.isDestinationFieldExpanded}
      isOutputChainConnected={destination.isOutputChainConnected}
      isWalletConnected={isWalletConnected}
      onAddressChange={destination.onAddressChange}
      onExpandedChange={destination.onExpandedChange}
      walletAddress={destination.walletDestinationAddress}
    />
  );
}

export function LimitPanel({
  initialInputAsset,
  initialOutputAsset,
  logoUrl,
  modeSwitcher,
  onPlaceOrder = placeLimitOrder,
  showLogo,
  syncUrl,
}: {
  initialInputAsset?: string | null;
  initialOutputAsset?: string | null;
  logoUrl?: string | null;
  modeSwitcher?: ReactNode;
  onPlaceOrder?: PlaceLimitOrder;
  showLogo?: boolean;
  syncUrl: boolean;
}) {
  const pair = useAssetPair({ initialInputAsset, initialOutputAsset, syncUrl });
  const { setAmount, setInputAsset, setOutputAsset } = pair;
  const {
    amount,
    buyAmount,
    buyAsset,
    buyChain,
    direction,
    held,
    heldRoute,
    isFormLocked,
    isPlacing,
    sellAsset,
    sellChain,
  } = useLimitFormSource(pair);
  const {
    expiry,
    isExpiryExpanded,
    requoteNotice,
    setBuyAmount,
    setDirection,
    setExpiry,
    setIsExpiryExpanded,
    setRequoteNotice,
  } = useLimitOrderStore(
    useShallow((state) => ({
      expiry: state.expiry,
      isExpiryExpanded: state.isExpiryExpanded,
      requoteNotice: state.requoteNotice,
      setBuyAmount: state.setBuyAmount,
      setDirection: state.setDirection,
      setExpiry: state.setExpiry,
      setIsExpiryExpanded: state.setIsExpiryExpanded,
      setRequoteNotice: state.setRequoteNotice,
    })),
  );

  const { isWalletConnected, balancesByChain, connectedWallets } = useSwapKit();
  const destination = useDestinationAddress(buyChain);
  const { tokens, isLoadingTokens, isTokensError } = useLimitOrderTokens();
  const { pricesByTokenId } = useTokenPrices();
  useTokenPricesQuery([sellAsset, buyAsset].filter(Boolean));

  const isSell = direction === "sell";
  const baseAmount = isSell ? amount : buyAmount;
  const setBaseAmount = isSell ? setAmount : setBuyAmount;
  const sellValue = useMemo(() => safeAssetValue(sellAsset), [sellAsset]);
  const buyValue = useMemo(() => safeAssetValue(buyAsset), [buyAsset]);
  const usdPrice = (value: AssetValue | null) => (value ? pricesByTokenId.get(value.toString())?.priceUSD : undefined);

  const isSellChainConnected = sellChain ? connectedWallets.has(sellChain) : false;

  const isPairSupported =
    tokens && sellAsset && buyAsset ? isLimitPairSupported({ buyAsset, sellAsset, tokens }) : null;

  const pricing = useLimitOrderPricing({
    baseAmount,
    buyAsset,
    buyPriceUsd: usdPrice(buyValue),
    direction,
    heldRoute,
    isPairSupported,
    quoteDecimals: (isSell ? buyValue : sellValue)?.decimal ?? 8,
    sellAsset,
    sellPriceUsd: usdPrice(sellValue),
  });
  const { route, hasOrderRoute, quoteAmount } = pricing;

  const routeId = route?.routeId;
  const routeProvider = route?.provider;

  useEffect(() => {
    if (!routeId) return;
    setSentryContext({ currentProvider: routeProvider, routeId });
    addSentryBreadcrumb("Limit route quoted", "ui", { provider: routeProvider, routeId });
  }, [routeId, routeProvider]);

  const sellBalance = findBalance(balancesByChain, sellValue, isWalletConnected);
  const hasInsufficientBalance = exceedsBalance(sellAsset, isSell ? amount : quoteAmount, sellBalance);

  const bounds = getExpiryBounds(route);
  const resolvedExpiry = resolveLimitExpiry(expiry, bounds);
  const errorKey = pricing.error?.key;
  const isUnsupportedPair = isPairSupported === false || errorKey === LIMIT_QUOTE_ERROR_KEYS.unsupportedPair;

  useEffect(() => {
    if (!isUnsupportedPair || !sellAsset || !buyAsset) return;
    toast.error(LIMIT_NO_ROUTES_MESSAGE, { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
  }, [isUnsupportedPair, sellAsset, buyAsset]);

  const quoteRequest = getQuoteRequestState({
    errorKey,
    hasOrderRoute,
    isChecking: pricing.isChecking,
    isFetching: pricing.isFetching,
    isWalletConnected,
  });

  const submitState = getSubmitState({
    amount: baseAmount,
    blocker: getLimitBlocker({
      errorKey,
      hasRequoteNotice: !!requoteNotice,
      isAmountValid: pricing.isAmountValid,
      isExpiryValid: resolvedExpiry.isValid,
      isPriceValid: pricing.isPriceValid,
      isQuoteUnavailable: quoteRequest.isQuoteUnavailable,
      isUnsupportedPair,
    }),
    gasShortfallTicker: null,
    hasCustomDestinationAddress: !!destination.customDestinationAddress,
    hasDestinationAddress: !!destination.effectiveDestinationAddress,
    hasDestinationAddressError: !!destination.destinationAddressError,
    hasInsufficientBalance,
    hasRoute: hasOrderRoute,
    inputAsset: sellAsset,
    inputChain: sellChain,
    isCustomAddressValidated: destination.isCustomAddressValidated,
    isFetchingQuote: quoteRequest.isFetchingQuote,
    isInProgress: isPlacing,
    isInputChainConnected: isSellChainConnected,
    isOutputChainConnected: destination.isOutputChainConnected,
    isWalletConnected,
    labels: getSubmitLabels(direction, held),
    outputAsset: buyAsset,
    outputChain: buyChain,
  });

  const { buyFilter, sellFilter } = useLimitAssetFilters({ isLoadingTokens, isTokensError, sellValue, tokens });
  const sell = {
    asset: sellAsset,
    balance: sellBalance,
    filter: sellFilter,
    setAsset: setInputAsset,
    ticker: sellValue?.ticker ?? "",
    value: sellValue,
  };
  const buy = {
    asset: buyAsset,
    balance: findBalance(balancesByChain, buyValue, isWalletConnected),
    filter: buyFilter,
    setAsset: setOutputAsset,
    ticker: buyValue?.ticker ?? "",
    value: buyValue,
  };
  const [base, quote] = isSell ? [sell, buy] : [buy, sell];

  const toggleDirection = () => {
    if (isSell) {
      setBuyAmount(amount);
      setAmount("");
    } else {
      setAmount(buyAmount);
    }
    setInputAsset(buyAsset);
    setOutputAsset(sellAsset);
    setDirection(isSell ? "buy" : "sell");
    setRequoteNotice(null);
    pricing.reset();
  };

  const flipAssets = () => {
    addSentryBreadcrumb("Limit assets flipped", "ui", { buyAsset: sellAsset, direction, sellAsset: buyAsset });
    setBaseAmount(quoteAmount ?? "");
    setInputAsset(buyAsset);
    setOutputAsset(sellAsset);
    setRequoteNotice(null);
    pricing.reset();
  };

  const selectSellAssetFromWallet = (asset: string) => {
    if (isFormLocked || asset.toLowerCase() === sellAsset.toLowerCase()) return;
    addSentryBreadcrumb("Limit sell asset selected from wallet drawer", "ui", { asset });
    if (asset.toLowerCase() === buyAsset.toLowerCase()) setOutputAsset(sellAsset);
    setInputAsset(asset);
    setBaseAmount("");
    setRequoteNotice(null);
    pricing.reset();
  };

  const selectBaseAsset = (asset: string) => {
    addSentryBreadcrumb("Limit base asset changed", "ui", { asset });
    base.setAsset(asset);
    setBaseAmount("");
  };

  const selectQuoteAsset = (asset: string) => {
    addSentryBreadcrumb("Limit quote asset changed", "ui", { asset });
    quote.setAsset(asset);
  };

  const formattedQuoteAmount = formatQuoteAmount(quoteAmount ?? "", direction) ?? "–";
  const sellWalletAddress = sellChain ? connectedWallets.get(sellChain)?.address : undefined;

  const { discardHeldOrder, placeOrder, retryHeldOrder } = useLimitOrderActions({
    draft: {
      destinationAddress: destination.effectiveDestinationAddress,
      direction,
      expiryBounds: bounds,
      expirySeconds: resolvedExpiry.isValid ? resolvedExpiry.seconds : null,
      route: hasOrderRoute ? route : null,
      sourceAddress: sellWalletAddress,
    },
    onPlaceOrder,
    previousQuoteAmount: formattedQuoteAmount,
    refetchQuote: () => {
      void pricing.refetch();
    },
  });

  const handleSubmitButtonClick = async () => {
    addSentryBreadcrumb("Limit button clicked", "ui", { action: submitState.action, kind: submitState.kind });
    await match(submitState.action)
      .with("connectWallet", () => showModal(<WalletConnectDialog />))
      .with("connectInputChainWallet", () =>
        showModal(<WalletConnectDialog requiredChain={sellChain} requiredFor="input" />),
      )
      .with("connectOutputChainWallet", () =>
        showModal(<WalletConnectDialog requiredChain={buyChain} requiredFor="output" />),
      )
      .with("submit", placeOrder)
      .with("none", () => {
        if (submitState.blockerId === "requote") setRequoteNotice(null);
        if (submitState.blockerId === "quoteUnavailable") void pricing.refetch();
      })
      .exhaustive();
  };

  return (
    <>
      <WidgetHeader
        actions={
          <QuoteRefreshButton
            className={cn("sk-ui-mr-2", !pricing.canRefresh && "sk-ui-invisible")}
            isRefreshing={pricing.isRefreshing}
            onRefresh={() => {
              void pricing.refetch();
            }}
          />
        }
        logoUrl={logoUrl}
        onOpenWalletDrawer={() => {
          void showSwapKitWalletDrawer({ inputAssetChain: sellChain }).then((result) => {
            if (result.confirmed && typeof result.data === "string") selectSellAssetFromWallet(result.data);
          });
        }}
        showLogo={showLogo}
        walletAddress={sellWalletAddress}
      />

      {modeSwitcher}

      <LimitFormFieldset disabled={isFormLocked} isLocked={isLockedOrder(held)}>
        <AssetPairCard
          bottom={
            <SwapInputWithChainSelector
              amount={quoteAmount ? formatTokenAmount(quoteAmount) : ""}
              assetFilter={quote.filter}
              balance={quote.balance}
              formattedAmountUSD={formatCurrency((usdPrice(quote.value) ?? 0) * Number(quoteAmount ?? 0))}
              isLoading={pricing.isRefreshing}
              isSwapping={isFormLocked}
              label={isSell ? "For" : "With"}
              selectedAsset={quote.asset}
              setSelectedAsset={selectQuoteAsset}
            />
          }
          isFlipDisabled={isFormLocked}
          onFlip={flipAssets}
          top={
            <SwapInputWithChainSelector
              amount={baseAmount}
              assetFilter={base.filter}
              balance={base.balance}
              formattedAmountUSD={formatCurrency((usdPrice(base.value) ?? 0) * Number(baseAmount || 0))}
              isSwapping={isFormLocked}
              label={<LimitDirectionTrigger direction={direction} disabled={isFormLocked} onToggle={toggleDirection} />}
              selectedAsset={base.asset}
              setAmount={setBaseAmount}
              setSelectedAsset={selectBaseAsset}
            />
          }
        />

        <LimitPriceSection
          baseTicker={base.ticker}
          direction={direction}
          disabled={isFormLocked}
          isCrossChain={sellChain !== buyChain}
          pricing={pricing}
          quoteTicker={quote.ticker}
        />

        <LimitExpiryField
          bounds={bounds}
          disabled={isFormLocked}
          expiry={expiry}
          isExpanded={isExpiryExpanded}
          onChange={setExpiry}
          onExpandedChange={setIsExpiryExpanded}
        />

        <LimitDestinationField
          chain={buyChain}
          destination={destination}
          heldAddress={held?.destinationAddress}
          isWalletConnected={isWalletConnected}
        />

        <LimitNoticeSlot
          buyTicker={buy.ticker}
          direction={direction}
          errorKey={errorKey}
          newQuoteAmount={formattedQuoteAmount}
          quoteTicker={quote.ticker}
          requoteNotice={requoteNotice}
          sellChain={sellChain}
          sellTicker={sell.ticker}
          warnings={getQuoteWarnings(route, hasOrderRoute)}
        />
      </LimitFormFieldset>

      <LimitSubmitSlot
        held={held}
        isPlacing={isPlacing}
        onDiscard={discardHeldOrder}
        onRetry={retryHeldOrder}
        onSubmit={handleSubmitButtonClick}
        submitState={submitState}
      />

      {route && <LimitOrderSummary integratorFeeBps={route.integratorFeeBps} takerFeeBps={route.takerFeeBps} />}
    </>
  );
}
