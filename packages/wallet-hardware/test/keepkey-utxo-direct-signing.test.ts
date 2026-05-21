import { describe, expect, it } from "bun:test";
import { hex } from "@scure/base";
import { Chain } from "@swapkit/helpers";
import { compileMemo, getNetworkForChain } from "@swapkit/toolboxes/utxo";
import { RawTx, Transaction } from "@swapkit/utxo-signer";

import { keepkeyWallet } from "../src/keepkey";
import { extractKeepKeyInputsFromTransaction, extractMemoFromKeepKeyUtxoTransaction } from "../src/keepkey/chains/utxo";

describe("KeepKey UTXO direct signing helpers", () => {
  it("uses embedded previous tx hex when extracting KeepKey inputs", async () => {
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

    const txid = "11".repeat(32);
    const tx = new Transaction({ allowUnknownOutputs: true });
    const addressNList = [2147483692, 2147483648, 2147483648, 0, 7];
    const publicKey = hex.decode("03308a3a000c2dcb65abbb89d54fb85901dc6ff2dc1d7ee724f958ed8e1a7a5a9d");
    tx.addInput({
      bip32Derivation: [[publicKey, { fingerprint: 0, path: addressNList }]],
      index: 1,
      nonWitnessUtxo: previousTxHex,
      txid: hex.decode(txid),
    });

    const [input] = await extractKeepKeyInputsFromTransaction({
      chain: Chain.BitcoinCash,
      fallbackAddressNList: [2147483692, 2147483648, 2147483648, 0, 0],
      scriptType: "p2pkh",
      tx,
    });

    expect(input).toEqual({ addressNList, amount: "12345", hex: previousTxHex, scriptType: "p2pkh", txid, vout: 1 });
  });

  it("extracts OP_RETURN memo data for the KeepKey opReturnData field", () => {
    const memo = "=:ETH.ETH:0xabc";
    const tx = new Transaction({ allowUnknownOutputs: true });
    tx.addOutput({ amount: 0n, script: compileMemo(memo) });

    expect(extractMemoFromKeepKeyUtxoTransaction(tx, getNetworkForChain(Chain.Bitcoin))).toBe(memo);
  });

  it("marks KeepKey SDK UTXO chains as direct-signing capable", () => {
    expect(keepkeyWallet.connectKeepkey.directSigningSupport[Chain.Bitcoin]).toBe(true);
    expect(keepkeyWallet.connectKeepkey.directSigningSupport[Chain.BitcoinCash]).toBe(true);
    expect(keepkeyWallet.connectKeepkey.directSigningSupport[Chain.Dash]).toBe(true);
    expect(keepkeyWallet.connectKeepkey.directSigningSupport[Chain.Dogecoin]).toBe(true);
    expect(keepkeyWallet.connectKeepkey.directSigningSupport[Chain.Litecoin]).toBe(true);
  });
});
