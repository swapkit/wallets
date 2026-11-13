import { describe, expect, test } from "bun:test";

import {
  formatLimitPercent,
  getDeviationBps,
  getLimitPair,
  getLimitPresets,
  getLimitPriceBand,
  getLimitQuoteParams,
  getLimitSides,
  getQuoteAmount,
  getTriggerSummary,
  isPositiveAmount,
  type LimitDirection,
  limitPriceToPercent,
  parseLimitPercentInput,
  percentToLimitPrice,
  toDisplayPrice,
  toWirePrice,
} from "../price";

const ETH = "ETH.ETH";
const USDC = "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48";

const SELL_EFFECTIVE_FILL_PRICE = "2420.2008";
const BUY_EFFECTIVE_FILL_PRICE = "0.0004160033167495846758";

describe("orientation", () => {
  test("the base asset is the one the trigger names, on both sides", () => {
    expect(getLimitSides({ buyAsset: USDC, direction: "sell", sellAsset: ETH })).toEqual({
      baseAsset: ETH,
      quoteAsset: USDC,
    });
    expect(getLimitSides({ buyAsset: ETH, direction: "buy", sellAsset: USDC })).toEqual({
      baseAsset: ETH,
      quoteAsset: USDC,
    });
    for (const direction of ["sell", "buy"] as const) {
      const pair = getLimitPair({ baseAsset: ETH, direction, quoteAsset: USDC });
      expect(getLimitSides({ ...pair, direction })).toEqual({ baseAsset: ETH, quoteAsset: USDC });
    }
  });

  test.each([
    ["sell", "2541.21", "2541.21"],
    ["buy", "2500", "0.0004"],
    ["buy", "2283.61", "0.000437903144582481247"],
  ] as const)("%s: %s USDC per ETH travels as %s", (direction, displayPrice, wirePrice) => {
    expect(toWirePrice({ direction, displayPrice })).toBe(wirePrice);
    expect(toDisplayPrice({ direction, wirePrice })).toBe(displayPrice);
  });

  test("a buy order sends the reciprocal of the price on screen, never the price itself", () => {
    const params = getLimitQuoteParams({
      baseAmount: "1",
      baseAsset: ETH,
      direction: "buy",
      displayPrice: "2500",
      quoteAsset: USDC,
    });

    expect(params).toEqual({ buyAmount: "1", buyAsset: ETH, limitPrice: "0.0004", sellAsset: USDC });
  });

  test("a sell order sends the price on screen, with the base amount on the sell side", () => {
    const params = getLimitQuoteParams({
      baseAmount: "1.0",
      baseAsset: ETH,
      direction: "sell",
      displayPrice: "2541.21",
      quoteAsset: USDC,
    });

    expect(params).toEqual({ buyAsset: USDC, limitPrice: "2541.21", sellAmount: "1", sellAsset: ETH });
  });
});

describe("presets against the effective fill price", () => {
  test.each([
    ["sell", SELL_EFFECTIVE_FILL_PRICE, ["2420.20", "2541.21", "2662.22"]],
    ["buy", BUY_EFFECTIVE_FILL_PRICE, ["2163.44", "2283.64", "2403.83"]],
  ] as const)("%s", (direction, effectiveFillPrice, prices) => {
    expect(getLimitPresets({ direction, effectiveFillPrice }).map(({ displayPrice }) => displayPrice)).toEqual([
      ...prices,
    ]);
  });

  test("the cross-chain pair keeps its own denomination", () => {
    expect(percentToLimitPrice({ direction: "sell", effectiveFillPrice: "26.52935", percent: "5" })).toBe("27.86");
  });

  test.each([
    ["sell", "2541.21", "5"],
    ["sell", "2650", "9.5"],
    ["sell", "2415", "-0.21"],
    ["sell", "2200", "-9.1"],
    ["buy", "2283.64", "-5"],
    ["buy", "2403.83", "0"],
  ] as const)("%s at %s reads %s%% vs market", (direction, displayPrice, percent) => {
    const effectiveFillPrice = direction === "sell" ? SELL_EFFECTIVE_FILL_PRICE : BUY_EFFECTIVE_FILL_PRICE;
    expect(limitPriceToPercent({ direction, displayPrice, effectiveFillPrice })).toBe(percent);
  });

  test("selling above the anchor and buying below it both wait, in the backend's signed bps", () => {
    const sellBps = getDeviationBps({
      direction: "sell",
      displayPrice: "2541.21",
      effectiveFillPrice: SELL_EFFECTIVE_FILL_PRICE,
    });
    const buyBps = getDeviationBps({
      direction: "buy",
      displayPrice: "2283.64",
      effectiveFillPrice: BUY_EFFECTIVE_FILL_PRICE,
    });

    expect(sellBps).toBe(500);
    expect(buyBps).toBe(526);
    expect(getLimitPriceBand(sellBps ?? 0)).toBe("resting");
    expect(getLimitPriceBand(buyBps ?? 0)).toBe("resting");
  });

  test.each([
    ["sell", "2415", -21],
    ["sell", "2200", -910],
    ["sell", "2650", 950],
  ] as const)("%s at %s mirrors the design's %d bps", (direction, displayPrice, bps) => {
    expect(getDeviationBps({ direction, displayPrice, effectiveFillPrice: SELL_EFFECTIVE_FILL_PRICE })).toBe(bps);
  });
});

