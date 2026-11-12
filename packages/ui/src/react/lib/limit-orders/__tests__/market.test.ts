import { describe, expect, test } from "bun:test";

import { formatMarketChip, getMarketComparison } from "../market";

describe("getMarketComparison", () => {
  test("a sell waiting for the price to rise reads +9.9% to go", () => {
    const comparison = getMarketComparison({ buyPriceUsd: 1, order: { limitPrice: "2650" }, sellPriceUsd: 2412 });

    expect(comparison?.direction).toBe("sell");
    expect(comparison?.fillableNow).toBe(false);
    expect(comparison && formatMarketChip(comparison)).toBe("+9.9% to go");
  });

  test("a buy waiting for the price to fall is shown in the same orientation and reads −5.3% to go", () => {
    const comparison = getMarketComparison({
      buyPriceUsd: 2412,
      order: { limitPrice: "0.000437903845" },
      sellPriceUsd: 1,
    });

    expect(comparison?.direction).toBe("buy");
    expect(comparison?.marketDisplay).toBe("2412");
    expect(comparison && formatMarketChip(comparison)).toBe("−5.3% to go");
  });

  test("a cross-chain order divides the two USD prices", () => {
    const comparison = getMarketComparison({ buyPriceUsd: 2412, order: { limitPrice: "27.86" }, sellPriceUsd: 64_000 });

    expect(comparison?.direction).toBe("sell");
    expect(comparison && formatMarketChip(comparison)).toBe("+5.0% to go");
  });

  test("a market past the limit is fillable now", () => {
    const comparison = getMarketComparison({ buyPriceUsd: 1, order: { limitPrice: "2400" }, sellPriceUsd: 2412 });

    expect(comparison?.fillableNow).toBe(true);
    expect(comparison && formatMarketChip(comparison)).toBe("fillable now");
  });

  test("a missing price gives no comparison", () => {
    expect(getMarketComparison({ buyPriceUsd: 1, order: { limitPrice: "2650" } })).toBeNull();
    expect(getMarketComparison({ order: { limitPrice: "2650" }, sellPriceUsd: 2412 })).toBeNull();
  });
});
