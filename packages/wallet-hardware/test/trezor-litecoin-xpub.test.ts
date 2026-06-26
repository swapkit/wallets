import { describe, expect, it, mock } from "bun:test";
import { HDKey } from "@scure/bip32";
import { Chain } from "@swapkit/helpers";
import { deriveAddressesFromXpub } from "@swapkit/toolboxes/utxo";
import { createPCZT, OutScript, Script, ZcashPSBT } from "@swapkit/utxo-signer";

const trezorGetPublicKeyCalls: unknown[] = [];
const trezorGetAddressCalls: unknown[] = [];
const trezorInitCalls: unknown[] = [];
const trezorSignTransactionCalls: unknown[] = [];
const trezorEthereumSignTransactionCalls: unknown[] = [];
const zcashAccountXpub = HDKey.fromMasterSeed(new Uint8Array(32).fill(2)).derive("m/44'/133'/0'").publicExtendedKey;
const routeZcashPsbt =
  "cHNidP8BAIoEAACAhSAviQFQx1Hb7TFkJ6J9EbQ3uDto8aT/S60/wG2bXy0XBWG4OAAAAAAA/////wJAS0wAAAAAABl2qRRoqKahzhZ0kiXT/vsflZcYLfxA84is1MZLAAAAAAAZdqkUuvXrOS/H9mC5F9onqk57H6xqjouIrAAAAAAAAAAAAAAAAAAAAAAAAAAI/AVCSVRHTwAE8E3sTQABASKAlpgAAAAAABl2qRS69es5L8f2YLkX2ieqTnsfrGqOi4isAAAA";
let trezorSerializedTx = "";
const trezorEthereumSerializedTx = "0xf86c";
const trezorEthereumSignedTxPayload = {
  r: `0x${"11".repeat(32)}`,
  s: `0x${"22".repeat(32)}`,
  serializedTx: trezorEthereumSerializedTx,
  v: "0x14985",
};

