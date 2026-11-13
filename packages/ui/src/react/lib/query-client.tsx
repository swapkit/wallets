import { type SKConfigState, swapKitConfigStore } from "@swapkit/helpers";
import {
  type DefaultError,
  type InfiniteData,
  QueryCache,
  QueryClient,
  type QueryKey,
  type UseInfiniteQueryOptions,
  type UseQueryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useStore } from "zustand/react";
import { useDebouncedEffect } from "../hooks/use-debounced-effect";
import { captureWidgetError } from "../sentry";
import { isRateLimited } from "./api-errors";

export type { InfiniteData, QueryClient } from "@tanstack/react-query";
export { keepPreviousData } from "@tanstack/react-query";

export const PRICES_QUERY_KEY = "prices";

type WidgetQueryMeta = Parameters<typeof captureWidgetError>[1];

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: WidgetQueryMeta;
  }
}

export function createWidgetQueryClient() {
  const queryCache = new QueryCache({
    onError: (error, query) => {
      const meta = query.meta ?? { category: "api" };
      console.warn(`[SwapKit] Request failed (${meta.tags?.endpoint ?? "unknown"}):`, error);
      if (!isRateLimited(error)) captureWidgetError(error, meta);
    },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
    queryCache,
  });
  queryClient.setQueryDefaults([PRICES_QUERY_KEY], { gcTime: Number.POSITIVE_INFINITY });
  return queryClient;
}

const API_CONFIG_DEBOUNCE_MS = 700;

function selectApiConfigKey(state: SKConfigState) {
  const envs = state?.envs;
  return JSON.stringify({
    apiKey: state?.apiKeys?.swapKit,
    baseUrl: envs?.isDev ? envs?.devApiUrl : envs?.apiUrl,
    widgetId: state?.widgetId,
    widgetKey: state?.widgetKey,
  });
}

function selectHasAuth(state: SKConfigState) {
  return Boolean(state?.apiKeys?.swapKit) || Boolean(state?.widgetId && state?.widgetKey);
}

export function hasApiAuth(expectedKey?: string) {
  const state = swapKitConfigStore.getState();
  return selectHasAuth(state) && (expectedKey === undefined || selectApiConfigKey(state) === expectedKey);
}

type ApiConfig = { hasAuth: boolean; key: string; settled: boolean };

const SwapKitQueryContext = createContext<{ queryClient: QueryClient; apiConfig: ApiConfig } | null>(null);

export function SwapKitQueryClientProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createWidgetQueryClient);
  const liveKey = useStore(swapKitConfigStore, selectApiConfigKey);
  const hasAuth = useStore(swapKitConfigStore, selectHasAuth);
  const [key, setKey] = useState(liveKey);

  useEffect(() => {
    queryClient.mount();
    return () => queryClient.unmount();
  }, [queryClient]);

  useDebouncedEffect(() => setKey(liveKey), [liveKey], { delay: API_CONFIG_DEBOUNCE_MS, runImmediately: false });

  useEffect(() => {
    if (hasAuth) return;
    void queryClient.cancelQueries({ queryKey: [PRICES_QUERY_KEY] });
    void queryClient.resetQueries({ queryKey: [PRICES_QUERY_KEY] });
    queryClient.removeQueries({ queryKey: [PRICES_QUERY_KEY], type: "inactive" });
  }, [hasAuth, queryClient]);

  const settled = key === liveKey;
  const value = useMemo(
    () => ({ apiConfig: { hasAuth, key, settled }, queryClient }),
    [hasAuth, key, settled, queryClient],
  );

  return <SwapKitQueryContext.Provider value={value}>{children}</SwapKitQueryContext.Provider>;
}

function useSwapKitQueryContext() {
  const context = useContext(SwapKitQueryContext);
  if (!context) throw new Error("useSwapKitQueryClient must be used inside <SwapKitWidget>");
  return context;
}

export function useSwapKitQueryClient() {
  return useSwapKitQueryContext().queryClient;
}

export function useApiConfig() {
  return useSwapKitQueryContext().apiConfig;
}

export function useSwapKitQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>) {
  return useQuery(options, useSwapKitQueryClient());
}

export function useSwapKitInfiniteQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(options: UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>) {
  return useInfiniteQuery(options, useSwapKitQueryClient());
}
