import { describe, expect, test } from "bun:test";

import { truncateMiddle } from "../truncate";

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

describe("truncateMiddle", () => {
  test.each([
    ["empty string", "", undefined, ""],
    ["short value", "0x12", undefined, "0x12"],
    ["at the default threshold", "abcdefghijkl", undefined, "abcdefghijkl"],
    ["one past the default threshold", "abcdefghijklm", undefined, "abcdef...jklm"],
    ["default address", ADDRESS, undefined, "0x1234...5678"],
    ["at a custom threshold", "abcdefghijklmnopqr", { end: 6, start: 10 }, "abcdefghijklmnopqr"],
    ["one past a custom threshold", "abcdefghijklmnopqrs", { end: 6, start: 10 }, "abcdefghij...nopqrs"],
    ["custom start and end", ADDRESS, { end: 5, start: 5 }, "0x123...45678"],
  ] as const)("%s", (_name, value, options, expected) => {
    expect(truncateMiddle(value, options)).toBe(expected);
  });
});
