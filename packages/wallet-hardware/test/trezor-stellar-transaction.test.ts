import { describe, expect, it } from "bun:test";
import type { StellarTransaction } from "@swapkit/toolboxes/stellar";

import { getStellarSigner, toTrezorStellarTransaction } from "../src/trezor/stellarSigner";

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

  it("maps account creation, trustlines, operation sources and every memo type", () => {
    const hash = Buffer.alloc(32, 0xab);
    const transaction = buildTransaction({
      memo: { type: "hash", value: hash },
      operations: [
        { destination: DESTINATION, source: SOURCE, startingBalance: "1", type: "createAccount" },
        { limit: "922337203685.4775807", line: asset("credit_alphanum12", "LONGCODE", ISSUER), type: "changeTrust" },
      ],
    });

    expect(toTrezorStellarTransaction(transaction, SOURCE).transaction).toMatchObject({
      memo: { hash: hash.toString("hex"), type: 3 },
      operations: [
        { destination: DESTINATION, source: SOURCE, startingBalance: "10000000", type: "createAccount" },
        {
          limit: "9223372036854775807",
          line: { code: "LONGCODE", issuer: ISSUER, type: "ALPHANUM12" },
          type: "changeTrust",
        },
      ],
    });

    const memoOf = (memo: unknown) => toTrezorStellarTransaction(buildTransaction({ memo }), SOURCE).transaction.memo;
    expect(memoOf({ type: "id", value: "18446744073709551615" })).toEqual({ id: "18446744073709551615", type: 2 });
    expect(memoOf({ type: "return", value: hash })).toEqual({ hash: hash.toString("hex"), type: 4 });
    expect(memoOf({ type: "none", value: null })).toBeUndefined();
  });

  const payment = (overrides: Record<string, unknown>) => [
    { amount: "1", asset: asset("native"), destination: DESTINATION, type: "payment", ...overrides },
  ];

  it.each([
    ["fee bump transactions", { innerTransaction: {} }],
    ["another source account", { source: DESTINATION }],
    ["missing time bounds", { timeBounds: undefined }],
    ["ledger bounds", { ledgerBounds: { maxLedger: 10, minLedger: 1 } }],
    ["minimum account sequence", { minAccountSequence: "1" }],
    ["minimum account sequence age", { minAccountSequenceAge: 1n }],
    ["minimum account sequence ledger gap", { minAccountSequenceLedgerGap: 1 }],
    ["extra signers", { extraSigners: [SOURCE] }],
    ["unsupported operations", { operations: [{ type: "manageData" }] }],
    ["liquidity pool assets", { operations: payment({ asset: asset("liquidity_pool_shares") }) }],
    ["amounts with more than 7 decimals", { operations: payment({ amount: "1.00000001" }) }],
    ["non numeric amounts", { operations: payment({ amount: "-1" }) }],
    ["text memos that are not UTF-8", { memo: { type: "text", value: Buffer.from([0xff, 0xfe]) } }],
  ])("rejects %s before reaching the device", (_, overrides) => {
    expect(() => toTrezorStellarTransaction(buildTransaction(overrides), SOURCE)).toThrow(
      "wallet_trezor_method_not_supported",
    );
  });

  it("rejects paths that put the account in the last two slots", () => {
    expect(() => getStellarSigner({ derivationPath: [44, 148, 0, 0, 5] })).toThrow(
      "wallet_trezor_derivation_path_not_supported",
    );
    expect(() => getStellarSigner({ derivationPath: [44, 148, 5, 0, 0] })).not.toThrow();
  });
});
