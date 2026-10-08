import { describe, expect, it, mock } from "bun:test";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import {
  AddressLookupTableAccount,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

const device = generateKeyPairSync("ed25519");
const deviceKey = new PublicKey(device.publicKey.export({ format: "der", type: "spki" }).subarray(-32));
const signedMessages: string[] = [];
const addressRequests: { showOnTrezor?: boolean }[] = [];
let deviceResponse: { payload: { error?: string; signature?: string }; success: boolean } | undefined;

mock.module("@trezor/connect-web", () => ({
  default: {
    solanaGetAddress: (params: { showOnTrezor?: boolean }) => {
      addressRequests.push(params);
      return Promise.resolve({ payload: { address: deviceKey.toBase58() }, success: true });
    },
    solanaSignTransaction: ({ serializedTx }: { serializedTx: string }) => {
      signedMessages.push(serializedTx);
      if (deviceResponse) return Promise.resolve(deviceResponse);
      const signature = sign(null, Buffer.from(serializedTx, "hex"), device.privateKey).toString("hex");
      return Promise.resolve({ payload: { signature }, success: true });
    },
  },
}));

const { getSolanaSigner } = await import("../src/trezor/solanaSigner");

const feePayer = Keypair.generate();
const recipient = Keypair.generate().publicKey;
const lookupTable = new AddressLookupTableAccount({
  key: Keypair.generate().publicKey,
  state: {
    addresses: [recipient],
    authority: undefined,
    deactivationSlot: BigInt("18446744073709551615"),
    lastExtendedSlot: 0,
    lastExtendedSlotStartIndex: 0,
  },
});

function buildTransaction(from: PublicKey) {
  const message = new TransactionMessage({
    instructions: [SystemProgram.transfer({ fromPubkey: from, lamports: 1000, toPubkey: recipient })],
    payerKey: feePayer.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
  }).compileToV0Message([lookupTable]);

  return VersionedTransaction.deserialize(new VersionedTransaction(message).serialize());
}

describe("trezor solana transaction", () => {
  it("signs the exact message and places the signature at the device signer index", async () => {
    const transaction = buildTransaction(deviceKey);
    transaction.sign([feePayer]);
    const messageBytes = transaction.message.serialize();
    const feePayerSignature = transaction.signatures[0]?.slice();

    const signer = getSolanaSigner({ derivationPath: [44, 501, 0, 0] });
    const signed = VersionedTransaction.deserialize((await signer.signTransaction(transaction)).serialize());

    expect(signedMessages.at(-1)).toBe(Buffer.from(messageBytes).toString("hex"));
    expect(signed.message.serialize()).toEqual(messageBytes);
    expect(signed.message.addressTableLookups).toHaveLength(1);
    expect(signed.signatures[0]).toEqual(feePayerSignature);
    expect(signed.message.staticAccountKeys[1]?.equals(deviceKey)).toBe(true);
    expect(verify(null, messageBytes, device.publicKey, signed.signatures[1] as Uint8Array)).toBe(true);
  });

  it("rejects transactions where the Trezor account is not a required signer", async () => {
    const signer = getSolanaSigner({ derivationPath: [44, 501, 0, 0] });
    const signedCount = signedMessages.length;

    const notOurs = buildTransaction(Keypair.generate().publicKey);
    await expect(signer.signTransaction(notOurs)).rejects.toThrow("not a required signer");

    expect(signedMessages).toHaveLength(signedCount);
  });

  it("signs a versioned transaction before the fee payer has signed", async () => {
    const transaction = buildTransaction(deviceKey);
    const messageBytes = transaction.message.serialize();

    const signer = getSolanaSigner({ derivationPath: [44, 501, 0, 0] });
    const signed = await signer.signTransaction(transaction);

    expect(signedMessages.at(-1)).toBe(Buffer.from(messageBytes).toString("hex"));
    expect(verify(null, messageBytes, device.publicKey, signed.signatures[1] as Uint8Array)).toBe(true);
    expect(signed.signatures[0]?.every((byte) => byte === 0)).toBe(true);
  });

  it("signs a legacy transaction before the fee payer has signed", async () => {
    const transaction = new Transaction({
      blockhash: Keypair.generate().publicKey.toBase58(),
      feePayer: feePayer.publicKey,
      lastValidBlockHeight: 0,
    }).add(SystemProgram.transfer({ fromPubkey: deviceKey, lamports: 1000, toPubkey: recipient }));
    const messageBytes = transaction.serializeMessage();

    const signer = getSolanaSigner({ derivationPath: [44, 501, 0, 0] });
    const signed = Transaction.from(
      (await signer.signTransaction(transaction)).serialize({ requireAllSignatures: false }),
    );

    expect(signedMessages.at(-1)).toBe(messageBytes.toString("hex"));
    expect(signed.signatures[0]?.signature).toBeNull();
    expect(verify(null, messageBytes, device.publicKey, signed.signatures[1]?.signature as Buffer)).toBe(true);
  });

  it("exposes the restored address without asking the device to show it", async () => {
    const requestCount = addressRequests.length;
    const signer = getSolanaSigner({ address: deviceKey.toBase58(), derivationPath: [44, 501, 0, 0] });

    expect(signer.publicKey?.equals(deviceKey)).toBe(true);
    expect(addressRequests).toHaveLength(requestCount);

    const transaction = buildTransaction(deviceKey);
    transaction.sign([feePayer]);
    const messageBytes = transaction.message.serialize();
    const signed = await signer.signTransaction(transaction);

    expect(verify(null, messageBytes, device.publicKey, signed.signatures[1] as Uint8Array)).toBe(true);
    expect(addressRequests.slice(requestCount).some(({ showOnTrezor }) => showOnTrezor)).toBe(false);
  });

  it("signs a legacy transaction without touching the other signatures", async () => {
    const transaction = new Transaction({
      blockhash: Keypair.generate().publicKey.toBase58(),
      feePayer: feePayer.publicKey,
      lastValidBlockHeight: 0,
    }).add(SystemProgram.transfer({ fromPubkey: deviceKey, lamports: 1000, toPubkey: recipient }));
    transaction.partialSign(feePayer);
    const messageBytes = transaction.serializeMessage();
    const feePayerSignature = transaction.signatures[0]?.signature?.slice();

    const signer = getSolanaSigner({ derivationPath: [44, 501, 0, 0] });
    const signed = Transaction.from((await signer.signTransaction(transaction)).serialize());

    expect(signedMessages.at(-1)).toBe(messageBytes.toString("hex"));
    expect(signed.serializeMessage()).toEqual(messageBytes);
    expect(signed.signatures[0]?.signature).toEqual(feePayerSignature);
    expect(verify(null, messageBytes, device.publicKey, signed.signatures[1]?.signature as Buffer)).toBe(true);
  });

  it("fails without adding a signature when the device refuses or returns a malformed one", async () => {
    const signer = getSolanaSigner({ derivationPath: [44, 501, 0, 0] });

    for (const response of [
      { payload: { error: "Cancelled" }, success: false },
      { payload: { signature: "ab".repeat(63) }, success: true },
      { payload: { signature: "ab".repeat(64) }, success: true },
    ]) {
      const transaction = buildTransaction(deviceKey);
      transaction.sign([feePayer]);
      deviceResponse = response;

      await expect(signer.signTransaction(transaction)).rejects.toThrow("wallet_trezor_failed_to_sign_transaction");
      expect(transaction.signatures[1]?.every((byte) => byte === 0)).toBe(true);
    }

    deviceResponse = undefined;
  });

  it("rejects derivation paths the Trezor firmware does not accept", () => {
    expect(() => getSolanaSigner({ derivationPath: [44, 501, 0, 0, 0] })).toThrow(
      "wallet_trezor_derivation_path_not_supported",
    );
    expect(() => getSolanaSigner({ derivationPath: [44, 60, 0, 0] })).toThrow(
      "wallet_trezor_derivation_path_not_supported",
    );
  });
});
