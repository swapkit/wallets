import { describe, expect, it, mock } from "bun:test";
import { PCZT } from "@swapkit/utxo-signer";

import { resolveZcashPreviousTransaction, resolveZcashPreviousTransactions } from "../src/ledger/clients/utxo";

describe("legacy Ledger Zcash previous transactions", () => {
  it("requires and preserves the full raw previous transaction", async () => {
    const getRawTx = mock((_txid: string) => Promise.resolve("050000800a27a726real-previous-transaction"));
    const txid = new Uint8Array(Array.from({ length: 32 }, (_, index) => index));
    const pczt = new PCZT();
    pczt.addInput({ index: 3, scriptPubkey: new Uint8Array([0x76, 0xa9, 0x14, 0x88, 0xac]), txid, value: 123_456n });
    const input = PCZT.fromHex(pczt.toHex()).getInput(0);

    const resolved = await resolveZcashPreviousTransaction({ getRawTx, input, inputIndex: 2 });

    expect(getRawTx).toHaveBeenCalledWith(
      Array.from(txid)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
    );
    expect(resolved).toMatchObject({
      hash: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
      index: 3,
      txHex: "050000800a27a726real-previous-transaction",
      value: 123_456,
      witnessUtxo: { script: input.scriptPubkey, value: 123_456 },
    });
  });

  it("resolves distinct inputs concurrently and fetches a shared previous transaction once", async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const getRawTx = mock(async (txid: string) => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await Promise.resolve();
      activeRequests -= 1;
      return `raw-${txid}`;
    });
    const firstTxid = new Uint8Array(32).fill(0x11);
    const secondTxid = new Uint8Array(32).fill(0x22);
    const inputs = [
      { index: 0, scriptPubkey: new Uint8Array([0x51]), txid: firstTxid, value: 1n },
      { index: 1, scriptPubkey: new Uint8Array([0x52]), txid: secondTxid, value: 2n },
      { index: 2, scriptPubkey: new Uint8Array([0x53]), txid: firstTxid, value: 3n },
    ];

    const resolved = await resolveZcashPreviousTransactions({ getRawTx, inputs });

    expect(getRawTx.mock.calls.map(([txid]) => txid)).toEqual(["11".repeat(32), "22".repeat(32)]);
    expect(resolved).toMatchObject([
      { hash: "11".repeat(32), index: 0, txHex: `raw-${"11".repeat(32)}`, value: 1 },
      { hash: "22".repeat(32), index: 1, txHex: `raw-${"22".repeat(32)}`, value: 2 },
      { hash: "11".repeat(32), index: 2, txHex: `raw-${"11".repeat(32)}`, value: 3 },
    ]);
    expect(maxActiveRequests).toBe(2);
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
