import { describe, expect, it, mock } from "bun:test";
import type Transport from "@ledgerhq/hw-transport";
import { HDKey } from "@scure/bip32";
import { OutScript, Transaction } from "@swapkit/utxo-signer";

const master = HDKey.fromMasterSeed(new Uint8Array(64).fill(1));
const sentPsbts: string[] = [];

mock.module("ledger-bitcoin", () => ({
  AppClient: class MockAppClient {
    getMasterFingerprint = async () => "deadbeef";
    getExtendedPubkey = async (path: string) => master.derive(`m/${path.split("/")[1]}/0'/0'`).publicExtendedKey;
    signPsbt = (psbt: string) => {
      sentPsbts.push(psbt);
      return Promise.resolve([]);
    };
  },
  DefaultWalletPolicy: class MockDefaultWalletPolicy {
    // biome-ignore lint/complexity/noUselessConstructor: skip for tests
    constructor(_template: string, _key: string) {}
  },
}));

const { BitcoinPsbtLedger } = await import("../src/ledger/clients/utxo-psbt");

const SCRIPT = OutScript.encode({ hash: new Uint8Array(20).fill(3), type: "pkh" });
const opts = { allowLegacyWitnessUtxo: true, allowUnknownOutputs: true };

async function signAt(purpose: string) {
  const prev = new Transaction(opts);
  prev.addInput({ finalScriptSig: new Uint8Array(0), index: 0, txid: new Uint8Array(32).fill(7) });
  prev.addOutput({ amount: 100_000n, script: SCRIPT });

  const tx = new Transaction(opts);
  tx.addInput({
    index: 0,
    nonWitnessUtxo: prev.toBytes(true, true),
    txid: prev.id,
    witnessUtxo: { amount: 100_000n, script: SCRIPT },
  });
  tx.addOutput({ amount: 90_000n, script: SCRIPT });

  sentPsbts.length = 0;
  await BitcoinPsbtLedger(`${purpose}'/0'/0'/0/0`, {} as Transport).signTransaction(tx);

  const bytes = Uint8Array.from(atob(sentPsbts.at(-1) as string), (c) => c.charCodeAt(0));

  return Transaction.fromPSBT(bytes).getInput(0) as { nonWitnessUtxo?: unknown; witnessUtxo?: unknown };
}

describe("the PSBT a Ledger receives", () => {
  it("drops witnessUtxo on a legacy account, which the device reads as a segwit claim", async () => {
    const input = await signAt("44");

    expect(input.nonWitnessUtxo).toBeDefined();
    expect(input.witnessUtxo).toBeUndefined();
  });

  it.each([
    ["nested segwit", "49"],
    ["native segwit", "84"],
  ])("keeps witnessUtxo on a %s account", async (_label, purpose) => {
    expect((await signAt(purpose)).witnessUtxo).toBeDefined();
  });
});
