import { describe, expect, it, mock } from "bun:test";
import { HDKey } from "@scure/bip32";
import { Chain, type DerivationPathArray } from "@swapkit/helpers";
import { getNetworkForChain } from "@swapkit/toolboxes/utxo";
import {
  createZcashTransaction,
  NETWORKS,
  p2pkh,
  p2wpkh,
  Script,
  Transaction,
  ZcashConsensusBranchId,
  type ZcashTransaction,
  ZcashVersionGroupId,
} from "@swapkit/utxo-signer";

const btcAccount = HDKey.fromMasterSeed(new Uint8Array(64).fill(5)).derive("m/84'/0'/0'");

const signTransaction = mock((_params: { outputs: Record<string, unknown>[] }) =>
  Promise.resolve({ payload: { error: "device declined" }, success: false }),
);

mock.module("@trezor/connect-web", () => ({
  default: {
    dispose: mock(() => Promise.resolve(undefined)),
    getAddress: mock(() => Promise.resolve({ payload: { address: "unused" }, success: true })),
    getPublicKey: mock(({ path }: { path: string }) =>
      Promise.resolve({
        payload: { depth: 3, fingerprint: 0, publicKey: "", serializedPath: path, xpub: btcAccount.publicExtendedKey },
        success: true,
      }),
    ),
    init: mock(() => Promise.resolve(undefined)),
    signTransaction,
  },
}));

const { trezorWallet } = await import("../src/trezor");

type ConnectedWallet = {
  signAndBroadcastTransaction: (tx: ZcashTransaction) => Promise<string>;
  signTransaction: (tx: Transaction, inputs?: unknown[], memo?: string) => Promise<unknown>;
};

async function connect(chain: Chain, derivationPath: number[], address: string) {
  const addChain = mock(() => undefined);
  const connectWallet = trezorWallet.connectTrezor.connectWallet({ addChain: addChain as never });

  await connectWallet([chain], derivationPath as unknown as DerivationPathArray, { address });

  return addChain.mock.calls[0]?.[0] as unknown as ConnectedWallet;
}

const memoOfLength = (length: number) => "=:ETH.USDC:0x1c7b17362c84287bd1184447e6dfeaf920c31bbe:".padEnd(length, "1");
const opReturnOf = (memo: string) => Script.encode(["RETURN", Buffer.from(memo)]);
const truncatedOpReturn = new Uint8Array([0x6a, 0x20, 0x3d, 0x3a]);

function memoSentToTrezor() {
  const outputs = signTransaction.mock.calls[0]?.[0].outputs ?? [];
  const opReturn = outputs.find((output) => output.script_type === "PAYTOOPRETURN");

  return Buffer.from(String(opReturn?.op_return_data), "hex").toString();
}

describe("the memo a Trezor signs on a transparent Zcash transaction", () => {
  const sender = p2pkh(new Uint8Array(33).fill(2), NETWORKS.zcash);
  const recipient = p2pkh(new Uint8Array([3, ...new Uint8Array(32).fill(7)]), NETWORKS.zcash);
  const connectZcash = () => connect(Chain.Zcash, [44, 133, 0, 0, 0], sender.address as string);

  function txWithOpReturn(opReturnScript: Uint8Array) {
    const tx = createZcashTransaction({
      consensusBranchId: ZcashConsensusBranchId.NU6,
      expiryHeight: 0,
      lockTime: 0,
      version: 4,
      versionGroupId: ZcashVersionGroupId.SAPLING,
    });

    tx.addInput({
      index: 0,
      script: sender.script,
      sequence: 0xffffffff,
      txid: new Uint8Array(32).fill(1),
      value: 200_000n,
    });
    tx.addOutputAddress(recipient.address as string, 150_000n, NETWORKS.zcash);
    tx.addOutput({ amount: 0n, script: opReturnScript });

    return tx;
  }

  it.each([75, 76])("forwards a %i-byte memo unchanged", async (length) => {
    const memo = memoOfLength(length);
    const wallet = await connectZcash();

    signTransaction.mockClear();
    await wallet.signAndBroadcastTransaction(txWithOpReturn(opReturnOf(memo))).catch(() => undefined);

    expect(memoSentToTrezor()).toBe(memo);
  });

  it("refuses to sign when the OP_RETURN cannot be decoded", async () => {
    const wallet = await connectZcash();

    signTransaction.mockClear();

    await expect(wallet.signAndBroadcastTransaction(txWithOpReturn(truncatedOpReturn))).rejects.toThrow(/OP_RETURN/);
    expect(signTransaction).not.toHaveBeenCalled();
  });
});

