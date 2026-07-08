import { beforeEach, describe, expect, test } from "bun:test";

import { AssetValue, Chain } from "@swapkit/helpers";
import type { SwapToAsset } from "@swapkit/helpers/api";
import { filterAndSortAssets } from "../use-filtered-sorted-assets";

function makeAssetsByChain(identifiers: string[]): Map<Chain, AssetValue[]> {
  const map = new Map<Chain, AssetValue[]>();
  for (const id of identifiers) {
    const asset = AssetValue.from({ asset: id });
    const chain = asset.chain;
    const chainAssets = map.get(chain) || [];
    chainAssets.push(asset);
    map.set(chain, chainAssets);
  }
  return map;
}

function makeSwapToAsset(identifier: string): SwapToAsset {
  const asset = AssetValue.from({ asset: identifier });
  return {
    chain: asset.chain,
    identifier: asset.toString(),
    providers: [],
    symbol: asset.symbol,
    ticker: asset.ticker,
  };
}

const STATIC_IDENTIFIERS = [
  "ETH.ETH",
  "BTC.BTC",
  "ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "ETH.USDT-0xdAC17F958D2ee523a2206206994597C13D831ec7",
  "ARB.ETH",
  "ARB.USDC-0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "BASE.ETH",
  "SOL.SOL",
];

const SWAPTO_ONLY_IDENTIFIER = "ETH.UNI-0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";

beforeEach(() => {
  const tokenMap = new Map<string, { identifier: string; decimal: number }>();
  for (const id of [...STATIC_IDENTIFIERS, SWAPTO_ONLY_IDENTIFIER]) {
    tokenMap.set(id, { decimal: id.startsWith("ETH.USDC") ? 6 : 18, identifier: id });
  }
  AssetValue.setStaticAssets(tokenMap);
});

