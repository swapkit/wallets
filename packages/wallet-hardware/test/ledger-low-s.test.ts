import { describe, expect, it } from "bun:test";
import { hex } from "@scure/base";

import { toLowSSignature } from "../src/ledger/helpers/lowS";

const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

function signature({ r, s }: { r: bigint; s: bigint }) {
  return hex.decode(`${r.toString(16).padStart(64, "0")}${s.toString(16).padStart(64, "0")}`);
}

describe("toLowSSignature", () => {
  const r = 0x1234n;

  it("keeps low-S signatures unchanged, including s = n / 2", () => {
    for (const s of [1n, ORDER >> 1n]) {
      const lowS = signature({ r, s });
      expect(toLowSSignature(lowS)).toBe(lowS);
    }
  });

  it("replaces a high s with n - s and keeps r", () => {
    const s = 0xabcdefn;

    expect(toLowSSignature(signature({ r, s: ORDER - s }))).toEqual(signature({ r, s }));
    expect(toLowSSignature(signature({ r, s: (ORDER >> 1n) + 1n }))).toEqual(signature({ r, s: ORDER >> 1n }));
  });
});
