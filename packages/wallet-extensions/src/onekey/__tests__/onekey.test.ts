// @ts-nocheck - Test file with intentional mocking of browser globals
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { KeyPair } from "@near-js/crypto";
import { actionCreators, createTransaction } from "@near-js/transactions";
import { base64 } from "@scure/base";
import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { Chain, SKConfig } from "@swapkit/helpers";

import { getWalletMethods } from "../helpers";
import { onekeyWallet } from "../index";

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

describe("OneKey Tron signer", () => {
  function mockTron(sign, requestAccountsCode = 200) {
    globalThis.window = {
      $onekey: {
        tron: {
          request: ({ method, params }) => {
            if (method === "tron_signTransaction") return sign(params);
            if (method === "tron_accounts") return Promise.resolve([TRON_ADDRESS]);
            return Promise.resolve({ code: requestAccountsCode, message: "" });
          },
          // OneKey's own sign() is broken and its tronWeb can still have no address after an existing connection
          sign: () => Promise.reject(new TypeError("tronWeb.utils.isString is not a function")),
          tronWeb: { defaultAddress: { base58: false } },
        },
      },
    };
  }

  test("connects when OneKey answers 4000 to an approval that did connect the account", async () => {
    mockTron(async () => ({}), 4000);

    const wallet = await getWalletMethods(Chain.Tron);

    expect(wallet.address).toBe(TRON_ADDRESS);
  });

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

  test("rejects a signature when the provider rewrites the transaction it was given", async () => {
    const other = tronTransaction("0a02ffff");
    mockTron(async (tx) => Object.assign(tx, other, { signature: ["sig"] }));
    const transaction = tronTransaction("0a02abcd");
    const original = structuredClone(transaction);

    const wallet = await getWalletMethods(Chain.Tron);

    await expect(wallet.signTransaction(transaction)).rejects.toThrow("different transaction");
    expect(transaction).toEqual(original);
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

describe("connectOnekeyWallet", () => {
  const SOLANA_ADDRESS = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
  const solana = { connect: () => Promise.resolve({ publicKey: { toString: () => SOLANA_ADDRESS } }) };

  function connect(chains: Chain[]) {
    const added = [];
    const result = onekeyWallet.connectOnekeyWallet.connectWallet({ addChain: (wallet) => added.push(wallet) })(chains);
    return { added, result };
  }

  test("stops asking for more chains once the user rejects one", async () => {
    const rejection = Object.assign(new Error("User rejected the request."), { code: 4001 });
    let stellarRequested = false;
    globalThis.window = {
      $onekey: {
        solana: { connect: () => Promise.reject(rejection) },
        stellar: {
          getAddress: () => {
            stellarRequested = true;
            return Promise.resolve({ address: Keypair.random().publicKey() });
          },
        },
      },
    };

    await expect(connect([Chain.Solana, Chain.Stellar]).result).rejects.toBe(rejection);
    expect(stellarRequested).toBe(false);
  });

  test("stops asking for more chains once the user rejects the EVM approval", async () => {
    let stellarRequested = false;
    globalThis.window = {
      $onekey: {
        ethereum: {
          request: ({ method }) =>
            method === "eth_requestAccounts"
              ? Promise.reject(Object.assign(new Error("User rejected the request."), { code: 4001 }))
              : Promise.resolve("0x1"),
        },
        stellar: {
          getAddress: () => {
            stellarRequested = true;
            return Promise.resolve({ address: Keypair.random().publicKey() });
          },
        },
      },
    };

    await expect(connect([Chain.Ethereum, Chain.Stellar]).result).rejects.toMatchObject({ code: "ACTION_REJECTED" });
    expect(stellarRequested).toBe(false);
  });

  test("skips TRON when OneKey refuses for a reason other than a rejection", async () => {
    globalThis.window = {
      $onekey: {
        solana,
        tron: {
          request: ({ method }) =>
            Promise.resolve(method === "tron_accounts" ? [] : { code: 4001, message: "in the request queue" }),
        },
      },
    };
    const { added, result } = connect([Chain.Tron, Chain.Solana]);

    expect(await result).toBe(true);
    expect(added.map(({ chain }) => chain)).toEqual([Chain.Solana]);
  });

  test("skips a chain OneKey refuses to connect and keeps the rest", async () => {
    const freshAddressError = Object.assign(new Error("Connection requires single address mode."), { code: -99999 });
    globalThis.window = { $onekey: { btc: { requestAccounts: () => Promise.reject(freshAddressError) }, solana } };
    const { added, result } = connect([Chain.Bitcoin, Chain.Solana]);

    expect(await result).toBe(true);
    expect(added.map(({ chain }) => chain)).toEqual([Chain.Solana]);
  });

  test("does not treat a TON Connect manifest error as a user rejection", async () => {
    SKConfig.set({ integrations: { tonConnect: { manifestUrl: "https://app.example/manifest.json" } } });
    globalThis.window = {
      $onekey: {
        solana,
        tonconnect: {
          connect: () =>
            Promise.resolve({ event: "connect_error", payload: { code: 3, message: "App manifest content error" } }),
          restoreConnection: () => Promise.reject(new Error("No session")),
        },
      },
    };
    const { added, result } = connect([Chain.Ton, Chain.Solana]);

    try {
      expect(await result).toBe(true);
      expect(added.map(({ chain }) => chain)).toEqual([Chain.Solana]);
    } finally {
      SKConfig.set({ integrations: { tonConnect: undefined } });
    }
  });
});
