"use client";

import { AssetValue, type Chain, SKConfig, SwapKitApi } from "@swapkit/helpers";
import { useEffect, useState } from "react";
import { captureWidgetError } from "../sentry";
import { useDebouncedEffect } from "./use-debounced-effect";

type TokenSearchParams = Parameters<typeof SwapKitApi.searchTokens>[0];
type TokenSearchResponseToken = Awaited<ReturnType<typeof SwapKitApi.searchTokens>>["tokens"][number];

export type TokenSearchAsset = { asset: AssetValue; logoURI?: string; name: string };

const inFlightTokenSearchRequests = new Map<string, Promise<TokenSearchAsset[]>>();
const tokenSearchCache = new Map<string, TokenSearchAsset[]>();

export function resolveTokenSearchAssets(tokens: TokenSearchResponseToken[]): TokenSearchAsset[] {
  const resolved: TokenSearchAsset[] = [];

  for (const token of tokens) {
    try {
      const normalizedAsset = AssetValue.from({ asset: token.identifier });
      const asset = new AssetValue({ decimal: token.decimals, identifier: normalizedAsset.toString(), value: 0 });
      resolved.push({ asset, logoURI: token.logoURI, name: token.name });
    } catch {}
  }

  return resolved;
}

function getTokenSearchRequestKey({ chain, limit, page, query }: TokenSearchParams) {
  const { apiKeys, envs, widgetId, widgetKey } = SKConfig.getState();
  const baseUrl = envs.isDev ? envs.devApiUrl : envs.apiUrl;
  const authKey = apiKeys.swapKit
    ? `api:${apiKeys.swapKit}`
    : widgetId && widgetKey
      ? `widget:${widgetId}:${widgetKey}`
      : "";

  return authKey ? `${baseUrl}|${authKey}|${query.toLowerCase()}|${chain ?? ""}|${page ?? 1}|${limit ?? 100}` : null;
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

function fetchTokenSearch(params: TokenSearchParams, requestKey: string) {
  const cached = tokenSearchCache.get(requestKey);
  if (cached) return Promise.resolve(cached);

  let request = inFlightTokenSearchRequests.get(requestKey);
  if (!request) {
    request = SwapKitApi.searchTokens(params)
      .then(({ tokens }) => {
        const assets = resolveTokenSearchAssets(tokens);
        tokenSearchCache.set(requestKey, assets);
        return assets;
      })
      .catch((error) => {
        console.warn("[SwapKit] Failed to search tokens:", error);
        captureWidgetError(error, {
          category: "api",
          extra: { chain: params.chain, query: params.query },
          tags: { endpoint: "tokenSearch" },
        });
        return [];
      })
      .finally(() => inFlightTokenSearchRequests.delete(requestKey));
    inFlightTokenSearchRequests.set(requestKey, request);
  }

  return request;
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
  const [assets, setAssets] = useState<TokenSearchAsset[]>([]);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  useDebouncedEffect(() => setDebouncedQuery(query), [query], { delay: 300, runImmediately: true });

  useEffect(() => {
    if (!enabled) {
      setAssets([]);
      setIsSearching(false);
      return;
    }

    const requests = getTokenSearchParams(debouncedQuery, selectedNetworks).flatMap((params) => {
      const requestKey = getTokenSearchRequestKey(params);
      return requestKey ? [{ params, requestKey }] : [];
    });

    if (requests.length === 0) {
      setAssets([]);
      setIsSearching(false);
      return;
    }

    const cachedResults = requests.map(({ requestKey }) => tokenSearchCache.get(requestKey));
    if (cachedResults.every((result) => result !== undefined)) {
      setAssets(cachedResults.flatMap((result) => result ?? []));
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    void Promise.all(requests.map(({ params, requestKey }) => fetchTokenSearch(params, requestKey))).then((results) => {
      if (cancelled) return;
      setAssets(results.flat());
      setIsSearching(false);
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, enabled, selectedNetworks]);

  return { assets, isSearching };
}
