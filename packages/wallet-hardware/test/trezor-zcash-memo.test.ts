import { describe, expect, it, mock } from "bun:test";
import { Chain, type DerivationPathArray } from "@swapkit/helpers";
import {
  createZcashTransaction,
  NETWORKS,
  p2pkh,
  Script,
  ZcashConsensusBranchId,
  type ZcashTransaction,
  ZcashVersionGroupId,
} from "@swapkit/utxo-signer";

const signTransaction = mock((_params: { outputs: Record<string, unknown>[] }) =>
  Promise.resolve({ payload: { error: "captured" }, success: false }),
);

mock.module("@trezor/connect-web", () => ({
  default: {
    dispose: mock(() => Promise.resolve(undefined)),
    getAddress: mock(() => Promise.resolve({ payload: { address: "unused" }, success: true })),
    init: mock(() => Promise.resolve(undefined)),
    signTransaction,
  },
}));

const { trezorWallet } = await import("../src/trezor");

const sender = p2pkh(new Uint8Array(33).fill(2), NETWORKS.zcash);
const recipient = p2pkh(new Uint8Array([3, ...new Uint8Array(32).fill(7)]), NETWORKS.zcash);

type ConnectedZcashWallet = { signAndBroadcastTransaction: (tx: ZcashTransaction) => Promise<string> };

async function connect() {
  const addChain = mock(() => undefined);
  const connectWallet = trezorWallet.connectTrezor.connectWallet({ addChain: addChain as never });

  await connectWallet([Chain.Zcash], [44, 133, 0, 0, 0] as unknown as DerivationPathArray, {
    address: sender.address as string,
  });

  return addChain.mock.calls[0]?.[0] as unknown as ConnectedZcashWallet;
}

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

async function outputsSentToTrezor(tx: ZcashTransaction) {
  signTransaction.mockClear();
  const wallet = await connect();
  await wallet.signAndBroadcastTransaction(tx).catch(() => undefined);

  return signTransaction.mock.calls[0]?.[0].outputs ?? [];
}

const memoOfLength = (length: number) => "=:ETH.USDC:0x1c7b17362c84287bd1184447e6dfeaf920c31bbe:".padEnd(length, "1");

describe("the memo a Trezor signs on a transparent Zcash transaction", () => {
  it.each([75, 76, 80])("forwards a %i-byte memo unchanged", async (length) => {
    const memo = memoOfLength(length);
    const outputs = await outputsSentToTrezor(txWithOpReturn(Script.encode(["RETURN", Buffer.from(memo)])));
    const opReturn = outputs.find((output) => output.script_type === "PAYTOOPRETURN");

    expect(Buffer.from(String(opReturn?.op_return_data), "hex").toString()).toBe(memo);
  });

  it("refuses to sign when the OP_RETURN cannot be decoded", async () => {
    const truncated = new Uint8Array([0x6a, 0x20, 0x3d, 0x3a]);

    signTransaction.mockClear();
    const wallet = await connect();

    await expect(wallet.signAndBroadcastTransaction(txWithOpReturn(truncated))).rejects.toThrow();
    expect(signTransaction).not.toHaveBeenCalled();
  });
});
