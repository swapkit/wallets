import { describe, expect, it, mock } from "bun:test";
import type Transport from "@ledgerhq/hw-transport";
import { HDKey } from "@scure/bip32";
import { Chain } from "@swapkit/helpers";
import { getNetworkForChain } from "@swapkit/toolboxes/utxo";
import { OutScript, p2sh, p2wpkh, Transaction } from "@swapkit/utxo-signer";

const master = HDKey.fromMasterSeed(new Uint8Array(64).fill(1));
const accountKey = (purpose: number) => master.derive(`m/${purpose}'/0'/0'`);
const leafKey = (purpose: number) => accountKey(purpose).derive("m/0/0");

mock.module("ledger-bitcoin", () => ({
  AppClient: class MockAppClient {
    getMasterFingerprint = async () => "deadbeef";
    getExtendedPubkey = async (path: string) =>
      accountKey(Number(path.split("/")[1]?.replace("'", ""))).publicExtendedKey;
    signPsbt = async () => [];
  },
  DefaultWalletPolicy: class MockDefaultWalletPolicy {
    // biome-ignore lint/complexity/noUselessConstructor: skip for tests
    constructor(_template: string, _key: string) {}
  },
}));

const { BitcoinPsbtLedger } = await import("../src/ledger/clients/utxo-psbt");

const network = getNetworkForChain(Chain.Bitcoin);
const nested = p2sh(p2wpkh(leafKey(49).publicKey as Uint8Array, network), network);
const foreignScript = OutScript.encode({ hash: new Uint8Array(20).fill(9), type: "sh" });

function txSpending(scripts: Uint8Array[]) {
  const tx = new Transaction({ allowLegacyWitnessUtxo: true, allowUnknownOutputs: true });

  for (const [index, script] of scripts.entries()) {
    const prev = new Transaction({ allowLegacyWitnessUtxo: true, allowUnknownOutputs: true });
    prev.addInput({ finalScriptSig: new Uint8Array(0), index: 0, txid: new Uint8Array(32).fill(index + 1) });
    prev.addOutput({ amount: 100_000n, script });

    tx.addInput({
      index: 0,
      nonWitnessUtxo: prev.toBytes(true, true),
      txid: prev.id,
      witnessUtxo: { amount: 100_000n, script },
    });
  }

  tx.addOutput({ amount: 90_000n, script: nested.script });

  return tx;
}

function redeemScriptOf(tx: Transaction, index: number) {
  return (tx.getInput(index) as { redeemScript?: Uint8Array }).redeemScript;
}

describe("the PSBT a Ledger returns for a nested segwit account", () => {
  it("stamps the redeem script the API leaves off a P2SH-wrapped segwit input", async () => {
    const tx = await BitcoinPsbtLedger("49'/0'/0'/0/0", {} as Transport).signTransaction(txSpending([nested.script]));

    expect(redeemScriptOf(tx, 0)).toEqual(nested.redeemScript as Uint8Array);
  });

  it("can be finalized once the redeem script is back", async () => {
    const tx = await BitcoinPsbtLedger("49'/0'/0'/0/0", {} as Transport).signTransaction(txSpending([nested.script]));

    tx.signIdx(leafKey(49).privateKey as Uint8Array, 0);

    expect(() => tx.finalize()).not.toThrow();
  });

  it("leaves an input alone when the derived redeem script does not hash to its scriptPubKey", async () => {
    const tx = await BitcoinPsbtLedger("49'/0'/0'/0/0", {} as Transport).signTransaction(
      txSpending([foreignScript, nested.script]),
    );

    expect(redeemScriptOf(tx, 0)).toBeUndefined();
    expect(redeemScriptOf(tx, 1)).toEqual(nested.redeemScript as Uint8Array);
  });

  it("does not touch a native segwit account's inputs", async () => {
    const wpkh = p2wpkh(leafKey(84).publicKey as Uint8Array, network);
    const tx = await BitcoinPsbtLedger("84'/0'/0'/0/0", {} as Transport).signTransaction(txSpending([wpkh.script]));

    expect(redeemScriptOf(tx, 0)).toBeUndefined();
  });
});
