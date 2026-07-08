"use client";

import { AssetValue, PriorityLabel, type QuoteResponse, type QuoteResponseRoute, SwapKitApi } from "@swapkit/helpers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { formatCurrency } from "../../lib/utils";
import { getProviderLogoUrl } from "../components/config";
import { SWAPKIT_WIDGET_TOASTER_ID } from "../components/ui/sonner";
import { addSentryBreadcrumb, captureWidgetError } from "../sentry";
import { useSwapKitConfig } from "../swapkit-config-context";
import { useSwapKit } from "../swapkit-context";
import type { UseSwapQuoteParams } from "../types";
import { useDebouncedEffect } from "./use-debounced-effect";
import { useTokenPrices } from "./use-token-prices";

export type UseSwapQuoteReturn = ReturnType<typeof useSwapQuote>;

type ParsedQuoteRoute = ReturnType<typeof parseQuoteResponseRoute>;

/**
 * Format provider name for display
 */
export function formatProviderName(provider: string): string {
  // Remove version suffixes (_V2, _V3, etc) and _STREAMING
  const baseName = provider.replace(/(_V\d+|_STREAMING)$/g, "");

  const nameMap: Record<string, string> = {
    CHAINFLIP: "Chainflip",
    KYBERSWAP: "KyberSwap",
    MAYACHAIN: "MAYAChain",
    ONEINCH: "1inch",
    PANCAKESWAP: "PancakeSwap",
    PANGOLIN: "Pangolin",
    SUSHISWAP: "SushiSwap",
    THORCHAIN: "THORChain",
    TRADERJOE: "Trader Joe",
    UNISWAP: "Uniswap",
    WOOFI: "WOOFi",
  };

  return nameMap[baseName] || baseName.charAt(0) + baseName.slice(1).toLowerCase();
}

/**
 * Merge streaming and non-streaming routes from the same provider
 * Picks the best one based on RECOMMENDED tag or highest expectedBuyAmount
 */
function mergeRoutesByProvider(routes: ParsedQuoteRoute[]): ParsedQuoteRoute[] {
  const grouped = new Map<string, ParsedQuoteRoute[]>();

  for (const route of routes) {
    const baseProvider = (route.providerName || "").replace(/_STREAMING$/, "");
    const existing = grouped.get(baseProvider) || [];
    existing.push(route);
    grouped.set(baseProvider, existing);
  }

  const merged: ParsedQuoteRoute[] = [];

  for (const [, variants] of grouped) {
    if (variants.length === 1 && variants[0]) {
      merged.push(variants[0]);
    } else if (variants.length > 1) {
      // Multiple variants - pick best
      // 1. Prefer RECOMMENDED tag
      const recommended = variants.find((r) => r.tags?.includes(PriorityLabel.RECOMMENDED));
      if (recommended) {
        merged.push(recommended);
        continue;
      }

      // 2. Fallback to highest expectedBuyAmount
      const best = variants.reduce((a, b) => ((a.expectedBuyAmount ?? 0) > (b.expectedBuyAmount ?? 0) ? a : b));
      merged.push(best);
    }
  }

  return merged;
}

