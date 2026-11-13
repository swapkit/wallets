import type { LimitOrder } from "@swapkit/helpers";
import { SwapKitApi } from "@swapkit/helpers/api";
import type { LimitOrderCursors, LimitOrderPage } from "../lib/limit-orders/merge";
import { getPollInterval } from "../lib/limit-orders/polling";
import { limitOrderKeys } from "../lib/limit-orders/query-keys";
import {
  isTerminalLimitOrderStatus,
  LIMIT_ORDER_SCOPE_STATUSES,
  type LimitOrderScope,
} from "../lib/limit-orders/status";
import {
  type InfiniteData,
  type QueryClient,
  useApiConfig,
  useSwapKitQuery,
  useSwapKitQueryClient,
} from "../lib/query-client";
import { clearLimitOrderCancel } from "../stores/limit-order-cancel-store";

export const LIMIT_ORDER_POLL_MS = 30_000;

type LimitOrderListData = InfiniteData<LimitOrderPage, LimitOrderCursors>;

function belongsToScope(scope: unknown, order: LimitOrder) {
  if (scope !== "active" && scope !== "history") return true;
  return (LIMIT_ORDER_SCOPE_STATUSES[scope as LimitOrderScope] as readonly string[]).includes(order.status);
}

export function patchLimitOrderInLists(queryClient: QueryClient, cfg: string, order: LimitOrder) {
  for (const [queryKey, data] of queryClient.getQueriesData<LimitOrderListData>({
    queryKey: limitOrderKeys.lists(cfg),
  })) {
    if (!data) continue;
    const keep = belongsToScope(queryKey[3], order);
    let changed = false;
    const pages = data.pages.map((page) => {
      if (!page.orders.some(({ orderId }) => orderId === order.orderId)) return page;
      changed = true;
      const orders = keep
        ? page.orders.map((row) => (row.orderId === order.orderId ? order : row))
        : page.orders.filter(({ orderId }) => orderId !== order.orderId);
      return { ...page, orders };
    });
    if (changed) queryClient.setQueryData<LimitOrderListData>(queryKey, { ...data, pages });
  }
}

export function useLimitOrder(
  orderId: string | null | undefined,
  { enabled = true, placeholder }: { enabled?: boolean; placeholder?: LimitOrder } = {},
) {
  const apiConfig = useApiConfig();
  const queryClient = useSwapKitQueryClient();

  const query = useSwapKitQuery({
    enabled: enabled && Boolean(orderId) && apiConfig.hasAuth && apiConfig.settled,
    meta: { category: "api", tags: { endpoint: "limitOrder" } },
    placeholderData: placeholder,
    queryFn: async () => {
      const order = await SwapKitApi.getLimitOrder(orderId ?? "");
      patchLimitOrderInLists(queryClient, apiConfig.key, order);
      if (isTerminalLimitOrderStatus(order.status)) clearLimitOrderCancel(order.orderId);
      return order;
    },
    queryKey: limitOrderKeys.detail(apiConfig.key, orderId ?? ""),
    refetchInterval: (q) => {
      const order = q.state.data;
      if (order && isTerminalLimitOrderStatus(order.status) && !order.cancelRequestedAt) return false;
      return getPollInterval({ baseMs: LIMIT_ORDER_POLL_MS, error: q.state.error });
    },
    refetchOnMount: "always",
  });

  return {
    error: query.error,
    isFetching: query.isFetching,
    isFresh: query.isFetchedAfterMount && !query.isPlaceholderData,
    order: query.data ?? placeholder,
    refetch: query.refetch,
  };
}
