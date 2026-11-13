import { AssetValue, type Chain, SwapKitApi } from "@swapkit/helpers";
import { useState } from "react";
import { isAssetIdentifierAlias } from "../lib/asset-aliases";
import { keepPreviousData, useApiConfig, useSwapKitQuery, useSwapKitQueryClient } from "../lib/query-client";
import { useDebouncedEffect } from "./use-debounced-effect";

type TokenSearchParams = Parameters<typeof SwapKitApi.searchTokens>[0];
type TokenSearchResponseToken = Awaited<ReturnType<typeof SwapKitApi.searchTokens>>["tokens"][number];

export type TokenSearchAsset = { asset: AssetValue; logoURI?: string; name: string };

const NO_TOKEN_SEARCH_ASSETS: TokenSearchAsset[] = [];
const NO_TOKEN_SEARCH_RESULT = { assets: NO_TOKEN_SEARCH_ASSETS, isSearching: false };

export function resolveTokenSearchAssets(tokens: TokenSearchResponseToken[]): TokenSearchAsset[] {
  const resolved: TokenSearchAsset[] = [];

  for (const token of tokens) {
    if (isAssetIdentifierAlias(token.identifier)) continue;
    try {
      const normalizedAsset = AssetValue.from({ asset: token.identifier });
      const asset = new AssetValue({ decimal: token.decimals, identifier: normalizedAsset.toString(), value: 0 });
      resolved.push({ asset, logoURI: token.logoURI, name: token.name });
    } catch {}
  }

  return resolved;
}

function getTokenSearchParams(query: string, selectedNetworks: Chain[]): TokenSearchParams[] {
  const searchTerm = query.trim();

  if (searchTerm.length >= 2) {
    return selectedNetworks.length > 0
      ? selectedNetworks.map((chain) => ({ chain, limit: 100, query: searchTerm }))
      : [{ limit: 100, query: searchTerm }];
  }

  // The API can use a chain-only request once `query` becomes optional.
  return selectedNetworks.map((chain) => ({ chain, limit: 100, query: `${chain}.` }));
}

async function searchChain(params: TokenSearchParams) {
  const { tokens } = await SwapKitApi.searchTokens(params);
  return resolveTokenSearchAssets(tokens);
}

// Each network's results are cached on their own, so changing the network filter only requests what is missing.
function searchTokens(
  queryClient: ReturnType<typeof useSwapKitQueryClient>,
  apiConfigKey: string,
  requests: TokenSearchParams[],
) {
  return Promise.allSettled(
    requests.map((params) =>
      queryClient.ensureQueryData({
        meta: {
          category: "api",
          extra: { chain: params.chain, query: params.query },
          tags: { endpoint: "tokenSearch" },
        },
        queryFn: () => searchChain(params),
        queryKey: ["tokenSearch", apiConfigKey, params.chain ?? null, params.query.toLowerCase()],
        staleTime: Number.POSITIVE_INFINITY,
      }),
    ),
  ).then((results) => results.flatMap((result) => (result.status === "fulfilled" ? result.value : [])));
}

export function useTokenSearch({
  enabled = true,
  query,
  selectedNetworks,
}: {
  enabled?: boolean;
  query: string;
  selectedNetworks: Chain[];
}) {
  const apiConfig = useApiConfig();
  const queryClient = useSwapKitQueryClient();
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useDebouncedEffect(() => setDebouncedQuery(query), [query], { delay: 300, runImmediately: true });

  const requests = getTokenSearchParams(debouncedQuery, selectedNetworks);
  const canSearch = enabled && requests.length > 0 && apiConfig.hasAuth && apiConfig.settled;

  const { data, isFetching } = useSwapKitQuery({
    enabled: canSearch,
    placeholderData: keepPreviousData,
    queryFn: () => searchTokens(queryClient, apiConfig.key, requests),
    queryKey: ["tokenSearch", apiConfig.key, debouncedQuery.trim().toLowerCase(), selectedNetworks],
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (!canSearch) return NO_TOKEN_SEARCH_RESULT;
  return { assets: data ?? NO_TOKEN_SEARCH_ASSETS, isSearching: isFetching };
}
