import { describe, expect, it, mock } from "bun:test";
import { Chain, type DerivationPathArray, SwapKitError } from "@swapkit/helpers";
import {
  createZcashTransaction,
  NETWORKS,
  p2pkh,
  Script,
  ZcashConsensusBranchId,
  type ZcashTransaction,
  ZcashVersionGroupId,
} from "@swapkit/utxo-signer";

const signTransaction = mock(() =>
  Promise.resolve({ payload: { code: "Failure_DataError", message: "Not enough funds" }, success: false }),
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
const derivationPath = [44, 133, 0, 0, 0];

async function connectZcash() {
  const addChain = mock(() => undefined);
  const connectWallet = trezorWallet.connectTrezor.connectWallet({ addChain: addChain as never });

  await connectWallet([Chain.Zcash], derivationPath as unknown as DerivationPathArray, {
    address: sender.address as string,
  });

  return addChain.mock.calls[0]?.[0] as unknown as {
    signAndBroadcastTransaction: (tx: ZcashTransaction) => Promise<string>;
  };
}

function swapTransaction() {
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
  tx.addOutputAddress(sender.address as string, 40_000n, NETWORKS.zcash);
  tx.addOutput({ amount: 0n, script: Script.encode(["RETURN", Buffer.from("memo")]) });

  return tx;
}

describe("a Trezor refusing to sign a Zcash transaction", () => {
  it("reports the device's reason and what it was asked to sign", async () => {
    const wallet = await connectZcash();
    const error = await wallet.signAndBroadcastTransaction(swapTransaction()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SwapKitError);
    expect((error as SwapKitError).info).toEqual({
      chain: Chain.Zcash,
      code: "Failure_DataError",
      derivationPath,
      message: "Not enough funds",
      request: {
        branchId: ZcashConsensusBranchId.NU6,
        expiry: 0,
        fee: "10000",
        inputAmounts: ["200000"],
        inputs: [`${"01".repeat(32)}:0`],
        inputTotal: "200000",
        locktime: 0,
        outputs: [
          { amount: "150000", kind: "external" },
          { amount: "40000", kind: "change" },
          { amount: "0", kind: "op_return" },
        ],
        outputTotal: "190000",
        version: 4,
        versionGroupId: ZcashVersionGroupId.SAPLING,
      },
      signingPath: "transaction",
    });
  });

  it("asks Connect for the coin by its ticker", async () => {
    const wallet = await connectZcash();

    signTransaction.mockClear();
    await wallet.signAndBroadcastTransaction(swapTransaction()).catch(() => undefined);

    expect(signTransaction.mock.calls[0]?.[0]).toMatchObject({ coin: "zec" });
  });
});
