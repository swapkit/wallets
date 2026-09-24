import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { DeviceActionStatus, type DeviceManagementKit } from "@ledgerhq/device-management-kit";
import { hex } from "@scure/base";
import { HDKey } from "@scure/bip32";
import * as realUtxoToolbox from "@swapkit/toolboxes/utxo";
import { p2pkh, p2sh, p2tr, p2wpkh, Script, Transaction } from "@swapkit/utxo-signer";
import { of } from "rxjs";

const accountKey = HDKey.fromMasterSeed(new Uint8Array(32).fill(7)).derive("m/84'/0'/0'");
const accountXpub = accountKey.publicExtendedKey;
const zeroAuxRand = new Uint8Array(32);
const walletAddressCalls: Array<{
  addressIndex: number;
  options: { change?: boolean; checkOnDevice?: boolean } | undefined;
  wallet: { derivationPath: string; template: string };
}> = [];
const xpubCalls: Array<{ options?: { checkOnDevice?: boolean }; path: string }> = [];
const signCalls: Array<{ psbt: Uint8Array; wallet: { derivationPath: string; template: string } }> = [];
const rawTxRequests: string[] = [];
const rawTxs = new Map<string, string>();
let fingerprintCalls = 0;
let fingerprintFailuresRemaining = 0;
let tamperSignatures: ((signatures: DevicePartialSignature[]) => DevicePartialSignature[]) | undefined;
let xpubFailuresRemaining = 0;

type DevicePartialSignature = { inputIndex: number; pubkey: Uint8Array; signature: Uint8Array };

function leafKey(change: number, index: number) {
  const key = accountKey.derive(`m/${change}/${index}`);
  if (!(key.publicKey && key.privateKey)) throw new Error("Fixture account did not derive a key pair");
  return { privateKey: key.privateKey, publicKey: key.publicKey };
}

function deviceAction<Output>(output: Output) {
  return {
    cancel: mock(() => {}),
    observable: of(
      { intermediateValue: { requiredUserInteraction: "confirm-on-device" }, status: DeviceActionStatus.Pending },
      { output, status: DeviceActionStatus.Completed },
    ),
  };
}

function failedDeviceAction(error: Error) {
  return { cancel: mock(() => {}), observable: of({ error, status: DeviceActionStatus.Error }) };
}

// Signs the PSBT the way the Bitcoin app does: one partial signature per input, from the key the
// PSBT's key origin points at, without touching the transaction itself.
function deviceSignatures(psbtBytes: Uint8Array) {
  const psbt = Transaction.fromPSBT(psbtBytes);
  return Array.from({ length: psbt.inputsLength }, (_, inputIndex) => {
    const input = psbt.getInput(inputIndex);
    const taprootPath = input.tapBip32Derivation?.[0]?.[1].der.path;
    const path = taprootPath ?? input.bip32Derivation?.[0]?.[1].path;
    if (!path) throw new Error(`Input ${inputIndex} has no key origin`);
    const { privateKey, publicKey } = leafKey(path[3] ?? 0, path[4] ?? 0);

    psbt.signIdx(privateKey, inputIndex, undefined, zeroAuxRand);
    const signed = psbt.getInput(inputIndex);
    const signature = taprootPath ? signed.tapKeySig : signed.partialSig?.[0]?.[1];
    if (!signature) throw new Error(`Input ${inputIndex} was not signed`);
    return { inputIndex, pubkey: taprootPath ? publicKey.slice(1) : publicKey, signature };
  });
}

