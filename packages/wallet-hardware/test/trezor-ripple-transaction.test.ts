import { describe, expect, it } from "bun:test";
import type { RippleTransaction } from "@swapkit/toolboxes/ripple";

import { toTrezorRippleTransaction } from "../src/trezor/rippleSigner";

const ACCOUNT = "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH";
const DESTINATION = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";

const payment = {
  Account: ACCOUNT,
  Amount: "1000000",
  Destination: DESTINATION,
  DestinationTag: 42,
  Fee: "12",
  Flags: 0,
  LastLedgerSequence: 100,
  Sequence: 7,
  TransactionType: "Payment",
} as RippleTransaction;

describe("trezor ripple transaction", () => {
  it("maps an autofilled XRP payment", () => {
    expect(toTrezorRippleTransaction(payment, ACCOUNT)).toEqual({
      fee: "12",
      flags: 0,
      maxLedgerVersion: 100,
      payment: { amount: "1000000", destination: DESTINATION, destinationTag: 42 },
      sequence: 7,
    });
  });

  it("rejects payments with memos instead of dropping them", () => {
    const withMemo = { ...payment, Memos: [{ Memo: { MemoData: "abcd" } }] } as RippleTransaction;
    expect(() => toTrezorRippleTransaction(withMemo, ACCOUNT)).toThrow();
  });

  it("rejects issued token amounts", () => {
    const token = { ...payment, Amount: { currency: "USD", issuer: DESTINATION, value: "1" } } as RippleTransaction;
    expect(() => toTrezorRippleTransaction(token, ACCOUNT)).toThrow();
  });
});
