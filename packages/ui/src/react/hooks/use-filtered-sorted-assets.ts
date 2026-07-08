import { AssetValue, type Chain } from "@swapkit/helpers";
import { useMemo, useState } from "react";
import { useWalletsConfig } from "../swapkit-config-context";
import { assetsByChain, assetsMap, useSwapKit, useSwapKitStore } from "../swapkit-context";
import type { UseFilteredSortedAssetsFilters } from "../types";
import { useDebouncedEffect } from "./use-debounced-effect";

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

export function filterAndSortAssets({
  assetsByChain,
  assetsMap: assetsMapParam,
  balanceLookup,
  options,
  searchQuery,
  selectedNetworks,
  swapToAssets,
}: {
  assetsByChain: Map<Chain, AssetValue[]>;
  assetsMap?: Map<string, AssetValue>;
  balanceLookup: Map<string, AssetValue>;
  options?: { filterBySwapTo?: boolean };
  searchQuery: string;
  selectedNetworks: Chain[];
  swapToAssets: { identifier: string }[];
}) {
  const lowerSearchQuery = searchQuery.toLowerCase();

  const assetsToFilter = collectAssetsToFilter({
    assetsByChain,
    assetsMapParam,
    options,
    selectedNetworks,
    swapToAssets,
  });

  const results = applySearchAndBalance(assetsToFilter, lowerSearchQuery, balanceLookup);

  return sortAssets({ assets: results, searchQuery: lowerSearchQuery });
}

export function useFilteredSortedAssets(options?: { filterBySwapTo?: boolean }) {
  const { balancesByChain } = useSwapKit();
  const { swapToAssets } = useSwapKitStore();
  const { isChainAllowed } = useWalletsConfig();
  const [filters, setFilters] = useState<UseFilteredSortedAssetsFilters>({ searchQuery: "", selectedNetworks: [] });

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  useDebouncedEffect(() => setDebouncedSearchQuery(filters.searchQuery ?? ""), [filters.searchQuery], {
    delay: 300,
    runImmediately: true,
  });

  const filterBySwapTo = options?.filterBySwapTo;

  const filteredAssets = useMemo(() => {
    // Intersect with isChainAllowed in both branches — when the user picks no
    // chains we still need to exclude assets on chains the integrator disabled.
    const userSelected = filters.selectedNetworks ?? [];
    const selectedNetworks =
      userSelected.length > 0
        ? userSelected.filter(isChainAllowed)
        : Array.from(assetsByChain.keys()).filter(isChainAllowed);

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
      options: { filterBySwapTo },
      searchQuery: debouncedSearchQuery,
      selectedNetworks,
      swapToAssets,
    });
  }, [debouncedSearchQuery, filters.selectedNetworks, balancesByChain, filterBySwapTo, swapToAssets, isChainAllowed]);

  return useMemo(() => ({ assets: filteredAssets, filters, setFilters }), [filters, filteredAssets]);
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
