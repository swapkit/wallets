import { describe, expect, test } from "bun:test";

import {
  DEFAULT_SLIPPAGE_PERCENT,
  evaluateSlippageInput,
  formatSlippagePercent,
  MAX_SLIPPAGE_PERCENT,
  MIN_SLIPPAGE_PERCENT,
  SLIPPAGE_PRESETS_PERCENT,
} from "../slippage";

describe("formatSlippagePercent", () => {
  test("renders percentages without float noise", () => {
    expect(formatSlippagePercent(0.25)).toBe("0.25%");
    expect(formatSlippagePercent(1)).toBe("1%");
    expect(formatSlippagePercent(0.5)).toBe("0.5%");
    expect(formatSlippagePercent(0.1 + 0.2)).toBe("0.3%");
  });
});

describe("evaluateSlippageInput", () => {
  test("treats prefixes of a real value as incomplete, not invalid", () => {
    for (const raw of ["", "  ", "0", "0.", "0.00"]) {
      expect(evaluateSlippageInput(raw)).toEqual({ status: "incomplete" });
    }
  });

  test("commits parseable in-range values", () => {
    expect(evaluateSlippageInput("0.5")).toEqual({ percent: 0.5, status: "valid" });
    expect(evaluateSlippageInput("2")).toEqual({ percent: 2, status: "valid" });
    expect(evaluateSlippageInput(" 1.25 ")).toEqual({ percent: 1.25, status: "valid" });
    expect(evaluateSlippageInput("0.567")).toEqual({ percent: 0.57, status: "valid" });
  });

  test("accepts every offered preset", () => {
    for (const preset of SLIPPAGE_PRESETS_PERCENT) {
      expect(evaluateSlippageInput(String(preset))).toEqual({ percent: preset, status: "valid" });
    }
  });

  test("keeps the range boundaries themselves", () => {
    expect(evaluateSlippageInput(String(MIN_SLIPPAGE_PERCENT))).toEqual({
      percent: MIN_SLIPPAGE_PERCENT,
      status: "valid",
    });
    expect(evaluateSlippageInput(String(MAX_SLIPPAGE_PERCENT))).toEqual({
      percent: MAX_SLIPPAGE_PERCENT,
      status: "valid",
    });
  });

  test("rounds up to the minimum rather than rejecting a hair under it", () => {
    expect(evaluateSlippageInput("0.249")).toEqual({ percent: MIN_SLIPPAGE_PERCENT, status: "valid" });
  });

  test("rejects non-numeric text", () => {
    const evaluated = evaluateSlippageInput("abc");
    expect(evaluated.status).toBe("invalid");
    expect(evaluated).toHaveProperty("error");
  });

  test("rejects values below the minimum and above the maximum", () => {
    expect(evaluateSlippageInput("0.1")).toEqual({ error: `Minimum is ${MIN_SLIPPAGE_PERCENT}%`, status: "invalid" });
    expect(evaluateSlippageInput("51")).toEqual({ error: `Maximum is ${MAX_SLIPPAGE_PERCENT}%`, status: "invalid" });
  });
});

describe("defaults", () => {
  test("the default is a preset inside the accepted range", () => {
    expect(SLIPPAGE_PRESETS_PERCENT).toContain(DEFAULT_SLIPPAGE_PERCENT);
    expect(DEFAULT_SLIPPAGE_PERCENT).toBeGreaterThanOrEqual(MIN_SLIPPAGE_PERCENT);
    expect(DEFAULT_SLIPPAGE_PERCENT).toBeLessThanOrEqual(MAX_SLIPPAGE_PERCENT);
  });
});
