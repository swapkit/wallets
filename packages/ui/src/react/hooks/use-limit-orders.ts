import type { LimitOrder } from "@swapkit/helpers";
import { SwapKitApi } from "@swapkit/helpers/api";
import { useCallback, useMemo } from "react";
import { type LimitOrderCursors, type LimitOrderPage, mergeOrderPages } from "../lib/limit-orders/merge";
import { isPhantomExpiry } from "../lib/limit-orders/phantom";
import { getPollInterval } from "../lib/limit-orders/polling";
import { limitOrderKeys } from "../lib/limit-orders/query-keys";
import { getAssetPriceId, type LimitOrderRowPrices } from "../lib/limit-orders/row-model";
import { isLiveLimitOrderStatus, LIMIT_ORDER_SCOPE_STATUSES, type LimitOrderScope } from "../lib/limit-orders/status";
import { type InfiniteData, useApiConfig, useSwapKitInfiniteQuery } from "../lib/query-client";
import { useLimitOrderOwnerAddresses } from "./use-limit-order-owner-addresses";
import { useTokenPrices, useTokenPricesQuery } from "./use-token-prices";

export const LIMIT_ORDERS_PAGE_SIZE = 20;
export const LIMIT_ORDERS_POLL_MS = 60_000;
const LIMIT_ORDERS_STALE_MS = 20_000;

async function fetchLimitOrderPage(scope: LimitOrderScope, cursors: LimitOrderCursors): Promise<LimitOrderPage> {
  const streams = Object.entries(cursors).filter(([, cursor]) => cursor !== null);
  const responses = await Promise.all(
    streams.map(async ([address, cursor]) => {
      const response = await SwapKitApi.getLimitOrders({
        cursor: cursor ?? undefined,
        destinationAddress: address,
        limit: LIMIT_ORDERS_PAGE_SIZE,
        sourceAddress: address,
        status: [...LIMIT_ORDER_SCOPE_STATUSES[scope]],
      });
      return [address, response] as const;
    }),
  );

  const nextCursors: LimitOrderCursors = { ...cursors };
  const orders: LimitOrder[] = [];
  for (const [address, response] of responses) {
    nextCursors[address] = response.nextCursor ?? null;
    orders.push(...response.orders);
  }

  return { cursors: nextCursors, orders };
}

function getNextCursors(lastPage: LimitOrderPage) {
  return Object.values(lastPage.cursors).some((cursor) => typeof cursor === "string") ? lastPage.cursors : undefined;
}

function selectOrders(data: InfiniteData<LimitOrderPage, LimitOrderCursors>) {
  const { orders, watermark } = mergeOrderPages(data.pages);
  return { orders: orders.filter((order) => !isPhantomExpiry(order)), watermark };
}

export function useLimitOrders(scope: LimitOrderScope, { enabled = true }: { enabled?: boolean } = {}) {
  const apiConfig = useApiConfig();
  const { addresses, addressesKey } = useLimitOrderOwnerAddresses();

  const query = useSwapKitInfiniteQuery({
    enabled: enabled && apiConfig.hasAuth && apiConfig.settled && addresses.length > 0,
    getNextPageParam: getNextCursors,
    initialPageParam: Object.fromEntries(addresses.map((address) => [address, undefined])) as LimitOrderCursors,
    meta: { category: "api", tags: { endpoint: "limitOrders" } },
    queryFn: ({ pageParam }) => fetchLimitOrderPage(scope, pageParam),
    queryKey: limitOrderKeys.list(apiConfig.key, scope, addressesKey),
    refetchInterval: (q) =>
      getPollInterval({
        baseMs: LIMIT_ORDERS_POLL_MS * Math.max(q.state.data?.pages.length ?? 1, 1),
        error: q.state.error,
      }),
    select: selectOrders,
    staleTime: LIMIT_ORDERS_STALE_MS,
  });

  return {
    error: query.error,
    fetchMore: query.fetchNextPage,
    hasData: query.data !== undefined,
    hasMore: query.hasNextPage,
    isFetching: query.isFetching,
    isFetchingMore: query.isFetchingNextPage,
    isLoading: query.isLoading,
    orders: query.data?.orders ?? [],
    refetch: query.refetch,
    watermark: query.data?.watermark,
  };
}

export function useOrderPrices(orders: LimitOrder[]) {
  const liveOrders = useMemo(() => orders.filter((order) => isLiveLimitOrderStatus(order.status)), [orders]);
  const priceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const order of liveOrders) {
      for (const asset of [order.sellAsset, order.buyAsset]) {
        const id = getAssetPriceId(asset);
        if (id) ids.add(id);
      }
    }
    return [...ids].sort();
  }, [liveOrders]);

  const pricesQuery = useTokenPricesQuery(priceIds, { refetchInterval: 60_000 });
  const { pricesByTokenId } = useTokenPrices();

  const getPrices = useCallback(
    (order: LimitOrder): LimitOrderRowPrices => {
      const sellId = getAssetPriceId(order.sellAsset);
      const buyId = getAssetPriceId(order.buyAsset);
      return {
        buy: buyId ? pricesByTokenId.get(buyId)?.priceUSD : undefined,
        sell: sellId ? pricesByTokenId.get(sellId)?.priceUSD : undefined,
      };
    },
    [pricesByTokenId],
  );

  return { getPrices, isPriceLoading: pricesQuery.isLoading };
}
