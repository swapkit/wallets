// @ts-nocheck - Test file with intentional mocking of browser globals
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { KeyPair } from "@near-js/crypto";
import { actionCreators, createTransaction } from "@near-js/transactions";
import { base64 } from "@scure/base";
import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { Chain } from "@swapkit/helpers";

import { getWalletMethods } from "../helpers";

const SUI_ADDRESS = `0x${"ab".repeat(32)}`;
const TRON_ADDRESS = "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8";

afterEach(() => {
  globalThis.window = undefined;
});

function tronTransaction(rawDataHex: string) {
  return {
    raw_data: { contract: [], expiration: 0, ref_block_bytes: "", ref_block_hash: "", timestamp: 0 },
    raw_data_hex: rawDataHex,
    txID: createHash("sha256").update(Buffer.from(rawDataHex, "hex")).digest("hex"),
  };
}

function stellarPayment(source: Keypair, amount: string) {
  return new TransactionBuilder(new Account(source.publicKey(), "1"), {
    fee: "100",
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(Operation.payment({ amount, asset: Asset.native(), destination: Keypair.random().publicKey() }))
    .setTimeout(30)
    .build();
}

describe("OneKey Sui signer", () => {
  function mockSui(signTransaction) {
    globalThis.window = {
      $onekey: { sui: { getAccounts: async () => [{ address: SUI_ADDRESS, publicKey: "" }], signTransaction } },
    };
  }

  test("sends the exact transaction bytes and returns the wallet signature", async () => {
    const txBytes = new Uint8Array([1, 2, 3, 4]);
    let request: Record<string, any> | undefined;
    mockSui((input) => {
      request = input;
      return Promise.resolve({ bytes: input.transaction.serialize(), signature: "wallet-signature" });
    });

    const wallet = await getWalletMethods(Chain.Sui);
    const signed = await wallet.signTransaction(txBytes);

    expect(request.chain).toBe("sui:mainnet");
    expect(request.account.address).toBe(SUI_ADDRESS);
    expect(base64.decode(request.transaction.serialize())).toEqual(txBytes);
    expect(signed).toEqual({ bytes: base64.encode(txBytes), signature: "wallet-signature" });
  });

  test("rejects a signature over different bytes", async () => {
    mockSui(async () => ({ bytes: base64.encode(new Uint8Array([9, 9])), signature: "wallet-signature" }));

    const wallet = await getWalletMethods(Chain.Sui);

    await expect(wallet.signTransaction(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow("different transaction");
  });
});

describe("OneKey Tron signer", () => {
  function mockTron(sign) {
    globalThis.window = {
      $onekey: {
        tron: {
          request: async () => ({ code: 200, message: "ok" }),
          tronWeb: { defaultAddress: { base58: TRON_ADDRESS }, trx: { sign } },
        },
      },
    };
  }

  test("returns the original transaction with the wallet signature", async () => {
    const transaction = tronTransaction("0a02abcd");
    mockTron(async (tx) => ({ ...tx, raw_data: { ...tx.raw_data, fee_limit: 1 }, signature: ["sig"] }));

    const wallet = await getWalletMethods(Chain.Tron);
    const signed = await wallet.signTransaction(transaction);

    expect(wallet.address).toBe(TRON_ADDRESS);
    expect(signed).toEqual({ ...transaction, signature: ["sig"] });
  });

  test("rejects a signature over a different transaction", async () => {
    const other = tronTransaction("0a02ffff");
    mockTron(async () => ({ ...other, signature: ["sig"] }));

    const wallet = await getWalletMethods(Chain.Tron);

    await expect(wallet.signTransaction(tronTransaction("0a02abcd"))).rejects.toThrow("different transaction");
  });
});

describe("OneKey Stellar signer", () => {
  function mockStellar(signer: Keypair, signTransaction) {
    globalThis.window = {
      $onekey: {
        stellar: {
          getAddress: async () => ({ address: signer.publicKey() }),
          getNetwork: async () => ({ network: "mainnet", networkPassphrase: Networks.PUBLIC }),
          signTransaction,
        },
      },
    };
  }

  test("adds the wallet signature to the requested transaction", async () => {
    const keypair = Keypair.random();
    const transaction = stellarPayment(keypair, "1");
    mockStellar(keypair, (xdr) => {
      const tx = TransactionBuilder.fromXDR(xdr, Networks.PUBLIC);
      tx.sign(keypair);
      return Promise.resolve({ signedTxXdr: tx.toXDR() });
    });

    const wallet = await getWalletMethods(Chain.Stellar);
    const signed = await wallet.signTransaction(transaction);

    expect(signed.hash()).toEqual(transaction.hash());
    expect(signed.signatures).toHaveLength(1);
    expect(keypair.verify(transaction.hash(), signed.signatures[0].signature())).toBe(true);
  });

  test("rejects a signature over a different transaction", async () => {
    const keypair = Keypair.random();
    mockStellar(keypair, () => {
      const tx = stellarPayment(keypair, "100");
      tx.sign(keypair);
      return Promise.resolve({ signedTxXdr: tx.toXDR() });
    });

    const wallet = await getWalletMethods(Chain.Stellar);

    await expect(wallet.signTransaction(stellarPayment(keypair, "1"))).rejects.toThrow("different transaction");
  });
});

describe("OneKey Near signer", () => {
  test("sends the encoded transaction to OneKey and returns its hash", async () => {
    const keyPair = KeyPair.fromRandom("ed25519");
    const transaction = createTransaction(
      "alice.near",
      keyPair.getPublicKey(),
      "bob.near",
      1n,
      [actionCreators.transfer(1n)],
      new Uint8Array(32),
    );
    const requests = [];
    globalThis.window = {
      $onekey: {
        jsBridge: {
          request: ({ data, scope }) => {
            requests.push({ ...data, scope });
            if (data.method === "near_requestAccounts") {
              const accounts = [{ accountId: "alice.near", publicKey: keyPair.getPublicKey().toString() }];
              return Promise.resolve({ result: { accounts } });
            }
            if (data.method === "near_network") return Promise.resolve({ result: { networkId: "mainnet" } });
            return Promise.resolve({ result: { transactionHashes: ["near-hash"] } });
          },
        },
      },
    };

    const wallet = await getWalletMethods(Chain.Near);
    const hash = await wallet.signAndBroadcastTransaction(transaction);
    const signRequest = requests.find(({ method }) => method === "near_requestSignTransactions");

    expect(hash).toBe("near-hash");
    expect(signRequest.scope).toBe("near");
    expect(signRequest.params[0].send).toBe(true);
    expect(signRequest.params[0].transactions).toEqual([base64.encode(transaction.encode())]);
  });
});

test("connects Solana through the provider OneKey injects", async () => {
  const address = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
  globalThis.window = { $onekey: { solana: { connect: async () => ({ publicKey: { toString: () => address } }) } } };

  const wallet = await getWalletMethods(Chain.Solana);

  expect(wallet.address).toBe(address);
});
