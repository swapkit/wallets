import { SwapKitApi, type Token } from "@swapkit/helpers";
import { CancelledError } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import {
  hasApiAuth,
  PRICES_QUERY_KEY,
  useApiConfig,
  useSwapKitQuery,
  useSwapKitQueryClient,
} from "../lib/query-client";

type TokenPrice = { identifier: Token["identifier"]; priceUSD: number };
type PricesByTokenId = Map<TokenPrice["identifier"], TokenPrice>;

function pricesQueryKey(apiConfigKey: string, tokenIds: string[]) {
  return [PRICES_QUERY_KEY, apiConfigKey, [...new Set(tokenIds)].sort()] as const;
}

async function fetchPrices(tokenIds: string[], apiConfigKey: string, signal: AbortSignal): Promise<TokenPrice[]> {
  if (signal.aborted || !hasApiAuth(apiConfigKey)) throw new CancelledError({ silent: true });
  const tokenPrices = await SwapKitApi.getPrice({
    metadata: false,
    tokens: tokenIds.map((identifier) => ({ identifier })),
  });

  if (signal.aborted || !hasApiAuth(apiConfigKey)) throw new CancelledError({ silent: true });
  return tokenPrices
    .filter((tokenPrice) => tokenPrice?.identifier && tokenPrice?.price_usd)
    .map((tokenPrice) => ({
      identifier: tokenPrice?.identifier as Token["identifier"],
      priceUSD: tokenPrice?.price_usd ?? 0,
    }));
}

function pricesQueryOptions(apiConfigKey: string, tokenIds: string[]) {
  const queryKey = pricesQueryKey(apiConfigKey, tokenIds);
  return {
    meta: { category: "data", tags: { endpoint: "price" } } as const,
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchPrices(queryKey[2], apiConfigKey, signal),
    queryKey,
  };
}

export function useTokenPricesQuery(tokenIds: string[], { refetchInterval }: { refetchInterval?: number } = {}) {
  const apiConfig = useApiConfig();
  const options = pricesQueryOptions(apiConfig.key, tokenIds);
  return useSwapKitQuery({
    ...options,
    enabled: options.queryKey[2].length > 0 && apiConfig.hasAuth && apiConfig.settled,
    refetchInterval,
  });
}

type PriceSource = { data: TokenPrice[]; updatedAt: number };

// The prices cached for one API config merged into one map; the most recently updated price wins.
function usePricesByTokenId(apiConfigKey: string) {
  const queryClient = useSwapKitQueryClient();
  const snapshot = useRef<{ sources: PriceSource[]; prices: PricesByTokenId }>({ prices: new Map(), sources: [] });

  const getSnapshot = useCallback(() => {
    const sources = queryClient
      .getQueryCache()
      .findAll({ queryKey: [PRICES_QUERY_KEY, apiConfigKey] })
      .flatMap(({ state }) =>
        state.data ? [{ data: state.data as TokenPrice[], updatedAt: state.dataUpdatedAt }] : [],
      )
      .sort((a, b) => a.updatedAt - b.updatedAt);
    const previous = snapshot.current.sources;
    const unchanged =
      sources.length === previous.length &&
      sources.every((source, i) => source.data === previous[i]?.data && source.updatedAt === previous[i]?.updatedAt);
    if (unchanged) return snapshot.current.prices;

    const prices: PricesByTokenId = new Map();
    for (const { data } of sources) {
      for (const tokenPrice of data) prices.set(tokenPrice.identifier, tokenPrice);
    }
    snapshot.current = { prices, sources };
    return prices;
  }, [queryClient, apiConfigKey]);

  const subscribe = useCallback(
    (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange),
    [queryClient],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useTokenPriceActions() {
  const queryClient = useSwapKitQueryClient();
  const apiConfigKey = useApiConfig().key;

  const fetchTokenPrices = useCallback(
    async (tokenIds: Token["identifier"][]) => {
      if (!hasApiAuth() || tokenIds.length === 0) return;
      await queryClient.fetchQuery(pricesQueryOptions(apiConfigKey, tokenIds)).catch(() => undefined);
    },
    [queryClient, apiConfigKey],
  );

  const setTokenPrices = useCallback(
    (tokenPrices: TokenPrice[]) => {
      if (!hasApiAuth()) return;
      const tokenIds = tokenPrices.map(({ identifier }) => identifier);
      queryClient.setQueryData(pricesQueryKey(apiConfigKey, tokenIds), tokenPrices);
    },
    [queryClient, apiConfigKey],
  );

  // Queries still observed (gas and selected assets) stay; balance and quote prices go.
  const clearTokenPrices = useCallback(
    () => queryClient.removeQueries({ queryKey: [PRICES_QUERY_KEY], type: "inactive" }),
    [queryClient],
  );

  return useMemo(
    () => ({ clearTokenPrices, fetchTokenPrices, setTokenPrices }),
    [clearTokenPrices, fetchTokenPrices, setTokenPrices],
  );
}

export function useTokenPrices() {
  const actions = useTokenPriceActions();
  const pricesByTokenId = usePricesByTokenId(useApiConfig().key);

  return useMemo(() => ({ ...actions, pricesByTokenId }), [actions, pricesByTokenId]);
}
