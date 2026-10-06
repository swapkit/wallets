import { describe, expect, it, mock } from "bun:test";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import {
  AddressLookupTableAccount,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

const device = generateKeyPairSync("ed25519");
const deviceKey = new PublicKey(device.publicKey.export({ format: "der", type: "spki" }).subarray(-32));
const signedMessages: string[] = [];

mock.module("@trezor/connect-web", () => ({
  default: {
    solanaGetAddress: () => Promise.resolve({ payload: { address: deviceKey.toBase58() }, success: true }),
    solanaSignTransaction: ({ serializedTx }: { serializedTx: string }) => {
      signedMessages.push(serializedTx);
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

  it("rejects transactions it cannot fully sign", async () => {
    const signer = getSolanaSigner({ derivationPath: [44, 501, 0, 0] });
    const signedCount = signedMessages.length;

    const notOurs = buildTransaction(Keypair.generate().publicKey);
    await expect(signer.signTransaction(notOurs)).rejects.toThrow("not a required signer");

    const missingFeePayer = buildTransaction(deviceKey);
    await expect(signer.signTransaction(missingFeePayer)).rejects.toThrow("also needs signatures");

    expect(signedMessages).toHaveLength(signedCount);
  });
});
