import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { Chain, type DerivationPathArray, SwapKitError } from "@swapkit/helpers";
import * as realUtxoToolbox from "@swapkit/toolboxes/utxo";
import {
  createZcashTransaction,
  NETWORKS,
  OutScript,
  p2pkh,
  ZcashConsensusBranchId,
  ZcashTransaction,
  ZcashVersion,
  ZcashVersionGroupId,
} from "@swapkit/utxo-signer";

const realUtxoToolboxSnapshot = { ...realUtxoToolbox };
const signTransactionCalls: Array<{ inputs: Array<{ amount: string; prev_hash: string; prev_index: number }> }> = [];
const transactionDetailsCalls: string[] = [];
let previousOutputs: Array<{ index: number; value: number }> = [];

mock.module("@trezor/connect-web", () => ({
  default: {
    dispose: mock(() => Promise.resolve(undefined)),
    getAddress: mock(() => Promise.resolve({ payload: { address: "unused" }, success: true })),
    init: mock(() => Promise.resolve(undefined)),
    signTransaction: mock((params: (typeof signTransactionCalls)[number]) => {
      signTransactionCalls.push(params);
      return Promise.resolve({ payload: { serializedTx: signedTransaction().toHex() }, success: true });
    }),
  },
}));

mock.module("@swapkit/toolboxes/utxo", () => ({
  ...realUtxoToolboxSnapshot,
  getUtxoApi: (chain: Chain) =>
    chain === Chain.Zcash
      ? {
          getTransactionDetails: (txid: string) => {
            transactionDetailsCalls.push(txid);
            return Promise.resolve({ outputs: previousOutputs });
          },
        }
      : realUtxoToolboxSnapshot.getUtxoApi(chain as Parameters<typeof realUtxoToolboxSnapshot.getUtxoApi>[0]),
}));

const { trezorWallet } = await import("../src/trezor");

const sender = p2pkh(new Uint8Array(33).fill(2), NETWORKS.zcash);
const previousTxid = new Uint8Array(32).fill(9);
const recipientScript = OutScript.encode({ hash: new Uint8Array(20).fill(1), type: "pkh" });

// What the SDK hands the wallet for a raw route transaction: parsed from bytes, so every input value is zero
function rawTransaction() {
  const tx = createZcashTransaction({
    consensusBranchId: ZcashConsensusBranchId.IRONWOOD,
    version: ZcashVersion.NU5,
    versionGroupId: ZcashVersionGroupId.NU5,
  });
  tx.addInput({ index: 0, script: sender.script, txid: previousTxid, value: 0n });
  tx.addInput({ index: 2, script: sender.script, txid: previousTxid, value: 0n });
  tx.addOutput({ amount: 45_000n, script: recipientScript });
  return ZcashTransaction.fromHex(tx.toHex());
}

function signedTransaction() {
  const tx = createZcashTransaction({ version: ZcashVersion.NU5, versionGroupId: ZcashVersionGroupId.NU5 });
  tx.addInput({ index: 0, script: new Uint8Array(), txid: previousTxid, value: 30_000n });
  tx.addInput({ index: 2, script: new Uint8Array(), txid: previousTxid, value: 20_000n });
  tx.addOutput({ amount: 45_000n, script: recipientScript });
  return tx;
}

async function connectZcash() {
  const addChain = mock(() => undefined);
  const connectWallet = trezorWallet.connectTrezor.connectWallet({ addChain: addChain as never });
  await connectWallet([Chain.Zcash], [44, 133, 0, 0, 0] as unknown as DerivationPathArray, {
    address: sender.address as string,
  });
  return addChain.mock.calls[0]?.[0] as unknown as { signTransaction: (tx: ZcashTransaction) => Promise<unknown> };
}

describe("Trezor signing a raw Zcash transaction", () => {
  beforeEach(() => {
    signTransactionCalls.length = 0;
    transactionDetailsCalls.length = 0;
    previousOutputs = [
      { index: 0, value: 30_000 },
      { index: 1, value: 1 },
      { index: 2, value: 20_000 },
    ];
  });

  afterAll(() => {
    mock.module("@swapkit/toolboxes/utxo", () => realUtxoToolboxSnapshot);
  });

  it("looks up the missing input amounts once per previous transaction before signing", async () => {
    const wallet = await connectZcash();

    await wallet.signTransaction(rawTransaction());

    expect(transactionDetailsCalls).toEqual(["09".repeat(32)]);
    expect(signTransactionCalls[0]?.inputs.map(({ amount, prev_index }) => [prev_index, amount])).toEqual([
      [0, "30000"],
      [2, "20000"],
    ]);
  });

  it("refuses to sign when an input amount cannot be resolved", async () => {
    const wallet = await connectZcash();
    previousOutputs = [{ index: 0, value: 30_000 }];

    const error = await wallet.signTransaction(rawTransaction()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SwapKitError);
    expect((error as SwapKitError).info).toMatchObject({ chain: Chain.Zcash, inputIndex: 1, txid: "09".repeat(32) });
    expect(signTransactionCalls).toHaveLength(0);
  });
});
