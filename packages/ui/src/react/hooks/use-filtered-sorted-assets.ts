import { AssetValue, type Chain } from "@swapkit/helpers";
import { useMemo, useState } from "react";
import { useWalletsConfig } from "../swapkit-config-context";
import { assetsByChain, assetsMap, useSwapKit, useSwapKitStore } from "../swapkit-context";
import type { UseFilteredSortedAssetsFilters } from "../types";
import { useDebouncedEffect } from "./use-debounced-effect";
import { type TokenSearchAsset, useTokenSearch } from "./use-token-search";

function resolveSwapToAssets(
  swapToAssets: { identifier: string }[],
  assetsMapParam: Map<string, AssetValue> | undefined,
): AssetValue[] {
  const resolved: AssetValue[] = [];
  for (const swapToAsset of swapToAssets) {
    const fromMap = assetsMapParam?.get(swapToAsset.identifier);
    if (fromMap) {
      resolved.push(fromMap);
    } else {
      try {
        resolved.push(AssetValue.from({ asset: swapToAsset.identifier }));
      } catch {
        // skip unresolvable assets
      }
    }
  }
  return resolved;
}

function collectAssetsToFilter({
  assetsByChain,
  assetsMapParam,
  options,
  selectedNetworks,
  swapToAssets,
}: {
  assetsByChain: Map<Chain, AssetValue[]>;
  assetsMapParam?: Map<string, AssetValue>;
  options?: { filterBySwapTo?: boolean };
  selectedNetworks: Chain[];
  swapToAssets: { identifier: string }[];
}): AssetValue[] {
  if (options?.filterBySwapTo) {
    const resolved = resolveSwapToAssets(swapToAssets, assetsMapParam);

    if (selectedNetworks.length > 0) {
      const networkSet = new Set(selectedNetworks);
      return resolved.filter((a) => networkSet.has(a.chain));
    }
    return resolved;
  }

  return selectedNetworks.length > 0
    ? selectedNetworks.flatMap((chain) => assetsByChain.get(chain) ?? [])
    : Array.from(assetsByChain.values()).flat();
}

function applySearchAndBalance(
  assets: AssetValue[],
  searchQuery: string,
  balanceLookup: Map<string, AssetValue>,
): AssetValue[] {
  const results: AssetValue[] = [];

  for (const asset of assets) {
    if (!asset?.ticker || !asset?.chain || (!asset?.address && !asset?.chainId)) continue;

    if (searchQuery.length >= 1) {
      const identifier = asset.toString().toLowerCase();
      const matchesSearch = identifier.includes(searchQuery) || asset.symbol?.toLowerCase()?.includes(searchQuery);

      if (!matchesSearch) continue;
    }

    const balance = balanceLookup.get(asset.toString());
    results.push(balance ? asset.set(balance) : asset);
  }

  return results;
}

function applyTokenSearchAndBalance(
  tokenSearchAssets: TokenSearchAsset[],
  searchQuery: string,
  balanceLookup: Map<string, AssetValue>,
): AssetValue[] {
  const results: AssetValue[] = [];

  for (const { asset, name } of tokenSearchAssets) {
    if (searchQuery.length >= 1) {
      const matchesSearch =
        asset.toString().toLowerCase().includes(searchQuery) ||
        asset.symbol.toLowerCase().includes(searchQuery) ||
        name.toLowerCase().includes(searchQuery);

      if (!matchesSearch) continue;
    }

    const balance = balanceLookup.get(asset.toString());
    results.push(balance ? asset.set(balance) : asset);
  }

  return results;
}

export function filterAndSortAssets({
  assetsByChain,
  assetsMap: assetsMapParam,
  balanceLookup,
  options,
  searchQuery,
  selectedNetworks,
  swapToAssets,
  tokenSearchAssets = [],
}: {
  assetsByChain: Map<Chain, AssetValue[]>;
  assetsMap?: Map<string, AssetValue>;
  balanceLookup: Map<string, AssetValue>;
  options?: { filterBySwapTo?: boolean };
  searchQuery: string;
  selectedNetworks: Chain[];
  swapToAssets: { identifier: string }[];
  tokenSearchAssets?: TokenSearchAsset[];
}) {
  const lowerSearchQuery = searchQuery.toLowerCase();

  const assetsToFilter = collectAssetsToFilter({
    assetsByChain,
    assetsMapParam,
    options,
    selectedNetworks,
    swapToAssets,
  });

  const localResults = sortAssets({
    assets: applySearchAndBalance(assetsToFilter, lowerSearchQuery, balanceLookup),
    searchQuery: lowerSearchQuery,
  });

  if (options?.filterBySwapTo || tokenSearchAssets.length === 0) return localResults;

  const seenIdentifiers = new Set(localResults.map((asset) => asset.toString()));
  const selectedNetworkSet = new Set(selectedNetworks);
  const apiOnlyResults: AssetValue[] = [];
  const matchingTokenSearchAssets =
    selectedNetworks.length > 0
      ? tokenSearchAssets.filter(({ asset }) => selectedNetworkSet.has(asset.chain))
      : tokenSearchAssets;

  for (const asset of applyTokenSearchAndBalance(matchingTokenSearchAssets, lowerSearchQuery, balanceLookup)) {
    const identifier = asset.toString();
    if (seenIdentifiers.has(identifier)) continue;
    seenIdentifiers.add(identifier);
    apiOnlyResults.push(asset);
  }

  return [...localResults, ...apiOnlyResults];
}