describe("percent input", () => {
  test.each([
    ["", { status: "empty" }],
    ["   ", { status: "empty" }],
    ["-", { status: "incomplete" }],
    ["+", { status: "incomplete" }],
    [".", { status: "incomplete" }],
    ["−", { status: "incomplete" }],
    ["+5", { percent: "5", status: "valid" }],
    ["5.", { percent: "5", status: "valid" }],
    [".5", { percent: "0.5", status: "valid" }],
    ["-0", { percent: "0", status: "valid" }],
    ["−5", { percent: "-5", status: "valid" }],
    ["-99.99", { percent: "-99.99", status: "valid" }],
    ["-100", { status: "invalid" }],
    ["5,5", { status: "invalid" }],
    ["1e3", { status: "invalid" }],
    ["5%", { status: "invalid" }],
    ["--5", { status: "invalid" }],
  ] as const)("%p", (raw, expected) => {
    expect(parseLimitPercentInput(raw)).toEqual(expected);
  });

  test.each([
    ["5", "+5.0"],
    ["-5", "-5.0"],
    ["0", "0.0"],
    ["-0.001", "0.0"],
    ["-0.21", "-0.2"],
    ["9.495", "+9.5"],
    [
      limitPriceToPercent({ direction: "buy", displayPrice: "0.0003925", effectiveFillPrice: "2420.2008" }) ?? "",
      "-5.0",
    ],
  ])("%s formats as %s and parses back", (percent, formatted) => {
    expect(formatLimitPercent(percent)).toBe(formatted);
    const parsed = parseLimitPercentInput(formatted);
    expect(parsed.status).toBe("valid");
  });
});

describe("bands", () => {
  test.each([
    [950, "resting"],
    [1, "resting"],
    [0, "withinFeeGap"],
    [-21, "withinFeeGap"],
    [-99, "withinFeeGap"],
    [-100, "beyond"],
    [-910, "beyond"],
  ] as const)("%d bps is %s", (bps, band) => {
    expect(getLimitPriceBand(bps)).toBe(band);
  });
});

describe("amounts and the trigger summary", () => {
  test.each([
    ["1", true],
    ["0.5", true],
    [".5", true],
    ["0", false],
    ["-1", false],
    ["1,000", false],
    ["1e3", false],
  ] as const)("%s is a positive amount: %s", (value, expected) => {
    expect(isPositiveAmount(value)).toBe(expected);
  });

  test.each([
    ["sell", "1.0", "2541.21", "2541.21"],
    ["sell", "0.123456", "2541.21", "313.727621"],
    ["buy", "0.123456", "2283.61", "281.925357"],
    ["buy", "0.0000001", "2283.61", "0.000229"],
    ["sell", "0.0000001", "2283.61", "0.000228"],
  ] as const)("%s %s base at %s gives %s quote", (direction, baseAmount, displayPrice, quoteAmount) => {
    expect(getQuoteAmount({ baseAmount, direction, displayPrice, quoteDecimals: 6 })).toBe(quoteAmount);
  });

  test.each([
    ["sell", { amountRole: "receive", condition: "atOrAbove", price: "2,541.21", quoteAmount: "2,541.21" }],
    ["buy", { amountRole: "pay", condition: "atOrBelow", price: "2,541.21", quoteAmount: "2,541.22" }],
  ] as const)("%s rounds the quote amount conservatively", (direction: LimitDirection, summary) => {
    expect(getTriggerSummary({ direction, displayPrice: "2541.21", quoteAmount: "2541.215" })).toEqual(summary);
  });
});
