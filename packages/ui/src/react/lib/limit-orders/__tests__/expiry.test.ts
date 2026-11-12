import { describe, expect, test } from "bun:test";

import {
  DEFAULT_LIMIT_EXPIRY_BOUNDS,
  formatExpiryBounds,
  getLimitExpiresAt,
  getVisibleExpiryPresets,
  resolveLimitExpiry,
} from "../expiry";

const DAY = 86_400;
const NEAR_BOUNDS = { max: 7 * DAY, min: 300 };

describe("limit order expiry", () => {
  test("hides presets outside the route bounds and clamps a stale selection", () => {
    expect(getVisibleExpiryPresets(NEAR_BOUNDS)).toEqual([3600, DAY, 7 * DAY]);
    expect(resolveLimitExpiry({ kind: "preset", seconds: 30 * DAY }, NEAR_BOUNDS)).toEqual({
      isValid: true,
      seconds: 7 * DAY,
    });
  });

  test("validates custom durations against the bounds", () => {
    const custom = { days: "8", hours: "", kind: "custom", minutes: "" } as const;
    expect(resolveLimitExpiry(custom, NEAR_BOUNDS).isValid).toBe(false);
    expect(resolveLimitExpiry({ ...custom, days: "1", hours: "2" }, NEAR_BOUNDS)).toEqual({
      isValid: true,
      seconds: DAY + 7200,
    });
    expect(resolveLimitExpiry({ ...custom, days: "1.5" }, NEAR_BOUNDS).isValid).toBe(false);
  });

  test("keeps the latency margin inside both bounds", () => {
    const nowMs = 1_700_000_000_500;
    expect(getLimitExpiresAt({ bounds: NEAR_BOUNDS, nowMs, seconds: 300 })).toBe(1_700_000_000 + 330);
    expect(getLimitExpiresAt({ bounds: NEAR_BOUNDS, nowMs, seconds: 30 * DAY })).toBe(1_700_000_000 + 7 * DAY - 30);
  });

  test("formats the bounds caption", () => {
    expect(formatExpiryBounds(DEFAULT_LIMIT_EXPIRY_BOUNDS)).toBe("1 min – 365 days");
  });
});
