import { describe, expect, it } from "bun:test";
import type { StellarTransaction } from "@swapkit/toolboxes/stellar";

import { toTrezorStellarTransaction } from "../src/trezor/stellarSigner";

const SOURCE = "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX";
const DESTINATION = "GDKIJJIKXLOM2NRMPNQZUUYK24ZPVFC6426GZAEP3KUK6KEJLACCWNMX";
const ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const asset = (type: string, code = "", issuer = "") => ({
  getAssetType: () => type,
  getCode: () => code,
  getIssuer: () => issuer,
});

function buildTransaction(overrides: Record<string, unknown> = {}) {
  return {
    fee: "100",
    memo: { type: "text", value: Buffer.from("=:BTC.BTC:bc1q") },
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    operations: [{ amount: "12.5", asset: asset("native"), destination: DESTINATION, type: "payment" }],
    sequence: "42",
    source: SOURCE,
    timeBounds: { maxTime: "1700000030", minTime: "0" },
    ...overrides,
  } as unknown as StellarTransaction;
}

describe("trezor stellar transaction", () => {
  it("maps amounts to stroops and keeps the memo decoded from XDR", () => {
    const transaction = buildTransaction({
      operations: [
        { amount: "12.5", asset: asset("native"), destination: DESTINATION, type: "payment" },
        {
          amount: "0.0000001",
          asset: asset("credit_alphanum4", "USDC", ISSUER),
          destination: DESTINATION,
          type: "payment",
        },
      ],
    });

    expect(toTrezorStellarTransaction(transaction, SOURCE).transaction).toEqual({
      fee: 100,
      memo: { text: "=:BTC.BTC:bc1q", type: 1 },
      operations: [
        { amount: "125000000", asset: { type: "NATIVE" }, destination: DESTINATION, type: "payment" },
        {
          amount: "1",
          asset: { code: "USDC", issuer: ISSUER, type: "ALPHANUM4" },
          destination: DESTINATION,
          type: "payment",
        },
      ],
      sequence: "42",
      source: SOURCE,
      timebounds: { maxTime: 1700000030, minTime: 0 },
    });
  });

  it("rejects what Trezor would sign differently", () => {
    const unsupportedOperation = buildTransaction({ operations: [{ type: "manageData" }] });
    const otherSource = buildTransaction({ source: DESTINATION });
    const noTimeBounds = buildTransaction({ timeBounds: undefined });

    expect(() => toTrezorStellarTransaction(unsupportedOperation, SOURCE)).toThrow();
    expect(() => toTrezorStellarTransaction(otherSource, SOURCE)).toThrow();
    expect(() => toTrezorStellarTransaction(noTimeBounds, SOURCE)).toThrow();
  });
});
