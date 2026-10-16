import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import * as realStrApp from "@ledgerhq/hw-app-str";
import type Transport from "@ledgerhq/hw-transport";
import { Account, Asset, hash, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

// mock.module replaces the whole export namespace process-wide; snapshot the real module so afterAll can restore it.
const realStrAppSnapshot = { ...realStrApp };
const device = Keypair.random();
const calls: { getPublicKey: string[]; signTransaction: Array<{ path: string; payload: Buffer }> } = {
  getPublicKey: [],
  signTransaction: [],
};
let deviceSignature: ((payload: Buffer) => Buffer) | undefined;

mock.module("@ledgerhq/hw-app-str", () => ({
  default: class MockStrApp {
    getPublicKey = (path: string) => {
      calls.getPublicKey.push(path);
      return Promise.resolve({ rawPublicKey: device.rawPublicKey() });
    };
    signTransaction = (path: string, payload: Buffer) => {
      calls.signTransaction.push({ path, payload });
      // The Stellar app signs the SHA-256 of the signature base, as the network verifies it
      return Promise.resolve({ signature: (deviceSignature ?? ((data) => device.sign(hash(data))))(payload) });
    };
  },
}));

const { getStellarLedgerPath, StellarLedger } = await import("../src/ledger/clients/stellar");

const transport = { id: "Stellar" } as unknown as Transport;
const DESTINATION = "GDKIJJIKXLOM2NRMPNQZUUYK24ZPVFC6426GZAEP3KUK6KEJLACCWNMX";

function buildTransaction(source = device.publicKey()) {
  return new TransactionBuilder(new Account(source, "41"), { fee: "100", networkPassphrase: Networks.PUBLIC })
    .addOperation(Operation.payment({ amount: "12.5", asset: Asset.native(), destination: DESTINATION }))
    .addMemo(Memo.text("=:BTC.BTC:bc1q"))
    .setTimeout(30)
    .build();
}

describe("ledger Stellar signer", () => {
  beforeEach(() => {
    calls.getPublicKey.length = 0;
    calls.signTransaction.length = 0;
    deviceSignature = undefined;
  });

  it("derives the account address from the device public key on the account-level path", async () => {
    const signer = await StellarLedger([44, 148, 3, 0, 0], transport);

    expect(signer.getAddress()).toBe(device.publicKey());
    expect(calls.getPublicKey).toEqual(["m/44'/148'/3'"]);
  });

  it.each([
    ["a change level", [44, 148, 0, 1, 0]],
    ["an address index", [44, 148, 0, 0, 7]],
    ["another coin type", [44, 60, 0, 0, 0]],
  ])("rejects a derivation path with %s before reaching the device", (_, path) => {
    expect(() => getStellarLedgerPath(path as [number, number, number, number, number])).toThrow(
      "wallet_ledger_derivation_path_error",
    );
  });

  it("signs the exact signature base and attaches the device signature to the original transaction", async () => {
    const signer = await StellarLedger(undefined, transport);
    const transaction = buildTransaction();
    const xdrBeforeSigning = transaction.toEnvelope().v1().tx().toXDR("base64");

    const signed = await signer.signTransaction(transaction);

    expect(signed).toBe(transaction);
    expect(calls.signTransaction).toEqual([{ path: "m/44'/148'/0'", payload: transaction.signatureBase() }]);
    expect(transaction.toEnvelope().v1().tx().toXDR("base64")).toBe(xdrBeforeSigning);
    expect(transaction.signatures).toHaveLength(1);
    expect(device.verify(transaction.hash(), transaction.signatures[0]?.signature() ?? Buffer.alloc(0))).toBe(true);
  });

  it("signs a fee bump transaction over its own signature base", async () => {
    const signer = await StellarLedger(undefined, transport);
    const inner = buildTransaction(Keypair.random().publicKey());
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(device.publicKey(), "200", inner, Networks.PUBLIC);

    await signer.signTransaction(feeBump);

    expect(calls.signTransaction[0]?.payload).toEqual(feeBump.signatureBase());
    expect(feeBump.signatures).toHaveLength(1);
    expect(inner.signatures).toHaveLength(0);
  });

  it("refuses a signature that does not verify against the device key", async () => {
    const signer = await StellarLedger(undefined, transport);
    deviceSignature = () => Buffer.alloc(64, 0xab);
    const transaction = buildTransaction();

    await expect(signer.signTransaction(transaction)).rejects.toThrow("wallet_ledger_invalid_signature");
    expect(transaction.signatures).toHaveLength(0);
  });
});

afterAll(() => {
  mock.module("@ledgerhq/hw-app-str", () => realStrAppSnapshot);
});