describe("the memo a Trezor signs on a Bitcoin transaction", () => {
  const sender = p2wpkh(btcAccount.derive("m/0/0").publicKey as Uint8Array, getNetworkForChain(Chain.Bitcoin));
  const connectBitcoin = () => connect(Chain.Bitcoin, [84, 0, 0, 0, 0], sender.address as string);

  function txWithOpReturn(opReturnScript: Uint8Array) {
    const tx = new Transaction({ allowUnknownOutputs: true });

    tx.addInput({
      index: 0,
      txid: new Uint8Array(32).fill(1),
      witnessUtxo: { amount: 100_000n, script: sender.script },
    });
    tx.addOutput({ amount: 90_000n, script: sender.script });
    tx.addOutput({ amount: 0n, script: opReturnScript });

    return tx;
  }

  it("forwards a memo longer than 75 bytes unchanged", async () => {
    const memo = memoOfLength(76);
    const wallet = await connectBitcoin();

    signTransaction.mockClear();
    await wallet.signTransaction(txWithOpReturn(opReturnOf(memo))).catch(() => undefined);

    expect(memoSentToTrezor()).toBe(memo);
  });

  it("forwards an empty OP_RETURN", async () => {
    const wallet = await connectBitcoin();

    signTransaction.mockClear();
    await wallet.signTransaction(txWithOpReturn(new Uint8Array([0x6a, 0x00]))).catch(() => undefined);

    expect(memoSentToTrezor()).toBe("");
  });
});

describe("the memo a Trezor signs on a Dogecoin transaction", () => {
  const sender = p2pkh(new Uint8Array(33).fill(2), getNetworkForChain(Chain.Dogecoin));
  const inputs = [{ hash: "01".repeat(32), index: 0, value: 100_000 }];
  const connectDogecoin = () => connect(Chain.Dogecoin, [44, 3, 0, 0, 0], sender.address as string);

  function txWithOpReturn(opReturnScript?: Uint8Array) {
    const tx = new Transaction({ allowLegacyWitnessUtxo: true, allowUnknownOutputs: true });

    tx.addInput({
      index: 0,
      txid: new Uint8Array(32).fill(1),
      witnessUtxo: { amount: 100_000n, script: sender.script },
    });
    tx.addOutput({ amount: 90_000n, script: sender.script });
    if (opReturnScript) tx.addOutput({ amount: 0n, script: opReturnScript });

    return tx;
  }

  it("refuses to sign an OP_RETURN Trezor cannot rebuild", async () => {
    const wallet = await connectDogecoin();
    const multiPushOpReturn = Script.encode(["RETURN", Buffer.from("=:e"), Buffer.from(":0x1c7b")]);

    signTransaction.mockClear();

    await expect(wallet.signTransaction(txWithOpReturn(multiPushOpReturn), inputs)).rejects.toThrow(/OP_RETURN/);
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it("only signs when the transaction carries the memo it was given", async () => {
    const memo = memoOfLength(60);
    const wallet = await connectDogecoin();

    signTransaction.mockClear();
    await wallet.signTransaction(txWithOpReturn(opReturnOf(memo)), inputs, memo).catch(() => undefined);
    expect(memoSentToTrezor()).toBe(memo);

    signTransaction.mockClear();
    await expect(wallet.signTransaction(txWithOpReturn(), inputs, memo)).rejects.toThrow(/memo/);
    expect(signTransaction).not.toHaveBeenCalled();
  });
});
