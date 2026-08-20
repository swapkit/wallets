import { beforeEach, describe, expect, it, mock } from "bun:test";
import { DeviceActionStatus, type DeviceManagementKit } from "@ledgerhq/device-management-kit";
import { hex } from "@scure/base";
import { HDKey } from "@scure/bip32";
import { p2pkh, p2sh, p2tr, p2wpkh, Script, Transaction } from "@swapkit/utxo-signer";
import { of } from "rxjs";

const accountKey = HDKey.fromMasterSeed(new Uint8Array(32).fill(7)).derive("m/84'/0'/0'");
const accountXpub = accountKey.publicExtendedKey;
const walletAddressCalls: Array<{
  addressIndex: number;
  options: { change?: boolean; checkOnDevice?: boolean } | undefined;
  wallet: { derivationPath: string; template: string };
}> = [];
const xpubCalls: Array<{ options?: { checkOnDevice?: boolean }; path: string }> = [];
const signCalls: Array<{ psbt: Uint8Array; wallet: { derivationPath: string; template: string } }> = [];
let signedRaw = "";

function deviceAction<Output>(output: Output) {
  return {
    cancel: mock(() => {}),
    observable: of(
      { intermediateValue: { requiredUserInteraction: "confirm-on-device" }, status: DeviceActionStatus.Pending },
      { output, status: DeviceActionStatus.Completed },
    ),
  };
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
          return deviceAction({ extendedPublicKey: accountXpub });
        },
        getMasterFingerprint: () => deviceAction({ masterFingerprint: Uint8Array.of(0xde, 0xad, 0xbe, 0xef) }),
        getWalletAddress: (
          wallet: { derivationPath: string; template: string },
          addressIndex: number,
          options?: { change?: boolean; checkOnDevice?: boolean },
        ) => {
          walletAddressCalls.push({ addressIndex, options, wallet });
          return deviceAction({ address: "bc1qledgerdsk" });
        },
        signTransaction: (wallet: { derivationPath: string; template: string }, psbt: Uint8Array) => {
          signCalls.push({ psbt, wallet });
          return deviceAction(`0x${signedRaw}`);
        },
      };
    }
  },
}));

import { BitcoinLedger } from "../src/ledger/clients/bitcoin";

const dmkSession = { dmk: { id: "bitcoin-dmk" } as unknown as DeviceManagementKit, sessionId: "btc-session" };

function makeTransaction(inputCount = 2) {
  const transaction = new Transaction();
  const leafPublicKey = accountKey.derive("m/0/0").publicKey;
  if (!leafPublicKey) throw new Error("Fixture account did not derive a public key");
  const script = p2wpkh(leafPublicKey).script;

  for (let index = 0; index < inputCount; index += 1) {
    transaction.addInput({ index, txid: new Uint8Array(32).fill(index + 1), witnessUtxo: { amount: 10_000n, script } });
  }
  transaction.addOutput({ amount: BigInt(9_000 * inputCount), script });
  return transaction;
}

function signedTransactionRaw(transaction: Transaction) {
  const publicKey = accountKey.derive("m/0/0").publicKey;
  if (!publicKey) throw new Error("Fixture account did not derive a public key");
  const signed = transaction.clone();
  for (let inputIndex = 0; inputIndex < signed.inputsLength; inputIndex += 1) {
    signed.updateInput(inputIndex, { finalScriptWitness: [Uint8Array.of(0x30, 1, 1), publicKey] });
  }
  return hex.encode(signed.extract());
}