mock.module("@ledgerhq/device-signer-kit-bitcoin", () => ({
  DefaultDescriptorTemplate: {
    LEGACY: "pkh(@0/**)",
    NATIVE_SEGWIT: "wpkh(@0/**)",
    NESTED_SEGWIT: "sh(wpkh(@0/**))",
    TAPROOT: "tr(@0/**)",
  },
  DefaultWallet: class MockDefaultWallet {
    constructor(
      readonly derivationPath: string,
      readonly template: string,
    ) {}
  },
  SignerBtcBuilder: class MockSignerBtcBuilder {
    build() {
      return {
        getExtendedPublicKey: (path: string, options?: { checkOnDevice?: boolean }) => {
          xpubCalls.push({ options, path });
          if (xpubFailuresRemaining > 0) {
            xpubFailuresRemaining -= 1;
            return failedDeviceAction(new Error("Transient account xpub failure"));
          }
          return deviceAction({ extendedPublicKey: accountXpub });
        },
        getMasterFingerprint: () => {
          fingerprintCalls += 1;
          if (fingerprintFailuresRemaining > 0) {
            fingerprintFailuresRemaining -= 1;
            return failedDeviceAction(new Error("Transient master fingerprint failure"));
          }
          return deviceAction({ masterFingerprint: Uint8Array.of(0xde, 0xad, 0xbe, 0xef) });
        },
        getWalletAddress: (
          wallet: { derivationPath: string; template: string },
          addressIndex: number,
          options?: { change?: boolean; checkOnDevice?: boolean },
        ) => {
          walletAddressCalls.push({ addressIndex, options, wallet });
          return deviceAction({ address: "bc1qledgerdsk" });
        },
        signPsbt: (wallet: { derivationPath: string; template: string }, psbt: Uint8Array) => {
          signCalls.push({ psbt, wallet });
          const signatures = deviceSignatures(psbt);
          return deviceAction(tamperSignatures ? tamperSignatures(signatures) : signatures);
        },
      };
    }
  },
}));

// mock.module replaces the whole export namespace process-wide; snapshot the real module so
// afterAll can restore it for test files that run later.
const realUtxoToolboxSnapshot = { ...realUtxoToolbox };

mock.module("@swapkit/toolboxes/utxo", () => ({
  ...realUtxoToolboxSnapshot,
  getUtxoApi: () => ({
    getRawTx: (txid: string) => {
      rawTxRequests.push(txid);
      return Promise.resolve(rawTxs.get(txid) ?? "");
    },
  }),
}));

import { BitcoinLedger } from "../src/ledger/clients/bitcoin";

const dmkSession = { dmk: { id: "bitcoin-dmk" } as unknown as DeviceManagementKit, sessionId: "btc-session" };

type Purpose = 44 | 49 | 84 | 86;

function outputScript(purpose: Purpose, publicKey: Uint8Array) {
  if (purpose === 44) return p2pkh(publicKey).script;
  if (purpose === 49) return p2sh(p2wpkh(publicKey)).script;
  if (purpose === 86) return p2tr(publicKey.slice(1)).script;
  return p2wpkh(publicKey).script;
}

// A funding transaction paying `amount` to each script, so inputs can reference a real txid.
function previousTransaction(scripts: Uint8Array[], amount = 10_000n) {
  const funding = new Transaction({ allowLegacyWitnessUtxo: true });
  funding.addInput({ index: 0, txid: new Uint8Array(32).fill(9) });
  for (const script of scripts) funding.addOutput({ amount, script });
  return { txHex: hex.encode(funding.unsignedTx), txid: funding.id };
}

/**
 * Mirrors what the SDK toolbox builds: version 1, SegWit v0 and taproot inputs carry only
 * `witnessUtxo`, legacy and nested SegWit inputs carry only `nonWitnessUtxo`.
 */
function makeTransaction({
  keys = [{ change: 0, index: 0 }],
  memo,
  purpose = 84,
}: {
  keys?: Array<{ change: number; index: number }>;
  memo?: boolean;
  purpose?: Purpose;
} = {}) {
  const scripts = keys.map(({ change, index }) => outputScript(purpose, leafKey(change, index).publicKey));
  const funding = previousTransaction(scripts);
  rawTxs.set(funding.txid, funding.txHex);
  const tx = new Transaction({ allowLegacyWitnessUtxo: true, allowUnknownOutputs: memo, version: 1 });

  scripts.forEach((script, index) => {
    const prevout = { amount: 10_000n, script };
    tx.addInput({
      index,
      txid: hex.decode(funding.txid),
      ...(purpose === 84 || purpose === 86 ? { witnessUtxo: prevout } : { nonWitnessUtxo: hex.decode(funding.txHex) }),
    });
  });
  tx.addOutput({ amount: BigInt(9_000 * keys.length), script: scripts[0] ?? new Uint8Array() });
  if (memo) tx.addOutput({ amount: 0n, script: Script.encode(["RETURN", new TextEncoder().encode("=:ETH.ETH:0x")]) });

  return { funding, tx };
}

function version(rawHex: string) {
  return new DataView(hex.decode(rawHex).buffer).getUint32(0, true);
}