export function useFilteredSortedAssets(options?: { filterBySwapTo?: boolean }) {
  const { balancesByChain } = useSwapKit();
  const { swapToAssets } = useSwapKitStore();
  const { isChainAllowed } = useWalletsConfig();
  const [filters, setFilters] = useState<UseFilteredSortedAssetsFilters>({ searchQuery: "", selectedNetworks: [] });
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const filterBySwapTo = options?.filterBySwapTo;
  // The swap-to pair request may never run (missing credentials) or fail — in
  // both cases swapToAssets stays empty. Filtering the output picker by an
  // empty pair list would render a dead-end "No assets found", so only filter
  // when we actually have pair data and fall back to the full catalog otherwise.
  const swapToFilterActive = Boolean(filterBySwapTo) && swapToAssets.length > 0;

  useDebouncedEffect(() => setDebouncedSearchQuery(filters.searchQuery ?? ""), [filters.searchQuery], {
    delay: 300,
    runImmediately: true,
  });
  const selectedNetworks = useMemo(
    () => (filters.selectedNetworks ?? []).filter(isChainAllowed),
    [filters.selectedNetworks, isChainAllowed],
  );
  const { assets: tokenSearchAssets, isSearching: isSearchingTokens } = useTokenSearch({
    enabled: !swapToFilterActive,
    query: filters.searchQuery ?? "",
    selectedNetworks,
  });

  const filteredAssets = useMemo(() => {
    // Intersect with isChainAllowed in both branches — when the user picks no
    // chains we still need to exclude assets on chains the integrator disabled.
    const allowedNetworks =
      selectedNetworks.length > 0 ? selectedNetworks : Array.from(assetsByChain.keys()).filter(isChainAllowed);

    const balanceLookup = new Map<string, AssetValue>();
    for (const balances of balancesByChain.values()) {
      for (const { identifier, balance } of balances) {
        balanceLookup.set(identifier, balance);
      }
    }

    return filterAndSortAssets({
      assetsByChain,
      assetsMap,
      balanceLookup,
      options: { filterBySwapTo: swapToFilterActive },
      searchQuery: debouncedSearchQuery,
      selectedNetworks: allowedNetworks,
      swapToAssets,
      tokenSearchAssets,
    });
  }, [
    debouncedSearchQuery,
    selectedNetworks,
    balancesByChain,
    swapToFilterActive,
    swapToAssets,
    tokenSearchAssets,
    isChainAllowed,
  ]);

  const tokenLogoUrls = useMemo(() => {
    const logoUrls = new Map<string, string>();
    for (const { asset, logoURI } of tokenSearchAssets) {
      if (logoURI) logoUrls.set(asset.toString(), logoURI);
    }
    return logoUrls;
  }, [tokenSearchAssets]);

  return useMemo(
    () => ({ assets: filteredAssets, filters, isSearchingTokens, setFilters, tokenLogoUrls }),
    [filters, filteredAssets, isSearchingTokens, tokenLogoUrls],
  );
}

function sortAssets({ assets, searchQuery }: { assets: AssetValue[]; searchQuery: string }) {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sorting logic requires multiple priority conditions
  return assets?.sort((assetValueA, assetValueB) => {
    const hasBalanceA = assetValueA?.getValue?.("number") > 0;
    const hasBalanceB = assetValueB?.getValue?.("number") > 0;

    const tickerA = assetValueA.ticker?.toLowerCase() ?? "";
    const tickerB = assetValueB.ticker?.toLowerCase() ?? "";

    const exactTickerMatchA = searchQuery.length >= 1 && tickerA === searchQuery;
    const exactTickerMatchB = searchQuery.length >= 1 && tickerB === searchQuery;

    const startsWithQueryA = searchQuery.length >= 1 && tickerA.startsWith(searchQuery);
    const startsWithQueryB = searchQuery.length >= 1 && tickerB.startsWith(searchQuery);

    if (exactTickerMatchA && hasBalanceA && !(exactTickerMatchB && hasBalanceB)) return -1;
    if (exactTickerMatchB && hasBalanceB && !(exactTickerMatchA && hasBalanceA)) return 1;

    if (exactTickerMatchA && !exactTickerMatchB) return -1;
    if (!exactTickerMatchA && exactTickerMatchB) return 1;

    if (hasBalanceA && !hasBalanceB) return -1;
    if (!hasBalanceA && hasBalanceB) return 1;

    if (startsWithQueryA && !startsWithQueryB) return -1;
    if (!startsWithQueryA && startsWithQueryB) return 1;

    if (assetValueA.type === "Native" && assetValueB.type !== "Native") return -1;
    if (assetValueA.type !== "Native" && assetValueB.type === "Native") return 1;

    return assetValueA.toString().localeCompare(assetValueB.toString());
  });
}