describe("filterAndSortAssets", () => {
  describe("filterBySwapTo: true — swapTo-only assets appear in results", () => {
    test("assets in swapTo but NOT in static assetsByChain are included", () => {
      const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

      const swapToAssets: SwapToAsset[] = [makeSwapToAsset("ETH.ETH"), makeSwapToAsset(SWAPTO_ONLY_IDENTIFIER)];

      const result = filterAndSortAssets({
        assetsByChain,
        balanceLookup: new Map(),
        options: { filterBySwapTo: true },
        searchQuery: "",
        selectedNetworks: [],
        swapToAssets,
      });

      const resultIdentifiers = result.map((a) => a.toString());
      expect(resultIdentifiers).toContain(AssetValue.from({ asset: SWAPTO_ONLY_IDENTIFIER }).toString());
      expect(resultIdentifiers).toContain("ETH.ETH");
    });

    test("assets NOT in swapTo are excluded", () => {
      const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);
      const swapToAssets: SwapToAsset[] = [makeSwapToAsset("ETH.ETH")];

      const result = filterAndSortAssets({
        assetsByChain,
        balanceLookup: new Map(),
        options: { filterBySwapTo: true },
        searchQuery: "",
        selectedNetworks: [],
        swapToAssets,
      });

      const resultIdentifiers = result.map((a) => a.toString());
      expect(resultIdentifiers).toContain("ETH.ETH");
      expect(resultIdentifiers).not.toContain("BTC.BTC");
      expect(resultIdentifiers).not.toContain("ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    });

    test("empty swapToAssets with filterBySwapTo returns no assets", () => {
      const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

      const result = filterAndSortAssets({
        assetsByChain,
        balanceLookup: new Map(),
        options: { filterBySwapTo: true },
        searchQuery: "",
        selectedNetworks: [],
        swapToAssets: [],
      });

      expect(result).toEqual([]);
    });
  });

  describe("filterBySwapTo: false — full static list returned", () => {
    test("returns all static assets regardless of swapToAssets content", () => {
      const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);
      const swapToAssets: SwapToAsset[] = [makeSwapToAsset("ETH.ETH")];

      const result = filterAndSortAssets({
        assetsByChain,
        balanceLookup: new Map(),
        options: { filterBySwapTo: false },
        searchQuery: "",
        selectedNetworks: [],
        swapToAssets,
      });

      const resultIdentifiers = result.map((a) => a.toString());
      for (const id of STATIC_IDENTIFIERS) {
        const normalized = AssetValue.from({ asset: id }).toString();
        expect(resultIdentifiers).toContain(normalized);
      }
    });

    test("returns all static assets when options is undefined", () => {
      const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

      const result = filterAndSortAssets({
        assetsByChain,
        balanceLookup: new Map(),
        options: undefined,
        searchQuery: "",
        selectedNetworks: [],
        swapToAssets: [],
      });

      expect(result.length).toBe(STATIC_IDENTIFIERS.length);
    });
  });

  describe("network filtering combined with filterBySwapTo", () => {
    test("selectedNetworks restricts to those chains when filterBySwapTo is false", () => {
      const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

      const result = filterAndSortAssets({
        assetsByChain,
        balanceLookup: new Map(),
        options: { filterBySwapTo: false },
        searchQuery: "",
        selectedNetworks: [Chain.Ethereum],
        swapToAssets: [],
      });

      for (const asset of result) {
        expect(asset.chain).toBe(Chain.Ethereum);
      }
      expect(result.length).toBeGreaterThan(0);
    });

    test("selectedNetworks restricts swapTo-filtered results to those chains", () => {
      const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);
      const swapToAssets: SwapToAsset[] = [
        makeSwapToAsset("ETH.ETH"),
        makeSwapToAsset("ARB.ETH"),
        makeSwapToAsset(SWAPTO_ONLY_IDENTIFIER),
      ];

      const result = filterAndSortAssets({
        assetsByChain,
        balanceLookup: new Map(),
        options: { filterBySwapTo: true },
        searchQuery: "",
        selectedNetworks: [Chain.Ethereum],
        swapToAssets,
      });

      const resultIdentifiers = result.map((a) => a.toString());
      expect(resultIdentifiers).toContain("ETH.ETH");
      expect(resultIdentifiers).toContain(AssetValue.from({ asset: SWAPTO_ONLY_IDENTIFIER }).toString());
      expect(resultIdentifiers).not.toContain("ARB.ETH");
    });

    test("multiple selected networks return assets from all selected chains", () => {
      const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

      const result = filterAndSortAssets({
        assetsByChain,
        balanceLookup: new Map(),
        options: { filterBySwapTo: false },
        searchQuery: "",
        selectedNetworks: [Chain.Ethereum, Chain.Bitcoin],
        swapToAssets: [],
      });

      const chains = new Set(result.map((a) => a.chain));
      for (const chain of chains) {
        expect([Chain.Ethereum, Chain.Bitcoin]).toContain(chain);
      }
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("search query filtering on swapTo-sourced assets", () => {
    test("search by ticker name filters swapTo results", () => {
      const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);
      const swapToAssets: SwapToAsset[] = [
        makeSwapToAsset("ETH.ETH"),
        makeSwapToAsset(SWAPTO_ONLY_IDENTIFIER), // ticker: UNI
      ];

      const result = filterAndSortAssets({
        assetsByChain,
        balanceLookup: new Map(),
        options: { filterBySwapTo: true },
        searchQuery: "uni",
        selectedNetworks: [],
        swapToAssets,
      });

      const resultIdentifiers = result.map((a) => a.toString());
      expect(resultIdentifiers).toContain(AssetValue.from({ asset: SWAPTO_ONLY_IDENTIFIER }).toString());
      expect(resultIdentifiers).not.toContain("ETH.ETH");
    });

    test("search by partial identifier filters results", () => {
      const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);
      const swapToAssets: SwapToAsset[] = [
        makeSwapToAsset("ETH.ETH"),
        makeSwapToAsset("ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
      ];

      const result = filterAndSortAssets({
        assetsByChain,
        balanceLookup: new Map(),
        options: { filterBySwapTo: true },
        searchQuery: "usdc",
        selectedNetworks: [],
        swapToAssets,
      });

      const resultIdentifiers = result.map((a) => a.toString());
      expect(resultIdentifiers).toContain("ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
      expect(resultIdentifiers).not.toContain("ETH.ETH");
    });

    test("empty search query returns all matching assets", () => {
      const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);
      const swapToAssets: SwapToAsset[] = [makeSwapToAsset("ETH.ETH"), makeSwapToAsset("BTC.BTC")];

      const result = filterAndSortAssets({
        assetsByChain,
        balanceLookup: new Map(),
        options: { filterBySwapTo: true },
        searchQuery: "",
        selectedNetworks: [],
        swapToAssets,
      });

      expect(result.length).toBe(2);
    });

    test("search is case-insensitive", () => {
      const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);
      const swapToAssets: SwapToAsset[] = [makeSwapToAsset("ETH.ETH"), makeSwapToAsset(SWAPTO_ONLY_IDENTIFIER)];

      const resultUpper = filterAndSortAssets({
        assetsByChain,
        balanceLookup: new Map(),
        options: { filterBySwapTo: true },
        searchQuery: "UNI",
        selectedNetworks: [],
        swapToAssets,
      });

      const resultLower = filterAndSortAssets({
        assetsByChain,
        balanceLookup: new Map(),
        options: { filterBySwapTo: true },
        searchQuery: "uni",
        selectedNetworks: [],
        swapToAssets,
      });

      expect(resultUpper.map((a) => a.toString())).toEqual(resultLower.map((a) => a.toString()));
      expect(resultUpper.length).toBeGreaterThan(0);
    });
  });

  describe("combined network + search + filterBySwapTo", () => {
    test("all three filters work together", () => {
      const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);
      const swapToAssets: SwapToAsset[] = [
        makeSwapToAsset("ETH.ETH"),
        makeSwapToAsset("ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
        makeSwapToAsset("ARB.USDC-0xaf88d065e77c8cC2239327C5EDb3A432268e5831"),
        makeSwapToAsset("BTC.BTC"),
      ];

      const result = filterAndSortAssets({
        assetsByChain,
        balanceLookup: new Map(),
        options: { filterBySwapTo: true },
        searchQuery: "usdc",
        selectedNetworks: [Chain.Ethereum],
        swapToAssets,
      });

      expect(result.length).toBe(1);
      expect(result[0]?.toString()).toBe("ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    });
  });
});
