import { describe, expect, test } from "bun:test";

import { getFillPercent } from "../amounts";

describe("getFillPercent", () => {
  test.each([
    ["FILLED is 100 even when the fills compute lower", { filledSellAmount: "0.5", status: "FILLED" }, 100],
    ["99.9% computed is 99", { filledSellAmount: "0.999", status: "PARTIAL" }, 99],
    ["100% computed without FILLED is 99", { filledSellAmount: "1", status: "PARTIAL" }, 99],
    ["42.7% floors to 42", { filledSellAmount: "0.427", status: "PARTIAL" }, 42],
    ["no fills is 0", { filledSellAmount: "0", status: "OPEN" }, 0],
  ] as const)("%s", (_, order, expected) => {
    expect(getFillPercent({ ...order, sellAmount: "1" })).toBe(expected);
  });
});
