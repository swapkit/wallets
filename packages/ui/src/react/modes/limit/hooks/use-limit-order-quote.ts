"use client";

import { AssetValue, type LimitOrderQuoteRoute } from "@swapkit/helpers";
import { SwapKitApi } from "@swapkit/helpers/api";
import { useCallback, useMemo, useState } from "react";
import type { SwapKitClient } from "../../../../swapkit-types";
import { SWAPKIT_WIDGET_TOASTER_ID, toast } from "../../../components/ui/sonner";
import { useDebouncedEffect } from "../../../hooks/use-debounced-effect";
import { getAssetChain } from "../../../lib/asset-chain";
import { getLimitErrorKey, getLimitErrorMessage } from "../../../lib/limit-orders/errors";
import type { LimitQuoteParams } from "../../../lib/limit-orders/price";
import { keepPreviousData, useApiConfig, useSwapKitQuery } from "../../../lib/query-client";
import { addSentryBreadcrumb, captureWidgetError } from "../../../sentry";
import { useSwapKit } from "../../../swapkit-context";

const LIMIT_QUOTE_QUERY_KEY = "limitOrderQuote";

export const LIMIT_QUOTE_ERROR_KEYS = {
  actionUnavailable: "limitOrderActionUnavailable",
  amountAmbiguous: "limitOrderAmountAmbiguous",
  insufficientLiquidity: "insufficientLiquidity",
  invalidParam: "invalidParam",
  noSignableProvider: "plugin_swapkit_limit_order_no_signable_provider",
  unsupportedPair: "limitOrderUnsupportedPair",
} as const;

export const LIMIT_NO_ROUTES_MESSAGE = "No routes available for this limit order";

const HANDLED_ERROR_KEYS = new Set<string>([
  LIMIT_QUOTE_ERROR_KEYS.actionUnavailable,
  LIMIT_QUOTE_ERROR_KEYS.insufficientLiquidity,
  LIMIT_QUOTE_ERROR_KEYS.noSignableProvider,
  LIMIT_QUOTE_ERROR_KEYS.unsupportedPair,
]);

const UNCAPTURED_ERROR_KEYS = new Set<string>([
  LIMIT_QUOTE_ERROR_KEYS.insufficientLiquidity,
  LIMIT_QUOTE_ERROR_KEYS.noSignableProvider,
  LIMIT_QUOTE_ERROR_KEYS.unsupportedPair,
]);

export type LimitQuoteError = { key: string; message: string };

export type LimitQuoteResult = { params: LimitQuoteParams; route: LimitOrderQuoteRoute };

function reportQuoteError(error: unknown, params: LimitQuoteParams) {
  const key = getLimitErrorKey(error);
  const message = getLimitErrorMessage(error);

  if (!UNCAPTURED_ERROR_KEYS.has(key)) {
    captureWidgetError(error, {
      category: "api",
      extra: { ...params },
      tags: { endpoint: "limitQuote", errorKey: key },
    });
  }

  if (key === LIMIT_QUOTE_ERROR_KEYS.insufficientLiquidity) {
    toast.error(LIMIT_NO_ROUTES_MESSAGE, { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
  } else if (!HANDLED_ERROR_KEYS.has(key)) {
    toast.error(`Failed to get quote: ${message}`, { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
  }

  return { key, message, params };
}

type LimitQuoteSigner = { canSign: boolean; sourceAddress: string | undefined };

type LimitQuoteState = {
  error: (LimitQuoteError & { params: LimitQuoteParams }) | null;
  result: LimitQuoteResult | null;
};

async function fetchLimitQuote({
  params,
  signal,
  signer,
  swapKit,
}: {
  params: LimitQuoteParams;
  signal: AbortSignal;
  signer: LimitQuoteSigner | null;
  swapKit: SwapKitClient;
}): Promise<LimitQuoteState> {
  addSentryBreadcrumb("Fetching limit order quote", "api", { ...params, preview: !signer });

  try {
    const response = signer
      ? await swapKit.limitOrder.quote({ ...params, sourceAddress: signer.sourceAddress })
      : await SwapKitApi.getLimitOrderQuote(params);

    const route = response.routes[0];
    if (!route) throw Object.assign(new Error(response.error ?? "No limit order route"), { errorKey: "noRoute" });

    return { error: null, result: { params, route } };
  } catch (quoteError) {
    if (signal.aborted) return { error: null, result: null };
    return { error: reportQuoteError(quoteError, params), result: null };
  }
}

export function useLimitOrderQuote(params: LimitQuoteParams | null) {
  const { swapKit, connectedWallets } = useSwapKit();
  const apiConfig = useApiConfig();
  const [debouncedParams, setDebouncedParams] = useState(params);
  const paramsKey = params ? JSON.stringify(params) : null;

  useDebouncedEffect(() => setDebouncedParams(params), [paramsKey], { delay: 700, runImmediately: false });

  const sellChain = debouncedParams ? getAssetChain(debouncedParams.sellAsset) : undefined;
  const sellWallet = sellChain ? connectedWallets.get(sellChain) : undefined;

  const signer = useMemo<LimitQuoteSigner | null>(() => {
    if (!debouncedParams || !swapKit || !sellWallet) return null;
    let canSign = false;
    try {
      canSign = swapKit.limitOrder.canSign({ sellAsset: AssetValue.from({ asset: debouncedParams.sellAsset }) });
    } catch {
      canSign = false;
    }
    return { canSign, sourceAddress: sellWallet.address };
  }, [debouncedParams, swapKit, sellWallet]);

  const canRequest = !!debouncedParams && !!swapKit && (!signer || signer.canSign);

  const query = useSwapKitQuery({
    enabled: canRequest && apiConfig.hasAuth && apiConfig.settled,
    meta: { category: "api", tags: { endpoint: "limitQuote" } },
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      fetchLimitQuote({
        params: debouncedParams as LimitQuoteParams,
        signal,
        signer,
        swapKit: swapKit as SwapKitClient,
      }),
    queryKey: [LIMIT_QUOTE_QUERY_KEY, apiConfig.key, debouncedParams, signer],
  });

  const reset = useCallback(() => setDebouncedParams(null), []);

  const refetch = async () => {
    if (canRequest) await query.refetch();
  };

  const data = canRequest ? query.data : undefined;
  const signerError =
    debouncedParams && signer && !signer.canSign
      ? {
          key: LIMIT_QUOTE_ERROR_KEYS.noSignableProvider,
          message: "Wallet cannot sign limit orders",
          params: debouncedParams,
        }
      : null;

  return {
    error: signerError ?? data?.error ?? null,
    isFetching: canRequest && query.isFetching,
    isPlaceholderData: canRequest && query.isPlaceholderData,

    refetch,
    reset,
    result: data?.result ?? null,
  };
}
