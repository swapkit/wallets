import { describe, expect, test } from "bun:test";

import { isPhantomExpiry } from "../phantom";
import { makeOrder } from "./fixtures";

const expired = { expiresAt: "2026-10-08T10:00:00.000Z", status: "EXPIRED" } as const;

describe("isPhantomExpiry", () => {
  test.each([
    ["grace-arm sweep before its own expiry", { ...expired, updatedAt: "2026-10-01T11:30:00.000Z" }, true],
    ["genuine zero-fill 1inch expiry", { ...expired, updatedAt: "2026-10-08T10:20:00.000Z" }, false],
    [
      "expired with fills",
      { ...expired, filledBuyAmount: "900", filledSellAmount: "0.34", updatedAt: "2026-10-01T11:30:00.000Z" },
      false,
    ],
    [
      "Harbor expiry without a deposit",
      { ...expired, provider: "HARBOR", updatedAt: "2026-10-08T10:20:00.000Z" },
      true,
    ],
    [
      "Harbor expiry with a deposit",
      { ...expired, depositHash: "0xdeposit", provider: "HARBOR", updatedAt: "2026-10-08T10:20:00.000Z" },
      false,
    ],
    ["NEAR expiry without a deposit", { ...expired, provider: "NEAR", updatedAt: "2026-10-08T10:20:00.000Z" }, true],
    ["a cancelled order", { status: "CANCELLED", updatedAt: "2026-10-01T11:30:00.000Z" }, false],
  ] as const)("%s", (_, overrides, expected) => {
    expect(isPhantomExpiry(makeOrder(overrides as never))).toBe(expected);
  });
});
