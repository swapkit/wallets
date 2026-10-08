import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { RippleTransaction } from "@swapkit/toolboxes/ripple";
import { encode } from "ripple-binary-codec";
import { classicAddressToXAddress, GlobalFlags } from "xrpl";

const ACCOUNT = "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH";
const DESTINATION = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";

const calls = { getAddress: 0, sign: 0 };
const device = { serializedTx: "00" };

mock.module("@trezor/connect-web", () => ({
  default: {
    rippleGetAddress: () => {
      calls.getAddress++;
      return Promise.resolve({ payload: { address: ACCOUNT }, success: true });
    },
    rippleSignTransaction: () => {
      calls.sign++;
      return Promise.resolve({ payload: { serializedTx: device.serializedTx }, success: true });
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

const SIGNATURE_FIELDS = {
  SigningPubKey: "0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020",
  TxnSignature:
    "3045022100D184EB4AE5956FF600E7536EE459345C7BBCF097A84CC61A93B9AF7197EDB98702201CEA8009B7BEEBAA2AACC0359B41C427C1C5B550A4CA4B80CF2174AF2D6D5DCE",
};

function deviceSigns(transaction: Record<string, unknown>) {
  device.serializedTx = encode({ ...transaction, ...SIGNATURE_FIELDS });
}

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

  it("rejects out of range or malformed fields without touching the device", async () => {
    const invalid = [
      { DestinationTag: 2 ** 32 + 5 },
      { DestinationTag: 1.5 },
      { Fee: "12abc" },
      { Amount: (10n ** 17n + 1n).toString() },
    ];

    for (const fields of invalid) {
      await expect(signWith({ ...payment, ...fields } as RippleTransaction)).rejects.toThrow(
        "wallet_trezor_method_not_supported",
      );
    }
    expect(calls).toEqual({ getAddress: 0, sign: 0 });
  });

  it("rejects a signed blob that differs from the requested payment", async () => {
    deviceSigns(payment);
    expect((await signWith(payment)).tx_blob).toBe(device.serializedTx);

    for (const tampered of [{ DestinationTag: 5 }, { Amount: "1" }]) {
      deviceSigns({ ...payment, ...tampered });
      await expect(signWith(payment)).rejects.toThrow("wallet_trezor_failed_to_sign_transaction");
    }
  });
});