function uint32LE(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function compactSize(value: number) {
  if (value < 253) return Buffer.from([value]);
  throw new Error("Test compactSize helper only supports one-byte values");
}

function buildZcashSignedTx(inputScript: Uint8Array) {
  return Buffer.concat([
    uint32LE(0x80000004),
    uint32LE(0x892f2085),
    compactSize(1),
    Buffer.alloc(32),
    uint32LE(0),
    compactSize(inputScript.length),
    Buffer.from(inputScript),
    uint32LE(0xffffffff),
    compactSize(0),
    uint32LE(0),
    uint32LE(0),
  ]).toString("hex");
}

mock.module("@trezor/connect-web", () => ({
  default: {
    dispose: mock(() => Promise.resolve(undefined)),
    ethereumGetAddress: mock(() =>
      Promise.resolve({ payload: { address: "0x0000000000000000000000000000000000000001" }, success: true }),
    ),
    ethereumSignTransaction: mock((params: unknown) => {
      trezorEthereumSignTransactionCalls.push(params);

      return Promise.resolve({ payload: trezorEthereumSignedTxPayload, success: true });
    }),
    getAddress: mock((params: unknown) => {
      trezorGetAddressCalls.push(params);

      return Promise.resolve({ payload: { address: "t1MockTrezorAddress" }, success: true });
    }),
    getPublicKey: mock((params: unknown) => {
      trezorGetPublicKeyCalls.push(params);

      return Promise.resolve({
        payload: { depth: 3, fingerprint: 0, publicKey: "", serializedPath: "m/44'/133'/0'", xpub: zcashAccountXpub },
        success: true,
      });
    }),
    init: mock((params: unknown) => {
      trezorInitCalls.push(params);

      return Promise.resolve(undefined);
    }),
    signTransaction: mock((params: unknown) => {
      trezorSignTransactionCalls.push(params);

      return Promise.resolve({ payload: { serializedTx: trezorSerializedTx }, success: true });
    }),
  },
}));

import {
  getTrezorExtendedPublicKey,
  normalizeTrezorExtendedPublicKey,
  normalizeTrezorSignature,
  trezorWallet,
} from "../src/trezor";
import { getEVMSigner } from "../src/trezor/evmSigner";

describe("Trezor wallet handling", () => {
  it("normalizes Bitcoin-version account xpubs to Litecoin before address derivation", () => {
    const seed = new Uint8Array(32).fill(1);
    const bitcoinVersionAccountXpub = HDKey.fromMasterSeed(seed).derive("m/84'/2'/0'").publicExtendedKey;

    expect(() =>
      deriveAddressesFromXpub({ accountIndex: 0, chain: Chain.Litecoin, count: 1, xpub: bitcoinVersionAccountXpub }),
    ).toThrow("Version mismatch");

    const litecoinVersionAccountXpub = normalizeTrezorExtendedPublicKey(bitcoinVersionAccountXpub, Chain.Litecoin);
    const [address] = deriveAddressesFromXpub({
      accountIndex: 0,
      chain: Chain.Litecoin,
      count: 1,
      xpub: litecoinVersionAccountXpub,
    });

    expect(address?.address).toStartWith("ltc1");
  });

  it("uses the BCH sighash byte when Trezor returns a bare DER signature", () => {
    const derSignature = "3006020101020102";

    expect(normalizeTrezorSignature(derSignature, Chain.Bitcoin)).toEqual(
      new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02, 0x01]),
    );
    expect(normalizeTrezorSignature(derSignature, Chain.BitcoinCash)).toEqual(
      new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02, 0x41]),
    );
  });

  it("marks BCH, DASH, DOGE, and ZEC direct signing as available for testing", () => {
    expect(trezorWallet.connectTrezor.directSigningSupport[Chain.BitcoinCash]).toBe(true);
    expect(trezorWallet.connectTrezor.directSigningSupport[Chain.Dash]).toBe(true);
    expect(trezorWallet.connectTrezor.directSigningSupport[Chain.Dogecoin]).toBe(true);
    expect(trezorWallet.connectTrezor.directSigningSupport[Chain.Zcash]).toBe(true);
  });

  it("defaults Trezor Connect coreMode to auto", async () => {
    trezorInitCalls.length = 0;
    const addChain = mock(() => undefined);
    const connect = trezorWallet.connectTrezor.connectWallet({ addChain: addChain as never });

    await connect([Chain.Zcash], [44, 133, 0, 0, 0], { address: "t1SelectedDerivedAddress" });

    expect(trezorInitCalls.at(-1)).toMatchObject({ coreMode: "auto" });
  });

  it("returns Trezor's serialized EVM transaction for Arbitrum legacy token transfers", async () => {
    trezorEthereumSignTransactionCalls.length = 0;
    const signer = await getEVMSigner({
      chain: Chain.Arbitrum,
      derivationPath: [44, 60, 0, 0, 0],
      provider: {} as never,
    });

    const signedTx = await signer.signTransaction({
      data: `0xa9059cbb${"0".repeat(128)}`,
      gasLimit: 21000n,
      gasPrice: 100_000_000n,
      nonce: 1,
      to: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      value: 0n,
    });

    expect(signedTx).toBe(trezorEthereumSerializedTx);
    expect(trezorEthereumSignTransactionCalls.at(-1)).toMatchObject({
      path: "m/44'/60'/0'/0/0",
      transaction: {
        chainId: 42161,
        gasLimit: "0x5208",
        gasPrice: "0x5f5e100",
        nonce: "0x1",
        to: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        value: "0x0",
      },
    });
  });

  it("fetches Zcash xpubs with Trezor's zcash coin id", async () => {
    trezorGetPublicKeyCalls.length = 0;

    const info = await getTrezorExtendedPublicKey(Chain.Zcash, [44, 133, 0, 0, 0], { accountIndex: 0 });

    expect(info?.xpub).toBe(zcashAccountXpub);
    expect(trezorGetPublicKeyCalls.at(-1)).toMatchObject({ coin: "zcash", path: "m/44'/133'/0'", showOnTrezor: true });
  });

  it("reuses the selected Zcash address during connect", async () => {
    trezorGetAddressCalls.length = 0;
    const selectedAddress = "t1SelectedDerivedAddress";
    const addChain = mock(() => undefined);
    const connect = trezorWallet.connectTrezor.connectWallet({ addChain: addChain as never });

    await connect([Chain.Zcash], [44, 133, 0, 0, 0], { address: selectedAddress });

    expect(trezorGetAddressCalls).toHaveLength(0);
    expect(addChain).toHaveBeenCalledTimes(1);
    expect(addChain.mock.calls[0]?.[0]).toMatchObject({ address: selectedAddress, chain: Chain.Zcash });
  });

  it("extracts signatures from a Zcash transaction returned by Trezor", async () => {
    trezorSignTransactionCalls.length = 0;
    let connectedWallet: { signPCZT: (pczt: ReturnType<typeof createPCZT>) => Promise<ReturnType<typeof createPCZT>> };
    const connect = trezorWallet.connectTrezor.connectWallet({
      addChain: ((wallet: typeof connectedWallet) => {
        connectedWallet = wallet;
      }) as never,
    });

    await connect([Chain.Zcash], [44, 133, 0, 0, 0], { address: "t1SelectedDerivedAddress" });

    const scriptPubkey = OutScript.encode({ hash: new Uint8Array(20).fill(1), type: "pkh" });
    const signature = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02, 0x01]);
    const publicKey = new Uint8Array([0x02, ...new Uint8Array(32).fill(3)]);
    trezorSerializedTx = buildZcashSignedTx(Script.encode([signature, publicKey]));

    const pczt = createPCZT();
    pczt.addInput({ index: 0, scriptPubkey, txid: new Uint8Array(32).fill(4), value: 1n });
    pczt.addOutput({ scriptPubkey, value: 1n });

    if (!connectedWallet) throw new Error("Trezor wallet was not connected");

    const signed = await connectedWallet.signPCZT(pczt);
    const [signedPublicKey, signedSignature] = signed.getInput(0).partialSig?.[0] ?? [];

    expect(trezorSignTransactionCalls).toHaveLength(1);
    expect(signedPublicKey).toEqual(publicKey);
    expect(signedSignature).toEqual(signature);
  });

  it("passes route Zcash PSBT prev tx ids to Trezor without reversing them or looking up raw txs", async () => {
    trezorSignTransactionCalls.length = 0;

    const addChain = mock(() => undefined);
    const connect = trezorWallet.connectTrezor.connectWallet({ addChain: addChain as never });

    await connect([Chain.Zcash], [44, 133, 0, 0, 0], { address: "t1avAHkqjjsijtzBHCx5wdsBjFRGcZk3HDC" });

    const connectedWallet = addChain.mock.calls[0]?.[0] as {
      signPCZT: (pczt: ReturnType<InstanceType<typeof ZcashPSBT>["toPCZT"]>) => Promise<unknown>;
    };
    const pczt = ZcashPSBT.fromBase64(routeZcashPsbt).toPCZT();

    await connectedWallet.signPCZT(pczt);

    const signParams = trezorSignTransactionCalls.at(-1) as { inputs: Array<{ prev_hash: string }>; refTxs?: unknown };
    expect(signParams).toMatchObject({
      inputs: [{ prev_hash: "38b86105172d5f9b6dc03fad4bffa4f1683bb837b4117da2276431eddb51c750" }],
    });
    expect("refTxs" in signParams).toBe(false);
  });
});
