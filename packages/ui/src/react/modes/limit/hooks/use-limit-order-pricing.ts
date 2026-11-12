"use client";

import type { LimitOrderQuoteRoute } from "@swapkit/helpers";
import { useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  formatLimitPrice,
  getDeviationBps,
  getLimitPriceBand,
  getLimitQuoteParams,
  getLimitSides,
  getQuoteAmount,
  getSeedWirePrice,
  isPositiveAmount,
  LIMIT_DEFAULT_PRESET,
  type LimitDirection,
  type LimitQuoteParams,
  limitPriceToPercent,
  percentToLimitPrice,
  roundLimitPrice,
  toDisplayPrice,
  toWirePrice,
} from "../../../lib/limit-orders/price";
import { getLimitPriceScope, useLimitOrderStore } from "../limit-order-store";
import {
  LIMIT_QUOTE_ERROR_KEYS,
  type LimitQuoteError,
  type LimitQuoteResult,
  useLimitOrderQuote,
} from "./use-limit-order-quote";

function isSameAsset(a: string, b: string) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

function isSameParams(a: LimitQuoteParams | null | undefined, b: LimitQuoteParams | null) {
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}

function formatDisplay(direction: LimitDirection, wirePrice: string) {
  const display = toDisplayPrice({ direction, wirePrice });
  return display === null ? null : formatLimitPrice(display);
}

function getDeviation({
  direction,
  hasOrderRoute,
  priceInput,
  route,
}: {
  direction: LimitDirection;
  hasOrderRoute: boolean;
  priceInput: string | null;
  route: LimitOrderQuoteRoute | null;
}) {
  if (!route || !priceInput) return null;
  if (hasOrderRoute) return route.spotPriceDeviationBps;
  return getDeviationBps({ direction, displayPrice: priceInput, effectiveFillPrice: route.effectiveFillPrice });
}

function getPriceInput({
  direction,
  heldRoute,
  scope,
  storedPrice,
}: {
  direction: LimitDirection;
  heldRoute: LimitOrderQuoteRoute | null;
  scope: string;
  storedPrice: { scope: string; value: string } | null;
}) {
  const stored = storedPrice?.scope === scope ? storedPrice.value : null;
  if (!heldRoute || stored) return stored;
  const heldDisplay = toDisplayPrice({ direction, wirePrice: heldRoute.limitPrice });
  return heldDisplay === null ? null : roundLimitPrice(heldDisplay);
}

function resolveRouteState({
  buyAsset,
  error,
  heldRoute,
  isPlaceholderData,
  params,
  result,
  sellAsset,
}: {
  buyAsset: string;
  error: (LimitQuoteError & { params: LimitQuoteParams }) | null;
  heldRoute: LimitOrderQuoteRoute | null;
  isPlaceholderData: boolean;
  params: LimitQuoteParams | null;
  result: LimitQuoteResult | null;
  sellAsset: string;
}) {
  if (heldRoute) return { currentError: null, isRouteCurrent: true, route: heldRoute };
  const currentResult =
    result && isSameAsset(result.params.sellAsset, sellAsset) && isSameAsset(result.params.buyAsset, buyAsset)
      ? result
      : null;
  return {
    currentError: error && !isPlaceholderData && isSameParams(error.params, params) ? error : null,
    isRouteCurrent: !!currentResult && !isPlaceholderData && isSameParams(currentResult.params, params),
    route: currentResult?.route ?? null,
  };
}

function isDefaultPriceRequote({
  defaultPrice,
  isRouteCurrent,
  priceInput,
}: {
  defaultPrice: string | null;
  isRouteCurrent: boolean;
  priceInput: string | null;
}) {
  return !isRouteCurrent && priceInput !== null && priceInput === defaultPrice;
}

const NO_ROUTE_ERROR_KEYS = new Set<string>([
  LIMIT_QUOTE_ERROR_KEYS.insufficientLiquidity,
  LIMIT_QUOTE_ERROR_KEYS.unsupportedPair,
]);

function getDisplayRoute({
  currentError,
  hasRequest,
  lastRoute,
  route,
}: {
  currentError: LimitQuoteError | null;
  hasRequest: boolean;
  lastRoute: LimitOrderQuoteRoute | null;
  route: LimitOrderQuoteRoute | null;
}) {
  if (!hasRequest || (currentError && NO_ROUTE_ERROR_KEYS.has(currentError.key))) return null;
  return route ?? lastRoute;
}

function hasQuotableInput({
  baseAmount,
  baseAsset,
  isPairSupported,
  quoteAsset,
}: {
  baseAmount: string;
  baseAsset: string;
  isPairSupported: boolean | null;
  quoteAsset: string;
}) {
  return !!baseAsset && !!quoteAsset && !!baseAmount && isPositiveAmount(baseAmount) && isPairSupported !== false;
}

function getRequestParams({
  baseAmount,
  baseAsset,
  direction,
  displayPrice,
  heldRoute,
  isPairSupported,
  quoteAsset,
}: {
  baseAmount: string;
  baseAsset: string;
  direction: LimitDirection;
  displayPrice: string | null;
  heldRoute: LimitOrderQuoteRoute | null;
  isPairSupported: boolean | null;
  quoteAsset: string;
}) {
  if (heldRoute || !baseAsset || !quoteAsset || !baseAmount || !displayPrice || isPairSupported === false) return null;
  return getLimitQuoteParams({ baseAmount, baseAsset, direction, displayPrice, quoteAsset });
}

