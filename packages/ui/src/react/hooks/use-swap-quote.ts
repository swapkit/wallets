"use client";

import {
  AssetValue,
  PriorityLabel,
  type QuoteRequest,
  type QuoteResponse,
  type QuoteResponseRoute,
  SwapKitApi,
} from "@swapkit/helpers";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatCurrency } from "../../lib/utils";
import { getProviderLogoUrl } from "../components/config";
import { SWAPKIT_WIDGET_TOASTER_ID } from "../components/ui/sonner";
import { getErrorMessage } from "../lib/error-message";
import { hasApiAuth, keepPreviousData, useApiConfig, useSwapKitQuery } from "../lib/query-client";
import { formatSlippagePercent } from "../lib/slippage";
import { addSentryBreadcrumb } from "../sentry";
import { useSwapKit } from "../swapkit-context";
import type { UseSwapQuoteParams } from "../types";
import { useDebouncedEffect } from "./use-debounced-effect";
import { useDevRequestParams } from "./use-dev-request-params";
import { useTokenPrices } from "./use-token-prices";

const SWAP_QUOTE_QUERY_KEY = "swapQuote";

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

function baseProviderName(providerName: string | null | undefined) {
  return (providerName || "").replace(/_STREAMING$/, "");
}

/**
 * Merge streaming and non-streaming routes from the same provider
 * Picks the best one based on RECOMMENDED tag or highest expectedBuyAmount
 */
