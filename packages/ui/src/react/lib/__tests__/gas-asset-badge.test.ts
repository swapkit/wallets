import { describe, expect, test } from "bun:test";
import { Chain } from "@swapkit/helpers";

import { MINIMAL_TOKENS } from "../../minimal-tokens";
import { ALL_CONTROLLABLE_CHAINS, needsGasAssetBadge, pickDefaultAssetPair } from "../chain-catalog";

describe("needsGasAssetBadge", () => {
  test("badges a gas ticker shared across chains, except on its own chain", () => {
    expect(needsGasAssetBadge(Chain.Arbitrum, "ETH")).toBe(true);
    expect(needsGasAssetBadge(Chain.Hyperevm, "HYPE")).toBe(true);
    expect(needsGasAssetBadge(Chain.Arc, "USDC")).toBe(true);
    expect(needsGasAssetBadge(Chain.Ethereum, "ETH")).toBe(false);
    expect(needsGasAssetBadge(Chain.Hype, "HYPE")).toBe(false);
  });

  test("keeps unique gas assets without badge", () => {
    expect(needsGasAssetBadge(Chain.THORChain, "RUNE")).toBe(false);
  });
});

test("every controllable chain defaults to a gas asset preloaded in MINIMAL_TOKENS", () => {
  const preloaded = new Set(MINIMAL_TOKENS.map(({ identifier }) => identifier));
  const missing = ALL_CONTROLLABLE_CHAINS.map((chain) => pickDefaultAssetPair([chain]).input).filter(
    (identifier) => !preloaded.has(identifier),
  );
  expect(missing).toEqual([]);
});
