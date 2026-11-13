"use client";

import { AssetValue, type Chain, ChainToChainId, isUserRejectedRequest } from "@swapkit/helpers";
import { type QuoteResponseRoute, SwapKitApi } from "@swapkit/helpers/api";
import { Loader2Icon } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { match, P } from "ts-pattern";
import { useShallow } from "zustand/react/shallow";
import { cn, formatCurrency, formatTokenAmount } from "../../../lib/utils";
import { AssetPairCard } from "../../components/composable/asset-pair-card";
import { DestinationAddressInput } from "../../components/composable/destination-address-input";
import { SlippageToleranceField } from "../../components/composable/slippage-tolerance-field";
import { SwapInputWithChainSelector } from "../../components/composable/swap-input-chain-selector";
import { SwapQuotePreview } from "../../components/composable/swap-quote-preview";
import { WidgetHeader } from "../../components/composable/widget-header";
import { SwapConfirmDialog } from "../../components/dialogs/swap-confirm-dialog";
import { WalletConnectDialog } from "../../components/dialogs/wallet-connect-dialog";
import { QuoteRefreshButton } from "../../components/simple/quote-refresh-button";
import { SwapSuccessToast } from "../../components/simple/swap-success-toast";
import { Button } from "../../components/ui/button";
import { SWAPKIT_WIDGET_TOASTER_ID, toast } from "../../components/ui/sonner";
import { useAssetPair } from "../../hooks/use-asset-pair";
import { useDestinationAddress } from "../../hooks/use-destination-address";
import { useDevRequestParams } from "../../hooks/use-dev-request-params";
import { showModal } from "../../hooks/use-modal";
import { useSwapQuote } from "../../hooks/use-swap-quote";
import { useSwapTo } from "../../hooks/use-swap-to";
import { useTokenPrices, useTokenPricesQuery } from "../../hooks/use-token-prices";
import { getAssetChain } from "../../lib/asset-chain";
import { exceedsBalance, findBalance } from "../../lib/balance";
import { EVM_CHAINS } from "../../lib/chain-catalog";
import { getErrorMessage } from "../../lib/error-message";
import { isLedgerTronDataNotAllowedError, LEDGER_TRON_ALLOW_DATA_MESSAGE } from "../../lib/ledger-tron-errors";
import { getMaxAmountOption } from "../../lib/max-amount";
import { getGasAsset, getGasShortfall, isInsufficientNetworkFeeError } from "../../lib/network-fee";
import { getSubmitState } from "../../lib/submit-state";
import { addSentryBreadcrumb, captureWidgetError, isErrorCaptured, setSentryContext } from "../../sentry";
import { useTransactionHistoryStore } from "../../stores/transaction-history-store";
import { useWidgetFormStore } from "../../stores/widget-form-store";
import { useSwapKit } from "../../swapkit-context";
import { showSwapKitWalletDrawer } from "../../swapkit-wallet-drawer";
import {
  type EVMWallet,
  handleApprovalIfNeeded,
  handleStellarTrustlineIfNeeded,
  isStellarAccountNotFundedError,
  isStellarApprovalTx,
} from "./approval";

const DEFAULT_INPUT_ASSET = "BTC.BTC";
const DEFAULT_OUTPUT_ASSET = "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7";

