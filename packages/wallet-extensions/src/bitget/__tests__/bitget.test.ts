// @ts-nocheck - Test file with intentional mocking of browser globals
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { base64 } from "@scure/base";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { Chain, SwapKitError } from "@swapkit/helpers";

import { getWalletMethods } from "../helpers";
import { bitgetWallet } from "../index";

const SUI_ADDRESS = `0x${"ab".repeat(32)}`;
const XRP_ADDRESS = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";

afterEach(() => {
  globalThis.window = undefined;
});

function suiProvider(connect = async () => ({ accounts: [{ address: SUI_ADDRESS }] })) {
  return { connect, signTransaction: async (input) => ({ bytes: input.transaction.serialize(), signature: "sig" }) };
}

function connectBitget(chains: Chain[]) {
  const connected: Chain[] = [];
  const connect = bitgetWallet.connectBitget.connectWallet({ addChain: ({ chain }) => connected.push(chain) });

  return { connected, result: connect(chains) };
}

describe("Bitget connection", () => {
  test("keeps the chains that connect when another one is missing in the wallet", async () => {
    globalThis.window = { bitkeep: { suiWallet: suiProvider() } };

    const { connected, result } = connectBitget([Chain.Ton, Chain.Sui]);

    expect(await result).toBe(true);
    expect(connected).toEqual([Chain.Sui]);
  });

  test("stops at a rejected approval instead of asking for the remaining chains", async () => {
    const rejection = new SwapKitError("wallet_connection_rejected_by_user");
    globalThis.window = { bitkeep: { suiWallet: suiProvider(() => Promise.reject(rejection)) } };

    const { connected, result } = connectBitget([Chain.Sui, Chain.Ton]);

    await expect(result).rejects.toBe(rejection);
    expect(connected).toEqual([]);
  });
});

describe("Bitget Sui signer", () => {
  test("rejects a signature over different bytes", async () => {
    const provider = suiProvider();
    provider.signTransaction = async () => ({ bytes: base64.encode(new Uint8Array([9, 9])), signature: "sig" });
    globalThis.window = { bitkeep: { suiWallet: provider } };

    const wallet = await getWalletMethods(Chain.Sui);

    await expect(wallet.signTransaction(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow("toolbox_sui_signing_error");
  });
});

describe("Bitget Solana signer", () => {
  test("rebuilds the transaction when the wallet answers with signed bytes", async () => {
    const keypair = Keypair.generate();
    const transaction = new Transaction({ blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1 });
    transaction.feePayer = keypair.publicKey;
    transaction.add(
      SystemProgram.transfer({ fromPubkey: keypair.publicKey, lamports: 1, toPubkey: keypair.publicKey }),
    );

    globalThis.window = {
      bitkeep: {
        solana: {
          connect: async () => ({ accounts: [{ address: keypair.publicKey.toBase58() }] }),
          publicKey: null,
          signTransaction: (tx) => {
            tx.sign(keypair);
            return Promise.resolve([{ signedTransaction: tx.serialize() }]);
          },
        },
      },
    };

    const wallet = await getWalletMethods(Chain.Solana);
    const signed = await wallet.signTransaction(transaction);

    expect(wallet.address).toBe(keypair.publicKey.toBase58());
    expect(signed).toBeInstanceOf(Transaction);
    expect(signed.verifySignatures()).toBe(true);
  });
});

describe("Bitget Tron signer", () => {
  function mockTron(sign) {
    globalThis.window = {
      bitkeep: {
        tronLink: { request: async () => ({ code: 200 }) },
        tronWeb: { defaultAddress: { base58: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8" }, trx: { sign } },
      },
    };
  }

  function tronTransaction(rawDataHex: string) {
    return {
      raw_data: { contract: [], expiration: 0, ref_block_bytes: "", ref_block_hash: "", timestamp: 0 },
      raw_data_hex: rawDataHex,
      txID: createHash("sha256").update(Buffer.from(rawDataHex, "hex")).digest("hex"),
      visible: true,
    };
  }

  test("keeps the requested transaction when the wallet returns a stripped copy", async () => {
    const transaction = tronTransaction("0a02");
    mockTron(async ({ raw_data, txID }) => ({ raw_data, signature: ["sig"], txID }));

    const wallet = await getWalletMethods(Chain.Tron);

    expect(await wallet.signTransaction(transaction)).toEqual({ ...transaction, signature: ["sig"] });
  });

  test("rejects a signature over a different transaction", async () => {
    mockTron(async () => ({ ...tronTransaction("0b03"), signature: ["sig"] }));

    const wallet = await getWalletMethods(Chain.Tron);

    await expect(wallet.signTransaction(tronTransaction("0a02"))).rejects.toThrow("core_transaction_failed");
  });
});

describe("Bitget XRP signer", () => {
  test("hands the transaction to the wallet and returns the hash it reports", async () => {
    let sent: Record<string, unknown> | undefined;
    globalThis.window = {
      bitkeep: {
        xrp: {
          connect: async () => ({ address: XRP_ADDRESS }),
          sendTransaction: (transaction) => {
            sent = transaction;
            return Promise.resolve({ hash: "ABCDEF" });
          },
        },
      },
    };

    const wallet = await getWalletMethods(Chain.Ripple);
    const payment = { Account: XRP_ADDRESS, Amount: "1", Destination: XRP_ADDRESS, TransactionType: "Payment" };

    expect(wallet.address).toBe(XRP_ADDRESS);
    expect(await wallet.signAndBroadcastTransaction(payment)).toBe("ABCDEF");
    expect(sent).toEqual(payment);
  });
});
