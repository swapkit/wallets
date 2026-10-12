import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { RippleTransaction } from "@swapkit/toolboxes/ripple";
import { classicAddressToXAddress, GlobalFlags } from "xrpl";

const ACCOUNT = "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH";
const DESTINATION = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";

const calls = { getAddress: 0, sign: 0 };

mock.module("@trezor/connect-web", () => ({
  default: {
    rippleGetAddress: () => {
      calls.getAddress++;
      return Promise.resolve({ payload: { address: ACCOUNT }, success: true });
    },
    rippleSignTransaction: () => {
      calls.sign++;
      return Promise.resolve({ payload: { serializedTx: "00" }, success: true });
    },
  },
}));

const { getRippleSigner, toTrezorRippleTransaction } = await import("../src/trezor/rippleSigner");

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

function signWith(transaction: RippleTransaction) {
  return getRippleSigner({ derivationPath: [44, 144, 0, 0, 0] }).signTransaction(transaction);
}

describe("trezor ripple transaction", () => {
  beforeEach(() => {
    calls.getAddress = 0;
    calls.sign = 0;
  });

  it("maps an autofilled XRP payment", () => {
    expect(toTrezorRippleTransaction(payment)).toEqual({
      fee: "12",
      flags: 0,
      maxLedgerVersion: 100,
      payment: { amount: "1000000", destination: DESTINATION, destinationTag: 42 },
      sequence: 7,
    });
  });

  it("rejects memos before asking the device for anything", async () => {
    const withMemo = { ...payment, Memos: [{ Memo: { MemoData: "abcd" } }] } as RippleTransaction;

    await expect(signWith(withMemo)).rejects.toThrow("wallet_trezor_method_not_supported");
    expect(calls).toEqual({ getAddress: 0, sign: 0 });
  });

  it("rejects issued token amounts", () => {
    const token = { ...payment, Amount: { currency: "USD", issuer: DESTINATION, value: "1" } } as RippleTransaction;
    expect(() => toTrezorRippleTransaction(token)).toThrow("wallet_trezor_method_not_supported");
  });

  it("rejects transaction types other than Payment", () => {
    const trustSet = { ...payment, TransactionType: "TrustSet" } as unknown as RippleTransaction;
    expect(() => toTrezorRippleTransaction(trustSet)).toThrow("wallet_trezor_method_not_supported");
  });

  it("rejects X-address destinations", () => {
    const xAddress = { ...payment, Destination: classicAddressToXAddress(DESTINATION, 42, false) } as RippleTransaction;
    expect(() => toTrezorRippleTransaction(xAddress)).toThrow("wallet_trezor_method_not_supported");
  });

  it("rejects Batch inner transactions", () => {
    const inner = { ...payment, Flags: GlobalFlags.tfInnerBatchTxn } as RippleTransaction;
    expect(() => toTrezorRippleTransaction(inner)).toThrow("wallet_trezor_method_not_supported");
  });

  it("rejects transactions from another account without signing", async () => {
    await expect(signWith({ ...payment, Account: DESTINATION })).rejects.toThrow("wallet_trezor_method_not_supported");
    expect(calls.sign).toBe(0);
  });
});