describe("Ledger Bitcoin Device Signer Kit client", () => {
  beforeEach(() => {
    walletAddressCalls.length = 0;
    xpubCalls.length = 0;
    signCalls.length = 0;
    signedRaw = "";
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

  it("adds exact per-input key origins and returns a parsed raw transaction", async () => {
    const transaction = makeTransaction();
    signedRaw = signedTransactionRaw(transaction);
    const client = BitcoinLedger({ derivationPath: "m/84'/0'/0'/0/0", dmkSession });

    const signed = await client.signTransaction(transaction);
    signed.finalize();

    expect(hex.encode(signed.extract())).toBe(signedRaw);
    expect(signed.fee).toBe(2_000n);
    expect(signCalls).toHaveLength(1);
    expect(signCalls[0]?.wallet).toEqual({ derivationPath: "84'/0'/0'", template: "wpkh(@0/**)" });
    const signedPsbt = Transaction.fromPSBT(signCalls[0]?.psbt ?? new Uint8Array());
    expect(signedPsbt.getInput(0).bip32Derivation).toEqual([
      [
        accountKey.derive("m/0/0").publicKey,
        { fingerprint: 0xdeadbeef, path: [0x80000054, 0x80000000, 0x80000000, 0, 0] },
      ],
    ]);
    expect(signedPsbt.getInput(1).bip32Derivation).toEqual([
      [
        accountKey.derive("m/0/0").publicKey,
        { fingerprint: 0xdeadbeef, path: [0x80000054, 0x80000000, 0x80000000, 0, 0] },
      ],
    ]);
    expect(xpubCalls).toEqual([{ options: undefined, path: "84'/0'/0'" }]);
  });

  it("supports different leaf paths in one account and rejects account mixing", async () => {
    const transaction = makeTransaction();
    signedRaw = signedTransactionRaw(transaction);
    const client = BitcoinLedger({ derivationPath: "84'/0'/0'/0/0", dmkSession });

    const raw = await client.signTransactionWithMultiplePaths({
      derivationPaths: ["m/84'/0'/0'/0/3", "84'/0'/0'/1/9"],
      tx: transaction,
    });

    expect(raw).toBe(signedRaw);
    const signedPsbt = Transaction.fromPSBT(signCalls[0]?.psbt ?? new Uint8Array());
    expect(signedPsbt.getInput(0).bip32Derivation?.[0]?.[1].path).toEqual([0x80000054, 0x80000000, 0x80000000, 0, 3]);
    expect(signedPsbt.getInput(1).bip32Derivation?.[0]?.[1].path).toEqual([0x80000054, 0x80000000, 0x80000000, 1, 9]);

    await expect(
      client.signTransactionWithMultiplePaths({ derivationPaths: ["84'/0'/0'/0/3", "84'/0'/1'/0/0"], tx: transaction }),
    ).rejects.toThrow("wallet_ledger_invalid_params");
  });

  it("restores finalizable signatures for purposes 44, 49, and 86", async () => {
    const publicKey = accountKey.derive("m/0/0").publicKey;
    if (!publicKey) throw new Error("Fixture account did not derive a public key");
    const cases = [
      {
        finalizeRaw: (raw: Transaction) =>
          raw.updateInput(0, { finalScriptSig: Script.encode([Uint8Array.of(0x30, 1, 1), publicKey]) }),
        path: "44'/0'/0'/0/0",
        script: p2pkh(publicKey).script,
      },
      {
        finalizeRaw: (raw: Transaction) =>
          raw.updateInput(0, {
            finalScriptSig: Script.encode([p2wpkh(publicKey).script]),
            finalScriptWitness: [Uint8Array.of(0x30, 1, 1), publicKey],
          }),
        path: "49'/0'/0'/0/0",
        script: p2sh(p2wpkh(publicKey)).script,
      },
      {
        finalizeRaw: (raw: Transaction) => raw.updateInput(0, { finalScriptWitness: [new Uint8Array(64).fill(6)] }),
        path: "86'/0'/0'/0/0",
        script: p2tr(publicKey.slice(1)).script,
      },
    ];

    for (const testCase of cases) {
      const transaction = new Transaction({ allowLegacyWitnessUtxo: true });
      transaction.addInput({
        index: 0,
        txid: new Uint8Array(32).fill(4),
        witnessUtxo: { amount: 10_000n, script: testCase.script },
      });
      transaction.addOutput({ amount: 9_000n, script: testCase.script });
      const raw = transaction.clone();
      testCase.finalizeRaw(raw);
      signedRaw = hex.encode(raw.extract());

      const client = BitcoinLedger({ derivationPath: testCase.path, dmkSession });
      const signed = await client.signTransaction(transaction);
      signed.finalize();

      expect(hex.encode(signed.extract())).toBe(signedRaw);
      expect(signed.fee).toBe(1_000n);
    }
  });
});