describe("Ledger Bitcoin Device Signer Kit client", () => {
  beforeEach(() => {
    walletAddressCalls.length = 0;
    xpubCalls.length = 0;
    signCalls.length = 0;
    rawTxRequests.length = 0;
    rawTxs.clear();
    fingerprintCalls = 0;
    fingerprintFailuresRemaining = 0;
    tamperSignatures = undefined;
    xpubFailuresRemaining = 0;
  });

  it("normalizes the address path and maps purpose 86 to a taproot wallet", async () => {
    const states: string[] = [];
    const client = BitcoinLedger({
      derivationPath: "m/86'/0'/2'/1/7",
      dmkSession,
      onDeviceActionState: ({ status }) => states.push(status),
    });

    const address = await client.getAddress();

    expect(address).toBe("bc1qledgerdsk");
    expect(walletAddressCalls).toEqual([
      { addressIndex: 7, options: { change: true }, wallet: { derivationPath: "86'/0'/2'", template: "tr(@0/**)" } },
    ]);
    expect(states).toEqual(["pending", "completed"]);
  });

  it("signs only through signPsbt and keeps the transaction version the toolbox built", async () => {
    const { funding, tx } = makeTransaction({
      keys: [
        { change: 0, index: 0 },
        { change: 0, index: 0 },
      ],
    });
    const client = BitcoinLedger({ derivationPath: "m/84'/0'/0'/0/0", dmkSession });

    const raw = await client.signTransactionHex({
      inputUtxos: [0, 1].map((index) => ({ hash: funding.txid, index, txHex: funding.txHex, value: 10_000 })),
      tx,
    });

    expect(version(raw)).toBe(1);
    const extracted = Transaction.fromRaw(hex.decode(raw));
    expect(extracted.getInput(0).finalScriptWitness?.[1]).toEqual(leafKey(0, 0).publicKey);
    expect(rawTxRequests).toEqual([]);
    expect(signCalls[0]?.wallet).toEqual({ derivationPath: "84'/0'/0'", template: "wpkh(@0/**)" });

    const devicePsbt = Transaction.fromPSBT(signCalls[0]?.psbt ?? new Uint8Array());
    for (const inputIndex of [0, 1]) {
      const input = devicePsbt.getInput(inputIndex);
      expect(input.bip32Derivation).toEqual([
        [leafKey(0, 0).publicKey, { fingerprint: 0xdeadbeef, path: [0x80000054, 0x80000000, 0x80000000, 0, 0] }],
      ]);
      expect(input.witnessUtxo?.amount).toBe(10_000n);
      expect(input.nonWitnessUtxo).toBeDefined();
    }
    expect(xpubCalls).toEqual([{ options: undefined, path: "84'/0'/0'" }]);
  });

  it("fetches previous transactions the toolbox PSBT omits so the device can verify amounts", async () => {
    const { funding, tx } = makeTransaction();
    const client = BitcoinLedger({ derivationPath: "84'/0'/0'/0/0", dmkSession });

    const signed = await client.signTransaction(tx);
    signed.finalize();

    expect(rawTxRequests).toEqual([funding.txid]);
    expect(version(signed.hex)).toBe(1);
    expect(signed.fee).toBe(1_000n);
  });

  it("signs transactions carrying an OP_RETURN memo", async () => {
    const { funding, tx } = makeTransaction({ memo: true });
    const client = BitcoinLedger({ derivationPath: "84'/0'/0'/0/0", dmkSession });

    const raw = await client.signTransactionHex({
      inputUtxos: [{ hash: funding.txid, index: 0, txHex: funding.txHex, value: 10_000 }],
      tx,
    });

    expect(Transaction.fromRaw(hex.decode(raw), { allowUnknownOutputs: true }).outputsLength).toBe(2);
  });

  it("retries account xpub metadata after a transient device action failure", async () => {
    const { tx } = makeTransaction();
    xpubFailuresRemaining = 1;
    const client = BitcoinLedger({ derivationPath: "m/84'/0'/0'/0/0", dmkSession });

    await expect(client.signTransaction(tx)).rejects.toThrow("Transient account xpub failure");
    await client.signTransaction(tx);

    expect(xpubCalls).toHaveLength(2);
    expect(fingerprintCalls).toBe(1);
    expect(signCalls).toHaveLength(1);
  });

  it("retries master fingerprint metadata after a transient device action failure", async () => {
    const { tx } = makeTransaction();
    fingerprintFailuresRemaining = 1;
    const client = BitcoinLedger({ derivationPath: "m/84'/0'/0'/0/0", dmkSession });

    await expect(client.signTransaction(tx)).rejects.toThrow("Transient master fingerprint failure");
    await client.signTransaction(tx);

    expect(xpubCalls).toHaveLength(1);
    expect(fingerprintCalls).toBe(2);
    expect(signCalls).toHaveLength(1);
  });

  it("supports different leaf paths in one account and rejects account mixing", async () => {
    const { tx } = makeTransaction({
      keys: [
        { change: 0, index: 3 },
        { change: 1, index: 9 },
      ],
    });
    const client = BitcoinLedger({ derivationPath: "84'/0'/0'/0/0", dmkSession });

    const raw = await client.signTransactionWithMultiplePaths({
      derivationPaths: ["m/84'/0'/0'/0/3", "84'/0'/0'/1/9"],
      tx,
    });

    const extracted = Transaction.fromRaw(hex.decode(raw));
    expect(extracted.getInput(0).finalScriptWitness?.[1]).toEqual(leafKey(0, 3).publicKey);
    expect(extracted.getInput(1).finalScriptWitness?.[1]).toEqual(leafKey(1, 9).publicKey);
    const devicePsbt = Transaction.fromPSBT(signCalls[0]?.psbt ?? new Uint8Array());
    expect(devicePsbt.getInput(0).bip32Derivation?.[0]?.[1].path).toEqual([0x80000054, 0x80000000, 0x80000000, 0, 3]);
    expect(devicePsbt.getInput(1).bip32Derivation?.[0]?.[1].path).toEqual([0x80000054, 0x80000000, 0x80000000, 1, 9]);

    await expect(
      client.signTransactionWithMultiplePaths({ derivationPaths: ["84'/0'/0'/0/3", "84'/0'/1'/0/0"], tx }),
    ).rejects.toThrow("wallet_ledger_invalid_params");
  });

  it("produces finalisable version-1 transactions for purposes 44, 49 and 86", async () => {
    for (const purpose of [44, 49, 86] as const) {
      const { tx } = makeTransaction({ purpose });
      const client = BitcoinLedger({ derivationPath: `${purpose}'/0'/0'/0/0`, dmkSession });

      const signed = await client.signTransaction(tx);
      signed.finalize();
      const extracted = Transaction.fromRaw(signed.extract(), { allowLegacyWitnessUtxo: true });

      expect(version(signed.hex)).toBe(1);
      expect(signed.fee).toBe(1_000n);
      if (purpose === 49) {
        // Nested SegWit needs both the redeem script push and the witness.
        expect(extracted.getInput(0).finalScriptSig).toEqual(Script.encode([p2wpkh(leafKey(0, 0).publicKey).script]));
        expect(extracted.getInput(0).finalScriptWitness).toHaveLength(2);
      }
      if (purpose === 86) expect(extracted.getInput(0).finalScriptWitness?.[0]).toHaveLength(64);
    }
  });

  it("fails closed when the device signs with an unexpected key or skips an input", async () => {
    const client = BitcoinLedger({ derivationPath: "84'/0'/0'/0/0", dmkSession });

    tamperSignatures = (signatures) =>
      signatures.map((signature) => ({ ...signature, pubkey: leafKey(0, 1).publicKey }));
    await expect(client.signTransaction(makeTransaction().tx)).rejects.toThrow("wallet_ledger_invalid_response");

    tamperSignatures = (signatures) => signatures.slice(1);
    await expect(
      client.signTransaction(
        makeTransaction({
          keys: [
            { change: 0, index: 0 },
            { change: 0, index: 0 },
          ],
        }).tx,
      ),
    ).rejects.toThrow("wallet_ledger_invalid_response");
  });

  it("rejects a previous transaction that does not match the input txid", async () => {
    const { tx } = makeTransaction();
    const other = previousTransaction([outputScript(84, leafKey(0, 0).publicKey)], 99_999n);
    const client = BitcoinLedger({ derivationPath: "84'/0'/0'/0/0", dmkSession });

    await expect(
      client.signTransactionHex({
        inputUtxos: [{ hash: other.txid, index: 0, txHex: other.txHex, value: 99_999 }],
        tx,
      }),
    ).rejects.toThrow("wallet_ledger_invalid_params");
    expect(signCalls).toHaveLength(0);
  });
});

afterAll(() => {
  mock.module("@swapkit/toolboxes/utxo", () => realUtxoToolboxSnapshot);
});