// Parse a single quote response route - extracted for type inference
function parseQuoteResponseRoute(
  quoteResponseRoute: QuoteResponseRoute,
  index: number,
  outputAssetValue: AssetValue | null,
  inputAssetPriceUSD: number | undefined,
  assetValueToUSD: (assetValue: AssetValue) => number,
  pricesByTokenId: Map<string, { priceUSD: number }>,
) {
  const formatEstimatedTime = (estimatedTime: QuoteResponseRoute["estimatedTime"]) => {
    if (!estimatedTime?.total) return "00m 00s";

    const hours = Math.floor(estimatedTime?.total / 3600);
    const minutes = Math.floor((estimatedTime?.total % 3600) / 60);
    const seconds = estimatedTime?.total % 60;

    return `${hours ? `${hours.toFixed(0)}h ` : ""}${`${minutes.toFixed(0)}m `}${`${seconds.toFixed(0)}s`}`;
  };

  const formattedEstimatedTime = formatEstimatedTime(quoteResponseRoute?.estimatedTime);

  const providerName = quoteResponseRoute?.providers?.[0] || null;

  const outputAssetPriceUSD = outputAssetValue && pricesByTokenId.get(outputAssetValue.toString())?.priceUSD;
  const outputAssetTicker = outputAssetValue?.ticker || null;

  const safeFeeToUSD = (fee: { asset?: string; amount?: string } | undefined | null) => {
    if (!fee?.asset) return 0;
    try {
      return assetValueToUSD(AssetValue.from({ asset: fee.asset, value: fee.amount }));
    } catch (error) {
      console.warn("[SwapKit] Skipping malformed fee asset:", fee.asset, error);
      return 0;
    }
  };

  const totalFeesUSD = quoteResponseRoute?.fees?.reduce((acc, fee) => acc + safeFeeToUSD(fee), 0) || 0;

  const liquidityFee = quoteResponseRoute?.fees?.find((fee) => fee.type === "liquidity");
  const liquidityFeeUSD = liquidityFee ? safeFeeToUSD(liquidityFee) : null;

  const exchangeFee = quoteResponseRoute?.fees?.find((fee) => fee.type === "affiliate");
  const exchangeFeeUSD = exchangeFee ? safeFeeToUSD(exchangeFee) : null;

  const inboundNetworkFee = quoteResponseRoute?.fees?.find((fee) => fee.type === "inbound");
  const inboundNetworkFeeUSD = inboundNetworkFee ? safeFeeToUSD(inboundNetworkFee) : null;

  const expectedBuyAmountMaxSlippage = quoteResponseRoute?.expectedBuyAmountMaxSlippage || null;
  const expectedBuyAmount = Number.parseFloat(quoteResponseRoute?.expectedBuyAmount) || null;

  const canShowFees = outputAssetPriceUSD && inputAssetPriceUSD;

  const maxSlippageRatio =
    1 -
    Number.parseFloat(expectedBuyAmountMaxSlippage ?? "0") /
      Number.parseFloat(quoteResponseRoute?.expectedBuyAmount ?? "0");

  // biome-ignore assist/source/useSortedKeys: sort by use case, not alphabetically
  return {
    routeIndex: index,
    route: quoteResponseRoute,
    tags: quoteResponseRoute?.meta?.tags,

    outputAssetPriceUSD,
    outputAssetTicker,
    formattedOutputAssetPriceUSD:
      expectedBuyAmount && outputAssetPriceUSD
        ? formatCurrency(outputAssetPriceUSD * Number(expectedBuyAmount) - totalFeesUSD)
        : "$0.00",

    expectedBuyAmount,
    expectedBuyAmountMaxSlippage,
    formattedMaxSlippagePercentage:
      quoteResponseRoute?.expectedBuyAmountMaxSlippage && quoteResponseRoute?.expectedBuyAmountMaxSlippage
        ? `${(maxSlippageRatio * 100).toFixed(2)}%`
        : "-",

    formattedEstimatedTime,
    formattedExchangeFeeUSD: canShowFees ? formatCurrency(exchangeFeeUSD) : "-",
    formattedInboundNetworkFeeUSD: canShowFees ? formatCurrency(inboundNetworkFeeUSD) : "-",
    formattedLiquidityFeeUSD: canShowFees ? formatCurrency(liquidityFeeUSD) : "-",
    formattedTotalFeesUSD: canShowFees ? formatCurrency(totalFeesUSD) : "-",

    providerLogoURI: providerName ? getProviderLogoUrl(providerName) : null,
    providerName,
  };
}

