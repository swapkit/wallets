import { describe, expect, it, mock } from "bun:test";

import { resolveZcashPreviousTransaction } from "../src/ledger/clients/utxo";

describe("legacy Ledger Zcash previous transactions", () => {
  it("requires and preserves the full raw previous transaction", async () => {
    const getRawTx = mock((_txid: string) => Promise.resolve("050000800a27a726real-previous-transaction"));
    const input = {
      index: 3,
      scriptPubkey: new Uint8Array([0x76, 0xa9, 0x14, 0x88, 0xac]),
      txid: new Uint8Array(Array.from({ length: 32 }, (_, index) => index)),
      value: 123_456n,
    };

    const resolved = await resolveZcashPreviousTransaction({ getRawTx, input, inputIndex: 2 });

    expect(getRawTx).toHaveBeenCalledWith(
      Array.from({ length: 32 }, (_, index) => 31 - index)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
    );
    expect(resolved).toMatchObject({
      index: 3,
      txHex: "050000800a27a726real-previous-transaction",
      value: 123_456,
      witnessUtxo: { script: input.scriptPubkey, value: 123_456 },
    });
  });

  it("fails before signing when the API cannot provide a real previous transaction", async () => {
    const getRawTx = mock((_txid: string) => Promise.resolve(""));

    await expect(
      resolveZcashPreviousTransaction({
        getRawTx,
        input: { index: 0, scriptPubkey: new Uint8Array([0x51]), txid: new Uint8Array(32).fill(0xaa), value: 1n },
        inputIndex: 4,
      }),
    ).rejects.toMatchObject({
      cause: {
        chain: "ZEC",
        inputIndex: 4,
        reason: "Unable to resolve previous transaction hex for Ledger signing",
        txid: "aa".repeat(32),
      },
      errorKey: "wallet_ledger_invalid_params",
    });
    expect(getRawTx).toHaveBeenCalledTimes(1);
  });
});