function mergeRoutesByProvider(routes: ParsedQuoteRoute[]): ParsedQuoteRoute[] {
  const grouped = new Map<string, ParsedQuoteRoute[]>();

  for (const route of routes) {
    const baseProvider = baseProviderName(route.providerName);
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

  const feesUSDByType = (type: string) =>
    quoteResponseRoute?.fees?.filter((fee) => fee.type === type).reduce((acc, fee) => acc + safeFeeToUSD(fee), 0) || 0;

  const serviceFeeUSD = feesUSDByType("service");
  const affiliateFeeUSD = feesUSDByType("affiliate");
  const exchangeFeeUSD = serviceFeeUSD + affiliateFeeUSD;

  const poolLiquidityFeeUSD = feesUSDByType("liquidity");
  const outboundFeeUSD = feesUSDByType("outbound");
  const liquidityFeeUSD = poolLiquidityFeeUSD + outboundFeeUSD;

  const inboundNetworkFeeUSD = feesUSDByType("inbound");

  const expectedBuyAmountMaxSlippage = quoteResponseRoute?.expectedBuyAmountMaxSlippage || null;
  const expectedBuyAmount = Number.parseFloat(quoteResponseRoute?.expectedBuyAmount) || null;

  const canShowFees = outputAssetPriceUSD && inputAssetPriceUSD;

  // Tolerance the route actually guarantees, derived from the response amounts.
  // API may apply their own default for some pairs (stablecoins and like-valued pairs) instead of the
  // requested `slippage`, so this can differ from what the user configured.
  const minReceived = Number.parseFloat(expectedBuyAmountMaxSlippage ?? "");
  const appliedSlippagePercent =
    expectedBuyAmount && Number.isFinite(minReceived)
      ? Number(((1 - minReceived / expectedBuyAmount) * 100).toFixed(2))
      : null;

  // biome-ignore assist/source/useSortedKeys: sort by use case, not alphabetically
  return {
    routeIndex: index,
    route: quoteResponseRoute,
    tags: quoteResponseRoute?.meta?.tags,

    outputAssetPriceUSD,
    outputAssetTicker,
    formattedOutputAssetPriceUSD:
      expectedBuyAmount && outputAssetPriceUSD
        ? formatCurrency(outputAssetPriceUSD * Number(expectedBuyAmount))
        : "$0.00",

    expectedBuyAmount,
    expectedBuyAmountMaxSlippage,
    appliedSlippagePercent,
    formattedMaxSlippagePercentage:
      appliedSlippagePercent === null ? "-" : formatSlippagePercent(appliedSlippagePercent),

    formattedEstimatedTime,
    formattedExchangeFeeUSD: canShowFees ? formatCurrency(exchangeFeeUSD) : "-",
    formattedServiceFeeUSD: canShowFees ? formatCurrency(serviceFeeUSD) : "-",
    formattedAffiliateFeeUSD: canShowFees ? formatCurrency(affiliateFeeUSD) : "-",
    formattedLiquidityFeeUSD: canShowFees ? formatCurrency(liquidityFeeUSD) : "-",
    formattedPoolLiquidityFeeUSD: canShowFees ? formatCurrency(poolLiquidityFeeUSD) : "-",
    formattedOutboundFeeUSD: canShowFees ? formatCurrency(outboundFeeUSD) : "-",
    formattedInboundNetworkFeeUSD: canShowFees ? formatCurrency(inboundNetworkFeeUSD) : "-",
    formattedTotalFeesUSD: canShowFees ? formatCurrency(totalFeesUSD) : "-",

    providerLogoURI: providerName ? getProviderLogoUrl(providerName) : null,
    providerName,
  };
}

type SwapQuoteParams = {
  buyAsset: string;
  devQuoteParams: Record<string, unknown> | null;
  enableSweep: boolean;
  sellAmount: string;
  sellAsset: string;
  slippage: number | null;
};

export function findRouteIndexByBaseProvider(
  routes: { providerName: string | null }[] | undefined,
  provider: string | null,
) {
  return Math.max(0, routes?.findIndex((route) => baseProviderName(route.providerName) === provider) ?? 0);
}

async function requestSwapQuote({
  params,
  signal,
}: {
  params: SwapQuoteParams;
  signal: AbortSignal;
}): Promise<QuoteResponse | null> {
  if (!hasApiAuth()) return null;
  const { buyAsset, devQuoteParams, enableSweep, sellAmount, sellAsset, slippage } = params;

  addSentryBreadcrumb("Fetching swap quote", "api", { buyAsset, sellAmount, sellAsset });

  try {
    const quote = await SwapKitApi.getSwapQuote({
      ...(slippage === null ? {} : { slippage }),
      ...devQuoteParams,
      ...(enableSweep ? { enableSweep } : {}),
      buyAsset,
      sellAmount,
      sellAsset,
    } as QuoteRequest);

    if (signal.aborted) return null;

    if (!quote?.routes?.length) {
      toast.error("No routes available for this swap", { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
      return null;
    }

    return quote;
  } catch (error) {
    if (signal.aborted) return null;

    toast.error(`Failed to get quote: ${getErrorMessage(error)}`, { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
    throw error;
  }
}

export const useSwapQuote = ({
  inputAsset,
  outputAsset,
  amount,
  enableSweep = false,
  slippage = null,
}: UseSwapQuoteParams) => {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const { setTokenPrices, pricesByTokenId } = useTokenPrices();

  const { swapKit } = useSwapKit();
  const apiConfig = useApiConfig();
  const { quoteParams: devQuoteParams } = useDevRequestParams();

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

  const params: SwapQuoteParams | null =
    hasPositiveAmount &&
    inputAssetValue?.chain &&
    outputAssetValue?.chain &&
    inputAssetIdentifier &&
    outputAssetIdentifier
      ? {
          buyAsset: outputAssetIdentifier,
          devQuoteParams,
          enableSweep,
          sellAmount: amount,
          sellAsset: inputAssetIdentifier,
          slippage,
        }
      : null;
  const paramsKey = params ? JSON.stringify(params) : null;

  const [{ params: debouncedParams, keepPrevious }, setDebouncedParams] = useState<{
    keepPrevious: boolean;
    params: SwapQuoteParams | null;
  }>({ keepPrevious: false, params });

  useDebouncedEffect(
    () => {
      setDebouncedParams((current) => ({ keepPrevious: current.params !== null, params }));
      setSelectedProvider(null);
    },
    [paramsKey],
    { delay: 700, runImmediately: false },
  );

  const canRequest = !!debouncedParams && !!swapKit;

  const query = useSwapKitQuery({
    enabled: canRequest && apiConfig.hasAuth && apiConfig.settled,
    meta: {
      category: "api",
      extra: debouncedParams
        ? {
            buyAsset: debouncedParams.buyAsset,
            sellAmount: debouncedParams.sellAmount,
            sellAsset: debouncedParams.sellAsset,
          }
        : undefined,
      tags: { endpoint: "quote" },
    },
    placeholderData: keepPrevious ? keepPreviousData : undefined,
    queryFn: ({ signal }) => requestSwapQuote({ params: debouncedParams as SwapQuoteParams, signal }),
    queryKey: [SWAP_QUOTE_QUERY_KEY, apiConfig.key, debouncedParams],
  });

  const quoteResponse = canRequest && !query.isError ? query.data : undefined;
  const isFetchingQuote = canRequest && (query.isFetching || query.isPaused);
  const { refetch } = query;

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

  const fetchSwapQuote = useCallback(async () => {
    if (!canRequest) return;
    if (!selectedProvider) setSelectedProvider(baseProviderName(swapQuoteRoutes?.[0]?.providerName) || null);
    await refetch();
  }, [canRequest, refetch, selectedProvider, swapQuoteRoutes]);

  const selectedRouteIndex = findRouteIndexByBaseProvider(swapQuoteRoutes, selectedProvider);
  const selectedRoute = swapQuoteRoutes?.[selectedRouteIndex]?.route;

  const expectedBuyAmountFor1Input = useMemo(() => {
    const expectedBuyAmount = selectedRoute?.expectedBuyAmount;

    return expectedBuyAmount && hasPositiveAmount
      ? Number.parseFloat(expectedBuyAmount) / inputAmountValue.getValue("number")
      : 0;
  }, [hasPositiveAmount, inputAmountValue, selectedRoute]);

  useEffect(() => {
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
  }, [selectedRoute, setTokenPrices]);

  const setSelectedRouteIndex = useCallback(
    (index: number) => setSelectedProvider(baseProviderName(swapQuoteRoutes?.[index]?.providerName) || null),
    [swapQuoteRoutes],
  );

  const reset = useCallback(() => {
    setDebouncedParams({ keepPrevious: false, params: null });
    setSelectedProvider(null);
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
      setSelectedRouteIndex,
    ],
  );
};