export function useLimitOrderPricing({
  baseAmount,
  buyAsset,
  buyPriceUsd,
  direction,
  heldRoute,
  isPairSupported,
  quoteDecimals,
  sellAsset,
  sellPriceUsd,
}: {
  baseAmount: string;
  buyAsset: string;
  buyPriceUsd: number | undefined;
  direction: LimitDirection;
  heldRoute: LimitOrderQuoteRoute | null;
  isPairSupported: boolean | null;
  quoteDecimals: number;
  sellAsset: string;
  sellPriceUsd: number | undefined;
}) {
  const { setStoredPrice, storedPrice } = useLimitOrderStore(
    useShallow((state) => ({ setStoredPrice: state.setPrice, storedPrice: state.price })),
  );
  const scope = getLimitPriceScope({ buyAsset, direction, sellAsset });
  const priceInput = getPriceInput({ direction, heldRoute, scope, storedPrice });
  const { baseAsset, quoteAsset } = getLimitSides({ buyAsset, direction, sellAsset });

  const lastRouteRef = useRef<{ pair: string; route: LimitOrderQuoteRoute } | null>(null);
  const defaultPriceRef = useRef<string | null>(null);
  const pairKey = `${sellAsset}:${buyAsset}`.toLowerCase();
  const lastRoute = lastRouteRef.current?.pair === pairKey ? lastRouteRef.current.route : null;
  const seedWirePrice = getSeedWirePrice({ buyPriceUsd, fallback: lastRoute?.spotPrice ?? null, sellPriceUsd });
  const requestDisplayPrice = priceInput ?? toDisplayPrice({ direction, wirePrice: seedWirePrice });

  const params = getRequestParams({
    baseAmount,
    baseAsset,
    direction,
    displayPrice: requestDisplayPrice,
    heldRoute,
    isPairSupported,
    quoteAsset,
  });

  const { error, isFetching, isPlaceholderData, refetch, reset, result } = useLimitOrderQuote(params);

  const { currentError, isRouteCurrent, route } = resolveRouteState({
    buyAsset,
    error,
    heldRoute,
    isPlaceholderData,

    params,
    result,
    sellAsset,
  });
  const hasOrderRoute = isRouteCurrent && priceInput !== null;
  const isQuotable = hasQuotableInput({ baseAmount, baseAsset, isPairSupported, quoteAsset });
  const displayRoute = getDisplayRoute({ currentError, hasRequest: !!heldRoute || isQuotable, lastRoute, route });

  useEffect(() => {
    if (route) lastRouteRef.current = { pair: pairKey, route };
  }, [route, pairKey]);

  useEffect(() => {
    if (!heldRoute && !isQuotable && storedPrice) useLimitOrderStore.setState({ price: null });
  }, [heldRoute, isQuotable, storedPrice]);

  useEffect(() => {
    if (heldRoute || !params || priceInput !== null || !route) return;
    const defaultPrice = percentToLimitPrice({
      direction,
      effectiveFillPrice: route.effectiveFillPrice,
      percent: String(LIMIT_DEFAULT_PRESET[direction]),
    });
    defaultPriceRef.current = defaultPrice;
    if (defaultPrice) setStoredPrice(scope, defaultPrice);
  }, [heldRoute, params, priceInput, route, direction, scope, setStoredPrice]);

  const setPrice = useCallback((value: string) => setStoredPrice(scope, value), [scope, setStoredPrice]);

  const setPercent = useCallback(
    (percent: string) => {
      if (!displayRoute) return;
      const value = percentToLimitPrice({ direction, effectiveFillPrice: displayRoute.effectiveFillPrice, percent });
      if (value) setStoredPrice(scope, value);
    },
    [displayRoute, direction, scope, setStoredPrice],
  );

  const deviationBps = getDeviation({ direction, hasOrderRoute, priceInput, route });
  const localQuoteAmount =
    priceInput && baseAmount
      ? getQuoteAmount({ baseAmount, direction, displayPrice: priceInput, quoteDecimals })
      : null;
  const routeQuoteAmount = route ? (direction === "sell" ? route.buyAmount : route.sellAmount) : null;

  return {
    anchor: displayRoute ? formatDisplay(direction, displayRoute.effectiveFillPrice) : null,
    band: deviationBps === null ? null : getLimitPriceBand(deviationBps),
    canRefresh: !!route && !heldRoute,
    displayRoute,
    error: currentError,
    hasOrderRoute,
    isAmountValid: !baseAmount || isPositiveAmount(baseAmount),
    isChecking: !!params && !isRouteCurrent && !currentError,
    isFetching,
    isPriceValid: priceInput === null || toWirePrice({ direction, displayPrice: priceInput }) !== null,
    isRefreshing:
      isFetching && !isDefaultPriceRequote({ defaultPrice: defaultPriceRef.current, isRouteCurrent, priceInput }),
    market: displayRoute ? formatDisplay(direction, displayRoute.spotPrice) : null,
    percent:
      displayRoute && priceInput
        ? limitPriceToPercent({
            direction,
            displayPrice: priceInput,
            effectiveFillPrice: displayRoute.effectiveFillPrice,
          })
        : null,
    priceInput,
    quoteAmount: currentError ? null : hasOrderRoute ? routeQuoteAmount : localQuoteAmount,
    refetch,
    reset,
    route,
    setPercent,
    setPrice,
  };
}
