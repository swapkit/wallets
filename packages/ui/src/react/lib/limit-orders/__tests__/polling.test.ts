import { describe, expect, test } from "bun:test";

import { getPollInterval } from "../polling";

const rateLimited = (retryAfter?: number) => ({
  cause: { data: { retryAfter, service: "limit_order" }, error: "rateLimitExceeded", status: 429 },
  errorKey: "rateLimitExceeded",
});

describe("getPollInterval", () => {
  test.each([
    ["no error polls at the base", { baseMs: 60_000, error: null }, 60_000],
    ["a 429 honours retryAfter", { baseMs: 30_000, error: rateLimited(120) }, 120_000],
    ["a 429 without retryAfter backs off", { baseMs: 60_000, error: rateLimited() }, 120_000],
    ["retryAfter is capped", { baseMs: 30_000, error: rateLimited(900) }, 300_000],
    ["other errors back off", { baseMs: 30_000, error: new Error("boom") }, 60_000],
    ["errors never poll faster than a large base", { baseMs: 360_000, error: new Error("boom") }, 360_000],
    ["an unknown order stops polling", { baseMs: 30_000, error: { cause: { status: 404 } } }, false],
  ] as const)("%s", (_, params, expected) => {
    expect(getPollInterval(params)).toBe(expected);
  });
});
