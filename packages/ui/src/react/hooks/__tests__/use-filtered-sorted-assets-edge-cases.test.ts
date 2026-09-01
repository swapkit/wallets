import { beforeEach, describe, expect, test } from "bun:test";

import { AssetValue, Chain } from "@swapkit/helpers";
import type { SwapToAsset } from "@swapkit/helpers/api";
import { filterAndSortAssets } from "../use-filtered-sorted-assets";

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

const UNI_CHECKSUMMED = "ETH.UNI-0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";
const UNI_LOWERCASE = "ETH.UNI-0x1f9840a85d5af5bf1d1762f925bdaddc4201f984";

function makeAssetsByChain(identifiers: string[]): Map<Chain, AssetValue[]> {
  const map = new Map<Chain, AssetValue[]>();
  for (const id of identifiers) {
    const asset = AssetValue.from({ asset: id });
    const chainAssets = map.get(asset.chain) || [];
    chainAssets.push(asset);
    map.set(asset.chain, chainAssets);
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

beforeEach(() => {
  const tokenMap = new Map<string, { identifier: string; decimal: number }>();
  for (const id of [...STATIC_IDENTIFIERS, UNI_CHECKSUMMED]) {
    tokenMap.set(id, { decimal: id.startsWith("ETH.USDC") || id.startsWith("ARB.USDC") ? 6 : 18, identifier: id });
  }
  AssetValue.setStaticAssets(tokenMap);
});

describe("case sensitivity", () => {
  test("swapTo with all-lowercase hex address resolves to checksummed form and appears in results", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

    const lowercaseAsset = AssetValue.from({ asset: UNI_LOWERCASE });
    const swapToAssets: SwapToAsset[] = [
      {
        chain: lowercaseAsset.chain,
        identifier: lowercaseAsset.toString(),
        providers: [],
        symbol: lowercaseAsset.symbol,
        ticker: lowercaseAsset.ticker,
      },
    ];

    const result = filterAndSortAssets({
      assetsByChain,
      assetsMap: new Map(),
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    const ids = result.map((a) => a.toString());
    expect(ids).toContain(UNI_CHECKSUMMED);
    expect(ids.some((id) => id === UNI_LOWERCASE)).toBe(false);
  });

  test("lowercase and checksummed swapTo identifiers resolve to the same asset", () => {
    const fromLower = AssetValue.from({ asset: UNI_LOWERCASE });
    const fromChecksummed = AssetValue.from({ asset: UNI_CHECKSUMMED });

    expect(fromLower.toString()).toBe(fromChecksummed.toString());
    expect(fromLower.chain).toBe(fromChecksummed.chain);
    expect(fromLower.ticker).toBe(fromChecksummed.ticker);
  });

  test("swapTo with UPPERCASE hex address resolves correctly", () => {
    const uppercaseIdentifier = "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48";
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

    const asset = AssetValue.from({ asset: uppercaseIdentifier });
    const swapToAssets: SwapToAsset[] = [
      { chain: asset.chain, identifier: asset.toString(), providers: [], symbol: asset.symbol, ticker: asset.ticker },
    ];

    const result = filterAndSortAssets({
      assetsByChain,
      assetsMap: new Map(),
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBe(1);
    expect(result[0]?.toString()).toBe("ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
  });
});

describe("assetsMap key mismatch after full token load", () => {
  test("assetsMap with UPPERCASE keys still allows swapTo resolution via fallback", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

    const assetsMap = new Map<string, AssetValue>();
    for (const id of STATIC_IDENTIFIERS) {
      assetsMap.set(id.toUpperCase(), AssetValue.from({ asset: id }));
    }
    assetsMap.set(UNI_CHECKSUMMED.toUpperCase(), AssetValue.from({ asset: UNI_CHECKSUMMED }));

    const swapToAssets: SwapToAsset[] = [makeSwapToAsset(UNI_CHECKSUMMED)];

    const result = filterAndSortAssets({
      assetsByChain,
      assetsMap,
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    const ids = result.map((a) => a.toString());
    expect(ids).toContain(UNI_CHECKSUMMED);
  });

  test("assetsMap lookup with checksummed key succeeds when assetsMap uses checksummed keys", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

    const assetsMap = new Map<string, AssetValue>();
    const uniAsset = AssetValue.from({ asset: UNI_CHECKSUMMED });
    assetsMap.set(UNI_CHECKSUMMED, uniAsset);

    const swapToAssets: SwapToAsset[] = [makeSwapToAsset(UNI_CHECKSUMMED)];

    const result = filterAndSortAssets({
      assetsByChain,
      assetsMap,
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBe(1);
    expect(result[0]).toBe(uniAsset);
  });

  test("assetsMap lookup FAILS with uppercase key when swapTo identifier is checksummed", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

    const assetsMap = new Map<string, AssetValue>();
    const uniAssetFromMap = AssetValue.from({ asset: UNI_CHECKSUMMED });
    assetsMap.set(UNI_CHECKSUMMED.toUpperCase(), uniAssetFromMap);

    const swapToAssets: SwapToAsset[] = [makeSwapToAsset(UNI_CHECKSUMMED)];

    const result = filterAndSortAssets({
      assetsByChain,
      assetsMap,
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBe(1);
    expect(result[0]).not.toBe(uniAssetFromMap);
    expect(result[0]?.toString()).toBe(UNI_CHECKSUMMED);
  });
});

describe("missing tokens not in static lists", () => {
  test("completely unknown token identifier with valid chain falls back to chain default decimals", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);
    const unknownToken = "ETH.SHIB-0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE";

    const asset = AssetValue.from({ asset: unknownToken });
    const swapToAssets: SwapToAsset[] = [
      { chain: asset.chain, identifier: asset.toString(), providers: [], symbol: asset.symbol, ticker: asset.ticker },
    ];

    const result = filterAndSortAssets({
      assetsByChain,
      assetsMap: new Map(),
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBe(1);
    expect(result[0]?.chain).toBe(Chain.Ethereum);
    expect(result[0]?.ticker).toBe("SHIB");
  });

  test("swapTo with mix of known and unknown tokens includes all resolvable ones", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);
    const unknownToken = "ETH.AAVE-0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9";

    const swapToAssets: SwapToAsset[] = [
      makeSwapToAsset("ETH.ETH"),
      {
        chain: Chain.Ethereum,
        identifier: AssetValue.from({ asset: unknownToken }).toString(),
        providers: [],
        symbol: "AAVE-0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
        ticker: "AAVE",
      },
    ];

    const result = filterAndSortAssets({
      assetsByChain,
      assetsMap: new Map(),
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBe(2);
    const tickers = result.map((a) => a.ticker);
    expect(tickers).toContain("ETH");
    expect(tickers).toContain("AAVE");
  });
});

describe("swapTo before loadFullTokenLists", () => {
  test("swapTo results shown even with empty assetsByChain (pre-load)", () => {
    const emptyAssetsByChain = new Map<Chain, AssetValue[]>();

    const swapToAssets: SwapToAsset[] = [makeSwapToAsset("ETH.ETH"), makeSwapToAsset(UNI_CHECKSUMMED)];

    const result = filterAndSortAssets({
      assetsByChain: emptyAssetsByChain,
      assetsMap: new Map(),
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBe(2);
    const ids = result.map((a) => a.toString());
    expect(ids).toContain("ETH.ETH");
    expect(ids).toContain(UNI_CHECKSUMMED);
  });

  test("filterBySwapTo=false with empty assetsByChain returns empty", () => {
    const emptyAssetsByChain = new Map<Chain, AssetValue[]>();

    const result = filterAndSortAssets({
      assetsByChain: emptyAssetsByChain,
      balanceLookup: new Map(),
      options: { filterBySwapTo: false },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets: [],
    });

    expect(result.length).toBe(0);
  });

  test("empty assetsMap does not prevent swapTo asset resolution", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);
    const swapToAssets: SwapToAsset[] = [makeSwapToAsset("ETH.ETH")];

    const result = filterAndSortAssets({
      assetsByChain,
      assetsMap: undefined,
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBe(1);
    expect(result[0]?.toString()).toBe("ETH.ETH");
  });
});

describe("empty swapTo edge cases", () => {
  test("empty swapToAssets with filterBySwapTo=true returns no assets", () => {
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

  test("empty swapToAssets with network filter still returns no assets", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

    const result = filterAndSortAssets({
      assetsByChain,
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [Chain.Ethereum],
      swapToAssets: [],
    });

    expect(result).toEqual([]);
  });

  test("undefined options with non-empty swapToAssets still returns full static list", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);
    const swapToAssets: SwapToAsset[] = [makeSwapToAsset("ETH.ETH")];

    const result = filterAndSortAssets({
      assetsByChain,
      balanceLookup: new Map(),
      options: undefined,
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBe(STATIC_IDENTIFIERS.length);
  });
});

describe("balance overlay with swapTo assets", () => {
  test("swapTo asset from assetsMap carries balance forward after set()", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

    const ethAsset = AssetValue.from({ asset: "ETH.ETH" });
    const assetsMap = new Map<string, AssetValue>();
    assetsMap.set("ETH.ETH", ethAsset);

    const balanceAsset = AssetValue.from({ asset: "ETH.ETH", value: 1.5 });
    const balanceLookup = new Map<string, AssetValue>();
    balanceLookup.set("ETH.ETH", balanceAsset);

    const swapToAssets: SwapToAsset[] = [makeSwapToAsset("ETH.ETH")];

    const result = filterAndSortAssets({
      assetsByChain,
      assetsMap,
      balanceLookup,
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBe(1);
    expect(result[0]?.getValue("number")).toBeGreaterThan(0);
  });

  test("swapTo-only asset (not in assetsMap) still gets balance overlay if balanceLookup has entry", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

    const balanceAsset = AssetValue.from({ asset: UNI_CHECKSUMMED, value: 42 });
    const balanceLookup = new Map<string, AssetValue>();
    balanceLookup.set(UNI_CHECKSUMMED, balanceAsset);

    const swapToAssets: SwapToAsset[] = [makeSwapToAsset(UNI_CHECKSUMMED)];

    const result = filterAndSortAssets({
      assetsByChain,
      assetsMap: new Map(),
      balanceLookup,
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBe(1);
    expect(result[0]?.toString()).toBe(UNI_CHECKSUMMED);
    expect(result[0]?.getValue("number")).toBe(42);
  });

  test("balance overlay key matches checksummed toString(), not raw identifier", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

    const balanceAsset = AssetValue.from({ asset: UNI_CHECKSUMMED, value: 10 });
    const balanceLookup = new Map<string, AssetValue>();
    balanceLookup.set(UNI_CHECKSUMMED, balanceAsset);

    balanceLookup.set(UNI_LOWERCASE, AssetValue.from({ asset: UNI_CHECKSUMMED, value: 999 }));

    const swapToAssets: SwapToAsset[] = [makeSwapToAsset(UNI_CHECKSUMMED)];

    const result = filterAndSortAssets({
      assetsByChain,
      assetsMap: new Map(),
      balanceLookup,
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBe(1);
    expect(result[0]?.getValue("number")).toBe(10);
  });
});

describe("network filter + swapTo interaction", () => {
  test("selecting ETH network excludes ARB swapTo assets", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);
    const swapToAssets: SwapToAsset[] = [
      makeSwapToAsset("ETH.ETH"),
      makeSwapToAsset("ARB.ETH"),
      makeSwapToAsset("BASE.ETH"),
      makeSwapToAsset(UNI_CHECKSUMMED),
    ];

    const result = filterAndSortAssets({
      assetsByChain,
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [Chain.Ethereum],
      swapToAssets,
    });

    for (const asset of result) {
      expect(asset.chain).toBe(Chain.Ethereum);
    }
    const ids = result.map((a) => a.toString());
    expect(ids).toContain("ETH.ETH");
    expect(ids).toContain(UNI_CHECKSUMMED);
    expect(ids).not.toContain("ARB.ETH");
    expect(ids).not.toContain("BASE.ETH");
  });

  test("selecting no networks returns all swapTo chains", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);
    const swapToAssets: SwapToAsset[] = [
      makeSwapToAsset("ETH.ETH"),
      makeSwapToAsset("ARB.ETH"),
      makeSwapToAsset("BTC.BTC"),
    ];

    const result = filterAndSortAssets({
      assetsByChain,
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    const chains = new Set(result.map((a) => a.chain));
    expect(chains.has(Chain.Ethereum)).toBe(true);
    expect(chains.has(Chain.Arbitrum)).toBe(true);
    expect(chains.has(Chain.Bitcoin)).toBe(true);
  });

  test("selecting a network with no matching swapTo assets returns empty", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);
    const swapToAssets: SwapToAsset[] = [makeSwapToAsset("ETH.ETH")];

    const result = filterAndSortAssets({
      assetsByChain,
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [Chain.Solana],
      swapToAssets,
    });

    expect(result.length).toBe(0);
  });
});

describe("getSwapTo identifier backward compatibility", () => {
  test("normalized identifier from getSwapTo round-trips through AssetValue.from().toString()", () => {
    const testIdentifiers = [
      "ETH.ETH",
      "BTC.BTC",
      UNI_CHECKSUMMED,
      "ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    ];

    for (const id of testIdentifiers) {
      const roundTripped = AssetValue.from({ asset: id }).toString();
      const doubleRoundTripped = AssetValue.from({ asset: roundTripped }).toString();
      expect(roundTripped).toBe(doubleRoundTripped);
    }
  });

  test("identifier comparison between SwapToAsset and assetsMap uses exact string match", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

    const assetsMap = new Map<string, AssetValue>();
    const usdcChecksummed = "ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const usdcAsset = AssetValue.from({ asset: usdcChecksummed });
    assetsMap.set(usdcChecksummed, usdcAsset);

    const swapToAssets: SwapToAsset[] = [makeSwapToAsset(usdcChecksummed)];

    const result = filterAndSortAssets({
      assetsByChain,
      assetsMap,
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBe(1);
    expect(result[0]).toBe(usdcAsset);
  });
});

describe("sorting edge cases with swapTo assets", () => {
  test("swapTo assets with balance sort above those without", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

    const balanceLookup = new Map<string, AssetValue>();
    balanceLookup.set(UNI_CHECKSUMMED, AssetValue.from({ asset: UNI_CHECKSUMMED, value: 5 }));

    const swapToAssets: SwapToAsset[] = [makeSwapToAsset("ETH.ETH"), makeSwapToAsset(UNI_CHECKSUMMED)];

    const result = filterAndSortAssets({
      assetsByChain,
      assetsMap: new Map(),
      balanceLookup,
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBe(2);
    const uniIndex = result.findIndex((a) => a.ticker === "UNI");
    const ethIndex = result.findIndex((a) => a.ticker === "ETH");
    expect(uniIndex).toBeLessThan(ethIndex);
  });

  test("exact ticker match in search prioritizes correctly among swapTo assets", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

    const swapToAssets: SwapToAsset[] = [
      makeSwapToAsset("ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
      makeSwapToAsset("ARB.USDC-0xaf88d065e77c8cC2239327C5EDb3A432268e5831"),
      makeSwapToAsset("ETH.ETH"),
    ];

    const result = filterAndSortAssets({
      assetsByChain,
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "usdc",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBe(2);
    for (const asset of result) {
      expect(asset.ticker).toBe("USDC");
    }
  });
});

describe("unresolvable swapTo identifiers", () => {
  test("completely malformed identifier in swapTo is silently skipped", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

    const swapToAssets: SwapToAsset[] = [
      makeSwapToAsset("ETH.ETH"),
      { chain: Chain.Ethereum, identifier: "NOT_A_VALID_IDENTIFIER", providers: [], symbol: "FAKE", ticker: "FAKE" },
    ];

    const result = filterAndSortAssets({
      assetsByChain,
      assetsMap: new Map(),
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBe(1);
    expect(result[0]?.toString()).toBe("ETH.ETH");
  });

  test("empty string identifier in swapTo is handled gracefully", () => {
    const assetsByChain = makeAssetsByChain(STATIC_IDENTIFIERS);

    const swapToAssets: SwapToAsset[] = [
      makeSwapToAsset("ETH.ETH"),
      { chain: Chain.Ethereum, identifier: "", providers: [], symbol: "", ticker: "" },
    ];

    const result = filterAndSortAssets({
      assetsByChain,
      assetsMap: new Map(),
      balanceLookup: new Map(),
      options: { filterBySwapTo: true },
      searchQuery: "",
      selectedNetworks: [],
      swapToAssets,
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((a) => a.toString() === "ETH.ETH")).toBe(true);
  });
});
