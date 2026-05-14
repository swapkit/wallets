import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AssetValue, Chain } from "@swapkit/helpers";

let createTransactionParams: Record<string, unknown> | undefined;

mock.module("@solana/web3.js", () => ({
  PublicKey: class PublicKey {
    constructor(readonly value: string) {}
  },
}));

mock.module("@swapkit/toolboxes/solana", () => ({
  getSolanaToolbox: () => ({
    createTransaction: (params: Record<string, unknown>) => {
      createTransactionParams = params;

      return { feePayer: undefined, recentBlockhash: undefined, serialize: () => new Uint8Array([1, 2, 3]) };
    },
    getConnection: async () => ({
      getLatestBlockhash: async () => ({ blockhash: "blockhash" }),
      sendRawTransaction: async () => "solana-txid",
    }),
    validateAddress: () => true,
  }),
}));

describe("phantom wallet", () => {
  beforeEach(() => {
    createTransactionParams = undefined;

    globalThis.window = {
      phantom: {
        solana: {
          connect: async () => ({ publicKey: { toString: () => "sender-address" } }),
          isPhantom: true,
          signTransaction: async (transaction: unknown) => transaction,
        },
      },
    } as unknown as Window & typeof globalThis;
  });

  test("passes memo through Solana transfer transaction creation", async () => {
    const { phantomWallet } = await import("../src/phantom");
    const [walletName] = Object.keys(phantomWallet);
    const wallet = phantomWallet[walletName as keyof typeof phantomWallet];
    let solanaWallet: Record<string, unknown> | undefined;

    await wallet.connectWallet({
      addChain: (chainWallet) => {
        solanaWallet = chainWallet as Record<string, unknown>;
      },
    })([Chain.Solana]);

    await (solanaWallet?.transfer as Function)({
      assetValue: AssetValue.from({ chain: Chain.Solana, value: "1" }),
      memo: "=:ETH.ETH:0xabc",
      recipient: "recipient-address",
    });

    expect(createTransactionParams?.memo).toBe("=:ETH.ETH:0xabc");
  });
});
