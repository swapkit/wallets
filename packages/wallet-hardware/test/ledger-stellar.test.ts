import { beforeEach, describe, expect, it } from "bun:test";
import type Transport from "@ledgerhq/hw-transport";
import { Account, Asset, hash, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

import { getStellarLedgerPath, StellarLedger } from "../src/ledger/clients/stellar";

const INS_GET_PK = 0x02;
const INS_SIGN_TX = 0x04;
const P2_LAST = 0x00;
const SW_OK = Buffer.from([0x90, 0x00]);
const HARDENED = 0x80000000;

const device = Keypair.random();
const DESTINATION = "GDKIJJIKXLOM2NRMPNQZUUYK24ZPVFC6426GZAEP3KUK6KEJLACCWNMX";

let received: { getPublicKey: number[][]; signTransaction: Array<{ path: number[]; signatureBase: Buffer }> };
let deviceSignature: ((signatureBase: Buffer) => Buffer) | undefined;

function readPath(payload: Buffer) {
  const length = payload.readUInt8(0);
  const path = Array.from({ length }, (_, i) => payload.readUInt32BE(1 + i * 4));
  return { path, rest: payload.subarray(1 + length * 4) };
}

// Emulates the Stellar app at the APDU level so the real @ledgerhq/hw-app-str encodes paths and payloads.
function createDeviceTransport() {
  let pendingSignPayload = Buffer.alloc(0);

  return {
    decorateAppAPIMethods: () => undefined,
    send: (_cla: number, ins: number, _p1: number, p2: number, data: Buffer) => {
      if (ins === INS_GET_PK) {
        received.getPublicKey.push(readPath(data).path);
        return Promise.resolve(Buffer.concat([device.rawPublicKey(), SW_OK]));
      }

      if (ins === INS_SIGN_TX) {
        pendingSignPayload = Buffer.concat([pendingSignPayload, data]);
        if (p2 !== P2_LAST) return Promise.resolve(SW_OK);

        const { path, rest: signatureBase } = readPath(pendingSignPayload);
        pendingSignPayload = Buffer.alloc(0);
        received.signTransaction.push({ path, signatureBase });
        const signature = (deviceSignature ?? ((base) => device.sign(hash(base))))(signatureBase);
        return Promise.resolve(Buffer.concat([signature, SW_OK]));
      }

      return Promise.reject(new Error(`Unexpected instruction ${ins}`));
    },
  } as unknown as Transport;
}

function buildTransaction(source = device.publicKey()) {
  return new TransactionBuilder(new Account(source, "41"), { fee: "100", networkPassphrase: Networks.PUBLIC })
    .addOperation(Operation.payment({ amount: "12.5", asset: Asset.native(), destination: DESTINATION }))
    .addMemo(Memo.text("=:BTC.BTC:bc1q"))
    .setTimeout(30)
    .build();
}

describe("ledger Stellar signer", () => {
  beforeEach(() => {
    received = { getPublicKey: [], signTransaction: [] };
    deviceSignature = undefined;
  });

  it("derives the account address from the device public key on the hardened account-level path", async () => {
    const signer = await StellarLedger([44, 148, 3, 0, 0], createDeviceTransport());

    expect(signer.getAddress()).toBe(device.publicKey());
    expect(received.getPublicKey).toEqual([[44 + HARDENED, 148 + HARDENED, 3 + HARDENED]]);
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
    const signer = await StellarLedger(undefined, createDeviceTransport());
    const transaction = buildTransaction();
    const xdrBeforeSigning = transaction.toEnvelope().v1().tx().toXDR("base64");

    const signed = await signer.signTransaction(transaction);

    expect(signed).toBe(transaction);
    expect(received.signTransaction).toEqual([
      { path: [44 + HARDENED, 148 + HARDENED, HARDENED], signatureBase: transaction.signatureBase() },
    ]);
    expect(transaction.toEnvelope().v1().tx().toXDR("base64")).toBe(xdrBeforeSigning);
    expect(transaction.signatures).toHaveLength(1);
    expect(device.verify(transaction.hash(), transaction.signatures[0]?.signature() ?? Buffer.alloc(0))).toBe(true);
  });

  it("signs a fee bump transaction over its own signature base", async () => {
    const signer = await StellarLedger(undefined, createDeviceTransport());
    const inner = buildTransaction(Keypair.random().publicKey());
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(device.publicKey(), "200", inner, Networks.PUBLIC);

    await signer.signTransaction(feeBump);

    expect(received.signTransaction[0]?.signatureBase).toEqual(feeBump.signatureBase());
    expect(feeBump.signatures).toHaveLength(1);
    expect(inner.signatures).toHaveLength(0);
  });

  it("refuses a signature that does not verify against the device key", async () => {
    const signer = await StellarLedger(undefined, createDeviceTransport());
    deviceSignature = () => Buffer.alloc(64, 0xab);
    const transaction = buildTransaction();

    await expect(signer.signTransaction(transaction)).rejects.toThrow("wallet_ledger_invalid_signature");
    expect(transaction.signatures).toHaveLength(0);
  });
});