export function SwapPanel({
  initialInputAsset,
  logoUrl,
  showLogo,
  initialOutputAsset,
  modeSwitcher,
  syncUrl,
}: {
  initialInputAsset?: string | null;
  initialOutputAsset?: string | null;
  logoUrl?: string | null;
  modeSwitcher?: ReactNode;
  showLogo?: boolean;
  syncUrl: boolean;
}) {
  const {
    amount,
    inputAsset,
    inputAssetChain,
    outputAsset,
    outputAssetChain,
    setAmount,
    setInputAsset,
    setOutputAsset,
  } = useAssetPair({ initialInputAsset, initialOutputAsset, syncUrl });
  const { finishOperation, isSwapping, setSlippagePercent, slippagePercent, startOperation } = useWidgetFormStore(
    useShallow((state) => ({
      finishOperation: state.finishOperation,
      isSwapping: state.pendingOperation === "swap",
      setSlippagePercent: state.setSlippagePercent,
      slippagePercent: state.slippagePercent,
      startOperation: state.startOperation,
    })),
  );
  const {
    customDestinationAddress,
    destinationAddressError,
    effectiveDestinationAddress,
    isCustomAddressValidated,
    isDestinationFieldExpanded,
    isOutputChainConnected,
    onAddressChange,
    onExpandedChange,
    walletDestinationAddress,
  } = useDestinationAddress(outputAssetChain);

  const { swapKit, isWalletConnected, balancesByChain, connectedWallets } = useSwapKit();
  const addTransaction = useTransactionHistoryStore((state) => state.addTransaction);
  const { swapParams: devSwapParams } = useDevRequestParams();

  const inputAssetBalance = useMemo(
    () => findBalance(balancesByChain, inputAsset ? AssetValue.from({ asset: inputAsset }) : null, isWalletConnected),
    [inputAsset, isWalletConnected, balancesByChain],
  );

  const [isMaxAmount, setIsMaxAmount] = useState(false);
  const maxAmountOption = useMemo(
    () => getMaxAmountOption({ asset: inputAsset, balance: inputAssetBalance, isWalletConnected }),
    [inputAsset, inputAssetBalance, isWalletConnected],
  );
  // Max stays active only while the field still holds the full balance.
  const isSweep = isMaxAmount && !!maxAmountOption?.enableSweep && amount === maxAmountOption.amount;

  const { fetchSwapQuote, isFetchingQuote, selectedRoute, setSelectedRouteIndex, routes, reset } = useSwapQuote({
    amount,
    enableSweep: isSweep,
    inputAsset,
    outputAsset,
    slippage: slippagePercent,
  });

  const handleAmountChange = useCallback(
    (nextAmount: string) => {
      setIsMaxAmount(false);
      setAmount(nextAmount);
    },
    [setAmount],
  );

  const handleMaxClick = useCallback(() => {
    if (!maxAmountOption) return;
    addSentryBreadcrumb("Max amount selected", "ui", { asset: inputAsset, enableSweep: maxAmountOption.enableSweep });
    setIsMaxAmount(true);
    setAmount(maxAmountOption.amount);
  }, [inputAsset, maxAmountOption, setAmount]);

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

  useSwapTo(inputAsset);

  const isInputChainConnected = inputAssetChain ? connectedWallets.has(inputAssetChain) : false;

  const hasInsufficientBalance = useMemo(
    () => (inputAsset ? exceedsBalance(inputAsset, amount, inputAssetBalance) : false),
    [inputAssetBalance, amount, inputAsset],
  );

  const gasShortfallTicker = useMemo(() => {
    const route = selectedRoute?.route;
    if (!route) return null;

    const chainBalances = balancesByChain.get(getGasAsset(route.sellAsset).chain);
    if (!chainBalances) return null;

    return getGasShortfall({
      balances: chainBalances.map(({ balance }) => balance),
      fees: route.fees,
      isSweep,
      sellAmount: route.sellAmount,
      sellAsset: route.sellAsset,
    });
  }, [selectedRoute?.route, balancesByChain, isSweep]);

  useTokenPricesQuery([inputAsset || DEFAULT_INPUT_ASSET, outputAsset || DEFAULT_OUTPUT_ASSET]);
  const { pricesByTokenId } = useTokenPrices();

  const addressForInputAsset =
    swapKit && isWalletConnected && inputAssetChain ? connectedWallets.get(inputAssetChain)?.address : undefined;

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
      handleAmountChange("");
    },
    [inputAsset, outputAsset, setInputAsset, setOutputAsset, handleAmountChange],
  );

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity somewhat justified
  const performSwap = async (route: QuoteResponseRoute) => {
    if (!startOperation("swap")) return;

    let currentStage: "build" | "broadcast" | "confirm" = "build";

    try {
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
        ...(isSweep ? { enableSweep: true } : {}),
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
        if (isStellarApprovalTx(routeWithTx.approvalTx)) {
          const trustlineResult = await handleStellarTrustlineIfNeeded({
            addTransaction,
            destinationAsset,
            getRouteParams,
            route,
            routeWithTx,
            swapKit,
          });

          if (!trustlineResult.confirmed) return;
          routeWithTx = trustlineResult.updatedRoute;
        } else if (EVM_CHAINS.includes(sourceAsset.chain)) {
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
      const isSweptRoute = routeWithTx.meta?.isSweep === true;
      const toUSD = (asset: string, amount: string) => {
        const price = pricesByTokenId.get(AssetValue.from({ asset }).toString())?.priceUSD;
        return price ? formatCurrency(price * Number(amount)) : undefined;
      };
      const sweepAmounts = isSweptRoute
        ? {
            buyAmountUSD: toUSD(routeWithTx.buyAsset, expectedBuyAmount),
            expectedBuyAmount,
            expectedBuyAmountMaxSlippage,
            sellAmount: routeWithTx.sellAmount,
            sellAmountUSD: toUSD(routeWithTx.sellAsset, routeWithTx.sellAmount),
          }
        : undefined;

      const { confirmed: swapConfirmed } = await showModal(
        <SwapConfirmDialog
          destinationAddress={getRouteParams.destinationAddress}
          swapRoute={selectedRoute}
          sweepAmounts={sweepAmounts}
        />,
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
        buyAmount: sweepAmounts?.expectedBuyAmount ?? route.expectedBuyAmount,
        buyAsset: destinationAsset.toString(),
        chainId,
        hash: String(txHash),
        sellAmount: sweepAmounts?.sellAmount ?? route.sellAmount,
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

      if (isUserRejectedRequest(error)) {
        toast.warning("Swap rejected in your wallet.", { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
        return;
      }

      if (isLedgerTronDataNotAllowedError(error, getAssetChain(route.sellAsset))) {
        toast.error(LEDGER_TRON_ALLOW_DATA_MESSAGE, { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
        return;
      }

      if (isInsufficientNetworkFeeError(error)) {
        const gasTicker = getGasAsset(route.sellAsset).ticker;
        toast.error(
          `Not enough ${gasTicker} to pay the network fees for this transaction. Add ${gasTicker} to your wallet and try again.`,
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

      toast.error(`Swap process failed: ${getErrorMessage(error)}`, { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
    } finally {
      finishOperation();
    }
  };

  const submitState = getSubmitState({
    amount,
    gasShortfallTicker,
    hasCustomDestinationAddress: !!customDestinationAddress,
    hasDestinationAddress: !!effectiveDestinationAddress,
    hasDestinationAddressError: !!destinationAddressError,
    hasInsufficientBalance,
    hasRoute: !!selectedRoute?.route,
    inputAsset,
    inputChain: inputAssetChain,
    isCustomAddressValidated,
    isFetchingQuote,
    isInProgress: isSwapping,
    isInputChainConnected,
    isOutputChainConnected,
    isWalletConnected,
    outputAsset,
    outputChain: outputAssetChain,
  });

  const handleSubmitButtonClick = async () => {
    if (submitState.action === "none") return;

    addSentryBreadcrumb("Swap button clicked", "ui", { amount, inputAsset, outputAsset });

    await match(submitState.action)
      .with("connectWallet", () => connectRequiredWallet())
      .with("connectInputChainWallet", () => connectInputAssetWallet())
      .with("connectOutputChainWallet", () => connectOutputAssetWallet())
      .with("submit", async () => {
        if (!selectedRoute?.route) return;

        try {
          await performSwap(selectedRoute?.route);
        } catch (error) {
          console.error("Failed to prepare swap:", error);

          toast.error(`Failed to prepare swap: ${getErrorMessage(error)}`, { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
        }
      })
      .exhaustive();
  };

  const submitButtonContent = match(submitState)
    .with({ kind: P.union("inProgress", "fetchingQuote") }, ({ label }) => (
      <>
        <Loader2Icon className="sk-ui-mr-2 sk-ui-h-4 sk-ui-w-4 sk-ui-animate-spin" />
        {label}
      </>
    ))
    .otherwise(({ label }) => label);

  return (
    <>
      <WidgetHeader
        actions={
          <QuoteRefreshButton
            className={cn("sk-ui-mr-2", !selectedRoute?.route && "sk-ui-invisible")}
            isRefreshing={isFetchingQuote}
            onRefresh={fetchSwapQuote}
          />
        }
        logoUrl={logoUrl}
        onOpenWalletDrawer={() => {
          void showSwapKitWalletDrawer({ inputAssetChain }).then((result) => {
            if (result.confirmed && typeof result.data === "string") {
              handleSelectInputAssetFromWallet(result.data);
            }
          });
        }}
        showLogo={showLogo}
        walletAddress={addressForInputAsset}
      />

      {modeSwitcher}

      <AssetPairCard
        bottom={
          <SwapInputWithChainSelector
            amount={formatTokenAmount(selectedRoute?.expectedBuyAmount)}
            formattedAmountUSD={selectedRoute?.formattedOutputAssetPriceUSD ?? "$0.00"}
            isLoading={isFetchingQuote}
            isOutputSelect
            isSwapping={isSwapping}
            label="Receive"
            selectedAsset={outputAsset?.toString()}
            sellAsset={inputAsset}
            setSelectedAsset={(asset: string) => {
              addSentryBreadcrumb("Output asset changed", "ui", { asset });
              setOutputAsset(asset);
            }}
          />
        }
        onFlip={() => {
          setInputAsset(outputAsset);
          setOutputAsset(inputAsset);
          handleAmountChange(selectedRoute?.expectedBuyAmount?.toString() ?? "");
          reset();
        }}
        top={
          <SwapInputWithChainSelector
            amount={amount}
            balance={inputAssetBalance}
            formattedAmountUSD={selectedRoute?.formattedInputAssetPriceUSD}
            isSwapping={isSwapping}
            label="Pay"
            onMaxClick={maxAmountOption ? handleMaxClick : undefined}
            selectedAsset={inputAsset?.toString()}
            setAmount={handleAmountChange}
            setSelectedAsset={(asset: string) => {
              addSentryBreadcrumb("Input asset changed", "ui", { asset });
              setInputAsset(asset);
              handleAmountChange("");
            }}
          />
        }
      />

      <DestinationAddressInput
        chain={outputAssetChain}
        customAddress={customDestinationAddress}
        error={destinationAddressError}
        isExpanded={isDestinationFieldExpanded}
        isOutputChainConnected={isOutputChainConnected}
        isWalletConnected={isWalletConnected}
        onAddressChange={onAddressChange}
        onExpandedChange={onExpandedChange}
        walletAddress={walletDestinationAddress}
      />

      <SlippageToleranceField
        disabled={isSwapping}
        onChange={(nextSlippage) => {
          addSentryBreadcrumb("Slippage tolerance changed", "ui", { slippage: nextSlippage });
          setSlippagePercent(nextSlippage);
        }}
        value={slippagePercent}
      />

      <Button
        className="sk-ui-w-full"
        disabled={submitState.disabled}
        onClick={handleSubmitButtonClick}
        size="xl"
        variant="primary">
        {submitButtonContent}
      </Button>

      {selectedRoute?.route && (
        <SwapQuotePreview
          className="!mt-6"
          requestedSlippagePercent={slippagePercent}
          routes={routes}
          selectedRoute={selectedRoute}
          setSelectedRouteIndex={setSelectedRouteIndex}
        />
      )}
    </>
  );
}