export const useSwapQuote = ({ inputAsset, outputAsset, amount }: UseSwapQuoteParams) => {
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [quoteResponse, setQuoteResponse] = useState<QuoteResponse | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [expectedBuyAmountFor1Input, setExpectedBuyAmountFor1Input] = useState(0);
  const { setTokenPrices, pricesByTokenId } = useTokenPrices();

  // Track request version to ignore stale responses (e.g., after swapping assets)
  const requestVersionRef = useRef(0);

  const { swapKit } = useSwapKit();
  const swapKitConfig = useSwapKitConfig();

  const inputAssetValue = useMemo(() => {
    if (!inputAsset) return null;

    return AssetValue.from({ asset: inputAsset });
  }, [inputAsset]);

  const outputAssetValue = useMemo(() => {
    if (!outputAsset) return null;

    return AssetValue.from({ asset: outputAsset });
  }, [outputAsset]);

  const outputAssetIdentifier = outputAssetValue?.toString();
  const inputAssetIdentifier = inputAssetValue?.toString();
  const inputAmountValue = useMemo(() => {
    if (!(inputAsset && amount)) return null;

    try {
      return AssetValue.from({ asset: inputAsset, value: amount });
    } catch {
      return null;
    }
  }, [inputAsset, amount]);
  const hasPositiveAmount = inputAmountValue?.gt(0) === true;

  const fetchSwapQuote = useCallback(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: quote fetching requires multiple validation and error handling paths
    async (options?: { preserveSelection?: boolean }) => {
      const { preserveSelection = false } = options ?? {};

      const isValid =
        hasPositiveAmount &&
        swapKit &&
        inputAssetValue?.chain &&
        outputAssetValue?.chain &&
        outputAssetIdentifier &&
        inputAssetIdentifier;

      if (!isValid) {
        requestVersionRef.current += 1;
        setQuoteResponse(null);
        setIsFetchingQuote(false);
        return;
      }

      // Increment and capture request version to detect stale responses
      requestVersionRef.current += 1;
      const currentRequestVersion = requestVersionRef.current;

      // Capture currently selected provider name before fetching new quotes (only if preserving selection)
      const currentSelectedProvider = preserveSelection
        ? quoteResponse?.routes?.[selectedRouteIndex]?.providers?.[0]
        : undefined;

      try {
        setIsFetchingQuote(true);

        addSentryBreadcrumb("Fetching swap quote", "api", {
          buyAsset: outputAssetIdentifier,
          sellAmount: amount,
          sellAsset: inputAssetIdentifier,
        });

        const quote = await SwapKitApi.getSwapQuote({
          buyAsset: outputAssetIdentifier,
          sellAmount: amount,
          sellAsset: inputAssetIdentifier,
        });

        // Ignore stale response if a newer request was initiated (e.g., user swapped assets)
        if (currentRequestVersion !== requestVersionRef.current) {
          return;
        }

        if (quote?.routes?.length <= 0) return;

        setQuoteResponse(quote);

        // Preserve user's route selection if the same provider is still available (only on manual refresh)
        if (preserveSelection && currentSelectedProvider && quote?.routes?.length > 0) {
          const matchingIndex = quote.routes.findIndex((route) => route.providers?.[0] === currentSelectedProvider);
          setSelectedRouteIndex(matchingIndex >= 0 ? matchingIndex : 0);
        } else {
          setSelectedRouteIndex(0);
        }
      } catch (error) {
        // Ignore errors from stale requests
        if (currentRequestVersion !== requestVersionRef.current) {
          return;
        }

        console.error("Failed to get quote:", error);
        captureWidgetError(error, {
          category: "api",
          extra: { buyAsset: outputAssetIdentifier, sellAmount: amount, sellAsset: inputAssetIdentifier },
          tags: { endpoint: "quote" },
        });

        // Extract meaningful error message
        let errorMessage = "Unknown error";
        if (error instanceof Error) {
          // Try to get the API error message from the cause
          const causeMessage = (error as any).cause?.message;
          if (causeMessage && typeof causeMessage === "string") {
            errorMessage = causeMessage;
          } else {
            errorMessage = error.message;
          }
        }

        toast.error(`Failed to get quote: ${errorMessage}`, { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
        setQuoteResponse(null);
      } finally {
        // Only update loading state if this is still the current request
        if (currentRequestVersion === requestVersionRef.current) {
          setIsFetchingQuote(false);
        }
      }
    },
    [
      amount,
      hasPositiveAmount,
      swapKit,
      outputAssetValue?.chain,
      inputAssetValue?.chain,
      inputAssetIdentifier,
      outputAssetIdentifier,
      quoteResponse?.routes,
      selectedRouteIndex,
    ],
  );

  useDebouncedEffect(fetchSwapQuote, [amount, swapKit, swapKitConfig, outputAsset, inputAsset], {
    delay: 700,
    runImmediately: true,
  });

  useEffect(() => {
    const selectedRoute = quoteResponse?.routes?.[selectedRouteIndex];

    setExpectedBuyAmountFor1Input(
      selectedRoute?.expectedBuyAmount && hasPositiveAmount
        ? Number.parseFloat(selectedRoute?.expectedBuyAmount) / inputAmountValue.getValue("number")
        : 0,
    );

    const tokenPricesFromQuoteRoute = selectedRoute?.meta?.assets?.flatMap((asset) => {
      try {
        return [{ identifier: AssetValue.from({ asset: asset?.asset }).toString(), priceUSD: asset?.price }];
      } catch (error) {
        console.warn("[SwapKit] Skipping malformed meta asset:", asset?.asset, error);
        return [];
      }
    });

    if (!tokenPricesFromQuoteRoute || tokenPricesFromQuoteRoute?.length <= 0) return;

    setTokenPrices(tokenPricesFromQuoteRoute);
  }, [hasPositiveAmount, inputAmountValue, quoteResponse?.routes, selectedRouteIndex, setTokenPrices]);

  const inputAssetPriceUSD = inputAssetValue && pricesByTokenId.get(inputAssetValue.toString())?.priceUSD;
  const inputAssetTicker = inputAssetValue?.ticker || null;

  const swapQuoteRoutes = useMemo(() => {
    const assetValueToUSD = (assetValue: AssetValue) => {
      const assetPriceUSD = pricesByTokenId.get(assetValue.toString())?.priceUSD;
      if (!assetPriceUSD) return 0;
      return assetValue.getValue("number") * assetPriceUSD;
    };

    const parsedRoutes = quoteResponse?.routes?.flatMap((route, index) => {
      try {
        return [
          parseQuoteResponseRoute(
            route,
            index,
            outputAssetValue,
            inputAssetPriceUSD || undefined,
            assetValueToUSD,
            pricesByTokenId,
          ),
        ];
      } catch (error) {
        console.warn("[SwapKit] Skipping unparseable route:", route?.providers, error);
        return [];
      }
    });

    if (!parsedRoutes) return undefined;

    // Merge streaming and non-streaming routes, keeping only the best
    const mergedRoutes = mergeRoutesByProvider(parsedRoutes);

    // Re-index routes after merging
    return mergedRoutes.map((route, index) => ({ ...route, routeIndex: index }));
  }, [quoteResponse?.routes, outputAssetValue, inputAssetPriceUSD, pricesByTokenId]);

  const reset = useCallback(() => {
    // Invalidate any pending requests so their responses are ignored
    requestVersionRef.current += 1;
    setQuoteResponse(null);
    setSelectedRouteIndex(0);
    setIsFetchingQuote(false);
  }, []);

  return useMemo(
    () => ({
      fetchSwapQuote,
      isFetchingQuote,
      reset,
      routes: swapQuoteRoutes,
      selectedRoute: {
        ...(swapQuoteRoutes?.[selectedRouteIndex] ?? null),
        amount,
        expectedBuyAmountFor1Input,
        formattedInputAssetPriceUSD: inputAssetPriceUSD ? formatCurrency(inputAssetPriceUSD * Number(amount)) : "$0.00",
        inputAssetPriceUSD,
        inputAssetTicker,
      },
      setSelectedRouteIndex,
    }),
    [
      swapQuoteRoutes,
      selectedRouteIndex,
      amount,
      inputAssetPriceUSD,
      inputAssetTicker,
      reset,
      isFetchingQuote,
      expectedBuyAmountFor1Input,
      fetchSwapQuote,
    ],
  );
};
