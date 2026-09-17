import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Chain } from "@swapkit/helpers";
import { Transaction } from "ethers";

type TrezorTxFields = {
  chainId: number;
  gasLimit: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce: string;
  to: string;
  value: string;
};

const signedTransactions: TrezorTxFields[] = [];

mock.module("@trezor/connect-web", () => ({
  default: {
    ethereumSignTransaction: ({ transaction }: { transaction: TrezorTxFields }) => {
      signedTransactions.push(transaction);
      return Promise.resolve({ payload: { serializedTx: "0xdeadbeef" }, success: true });
    },
  },
}));

const { getEVMSigner } = await import("../src/trezor/evmSigner");

const provider = { getTransactionCount: async () => 1 } as never;

async function signWith(request: Parameters<Awaited<ReturnType<typeof getEVMSigner>>["signTransaction"]>[0]) {
  const signer = await getEVMSigner({ chain: Chain.Arc, derivationPath: [44, 60, 0, 0, 0], provider });

  return signer.signTransaction(request);
}

const baseTx = { gasLimit: 23100n, nonce: 1, to: "0xD32aaAEC45860b5330B8F7B101ED8d5D01E99f38", value: 0n };

describe("trezor evm fee fields", () => {
  beforeEach(() => {
    signedTransactions.length = 0;
  });

  it("signs an EIP-1559 transaction whose priority fee is zero", async () => {
    // Arc reports a tip of a few wei, and an idle RPC reports zero - which used to read as
    // "no fee data" and failed the swap with wallet_missing_params.
    const tx = Transaction.from({ ...baseTx, maxFeePerGas: 40000000008n, maxPriorityFeePerGas: 0n, type: 2 });

    expect(await signWith(tx)).toBe("0xdeadbeef");
    expect(signedTransactions[0]).toMatchObject({ maxFeePerGas: "0x9502f9008", maxPriorityFeePerGas: "0x0" });
    expect(signedTransactions[0]).not.toHaveProperty("gasPrice");
  });

  it("keeps sending both fee fields when the priority fee is set", async () => {
    const tx = Transaction.from({ ...baseTx, maxFeePerGas: 60000000012n, maxPriorityFeePerGas: 12n, type: 2 });

    await signWith(tx);
    expect(signedTransactions[0]).toMatchObject({ maxFeePerGas: "0xdf847580c", maxPriorityFeePerGas: "0xc" });
  });

  it("still signs legacy transactions with a gas price", async () => {
    const tx = Transaction.from({ ...baseTx, gasPrice: 20000000008n, type: 0 });

    await signWith(tx);
    expect(signedTransactions[0]).toMatchObject({ gasPrice: "0x4a817c808" });
    expect(signedTransactions[0]).not.toHaveProperty("maxFeePerGas");
  });

  it("rejects an EIP-1559 transaction without a fee cap", async () => {
    const tx = Transaction.from({ ...baseTx, maxFeePerGas: 0n, maxPriorityFeePerGas: 0n, type: 2 });

    await expect(signWith(tx)).rejects.toThrow("wallet_missing_params");
    expect(signedTransactions).toHaveLength(0);
  });

  it("rejects a legacy transaction without a gas price", async () => {
    const tx = { ...baseTx, gasPrice: null, maxFeePerGas: null, maxPriorityFeePerGas: null, type: 0 };

    await expect(signWith(tx)).rejects.toThrow("wallet_missing_params");
    expect(signedTransactions).toHaveLength(0);
  });
});
