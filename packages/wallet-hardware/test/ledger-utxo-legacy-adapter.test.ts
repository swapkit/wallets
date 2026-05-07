import { describe, expect, it, mock } from "bun:test";
import { hex } from "@scure/base";
import { Chain } from "@swapkit/helpers";
import { RawTx, Transaction } from "@swapkit/utxo-signer";

const rawTxRequests: Array<{ chain: string; txid: string }> = [];

mock.module("@swapkit/toolboxes/utxo", () => ({
  getUtxoApi: (chain: string) => ({
    getRawTx: (txid: string) => {
      rawTxRequests.push({ chain, txid });
      return Promise.resolve("02000000000100");
    },
  }),
}));

import { extractInputsFromPsbt, signLegacyPsbtTransaction } from "../src/ledger/clients/utxo-legacy-adapter";

describe("ledger legacy UTXO adapter", () => {
  it("uses embedded previous tx hex for legacy Ledger UTXO chains", async () => {
    rawTxRequests.length = 0;

    const previousTxHex = hex.encode(
      RawTx.encode({
        inputs: [
          { finalScriptSig: new Uint8Array(), index: 0, sequence: 0xffffffff, txid: hex.decode("22".repeat(32)) },
        ],
        lockTime: 0,
        outputs: [
          { amount: 50_000n, script: new Uint8Array([0x6a]) },
          { amount: 12_345n, script: new Uint8Array([0x76, 0xa9, 0x14, ...Array(20).fill(1), 0x88, 0xac]) },
        ],
        segwitFlag: undefined,
        version: 2,
        witnesses: undefined,
      }),
    );

    for (const chain of [Chain.BitcoinCash, Chain.Dash, Chain.Dogecoin, Chain.Litecoin]) {
      const txid = "11".repeat(32);
      const tx = new Transaction({ allowUnknownOutputs: true });
      tx.addInput({ index: 1, nonWitnessUtxo: previousTxHex, txid: hex.decode(txid) });

      const [input] = await extractInputsFromPsbt(tx, chain);

      expect(input).toMatchObject({ hash: txid, index: 1, txHex: previousTxHex, value: 12_345 });
    }

    expect(rawTxRequests).toEqual([]);
  });

  it("fetches previous tx hex for witness-only PSBT inputs", async () => {
    rawTxRequests.length = 0;

    const txid = "11".repeat(32);
    const tx = new Transaction({ allowUnknownOutputs: true });
    tx.addInput({
      index: 1,
      txid: hex.decode(txid),
      witnessUtxo: { amount: 12_345n, script: new Uint8Array([0, 20, ...Array(20).fill(1)]) },
    });

    const [input] = await extractInputsFromPsbt(tx, Chain.Litecoin);

    expect(rawTxRequests).toEqual([{ chain: Chain.Litecoin, txid }]);
    expect(input).toMatchObject({ hash: txid, index: 1, txHex: "02000000000100", value: 12_345 });
  });

  it("returns finalized raw tx hex from legacy Ledger signing without PSBT finalization", async () => {
    const txid = "11".repeat(32);
    const tx = new Transaction({ allowUnknownOutputs: true });
    tx.addInput({
      index: 1,
      txid: hex.decode(txid),
      witnessUtxo: { amount: 12_345n, script: new Uint8Array([0, 20, ...Array(20).fill(1)]) },
    });

    const signedTxHex = await signLegacyPsbtTransaction({
      chain: Chain.Litecoin,
      legacyClient: {
        signTransaction: (_tx, inputUtxos) => {
          expect(inputUtxos).toHaveLength(1);
          return Promise.resolve("0200000000");
        },
      },
      tx,
    });

    expect(signedTxHex).toBe("0200000000");
  });
});
