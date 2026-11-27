import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { KeyPairSigner as LegacyKeyPairSigner } from "@near-js/signers";
import { Transaction as LegacyTransaction } from "@near-js/transactions";
import { Chain } from "@swapkit/helpers";
import { actions, createTransaction, KeyPair, KeyPairSigner, SignedTransaction, type Transaction } from "near-api-js";

// Wallet Selector's modal builds DOM nodes on import whenever `window` exists; load it the way a server would.
const originalWindow = globalThis.window;
globalThis.window = undefined as unknown as typeof globalThis.window;
const realSelectorCoreSnapshot = { ...(await import("@near-wallet-selector/core")) };

const keyPair = KeyPair.fromRandom("ed25519");
const legacySigner = LegacyKeyPairSigner.fromSecretKey(keyPair.toString());
const walletCalls: { method: string; transactions: unknown[] }[] = [];
let walletSignsAlone = true;

// Stands in for a Wallet Selector module: it only understands @near-js 2.x transactions, as Wallet Selector 10 does.
const selectorWallet = {
  getAccounts: () => Promise.resolve([{ accountId: "alice.near" }]),
  signAndSendTransactions: ({ transactions }: { transactions: unknown[] }) => {
    walletCalls.push({ method: "signAndSendTransactions", transactions });
    return Promise.resolve([{ transaction_outcome: { id: "selector-outcome-hash" } }]);
  },
  signOut: () => Promise.resolve(),
  signTransaction: (transaction: LegacyTransaction) => {
    walletCalls.push({ method: "signTransaction", transactions: [transaction] });
    if (!walletSignsAlone) return Promise.reject(new Error("Method not supported by Selector Wallet"));
    return legacySigner.signTransaction(transaction);
  },
};

mock.module("@near-wallet-selector/core", () => ({
  ...realSelectorCoreSnapshot,
  setupWalletSelector: () => Promise.resolve({ isSignedIn: () => true, wallet: () => Promise.resolve(selectorWallet) }),
}));

afterAll(() => {
  mock.module("@near-wallet-selector/core", () => realSelectorCoreSnapshot);
  globalThis.window = originalWindow;
});

async function connectNearWallet() {
  const { walletSelectorWallet } = await import("../src/near-wallet-selector");
  const added: Record<string, unknown>[] = [];

  await walletSelectorWallet.connectWalletSelector.connectWallet({
    addChain: (chainWallet) => added.push(chainWallet as Record<string, unknown>),
  })([Chain.Near]);

  return added[0] as {
    signAndBroadcastTransaction: (transaction: Transaction) => Promise<string>;
    signTransaction: (transaction: Transaction) => Promise<SignedTransaction>;
  };
}

function transferTransaction(action = actions.transfer(10n ** 24n)) {
  return createTransaction("alice.near", keyPair.getPublicKey(), "bob.near", 8n, [action], new Uint8Array(32).fill(4));
}

describe("NEAR Wallet Selector signer", () => {
  beforeEach(() => {
    walletCalls.length = 0;
    walletSignsAlone = true;
  });

  test("has a @near-js 2.x KeyPairSigner sign the toolbox transaction and returns the near-api-js 7 signed transaction", async () => {
    const wallet = await connectNearWallet();
    const transaction = transferTransaction();

    const signedTransaction = await wallet.signTransaction(transaction);
    const { signedTransaction: expected } = await new KeyPairSigner(keyPair).signTransaction(transaction);

    expect(walletCalls).toHaveLength(1);
    expect(walletCalls[0]?.transactions[0]).toBeInstanceOf(LegacyTransaction);
    expect((walletCalls[0]?.transactions[0] as LegacyTransaction).encode()).toEqual(transaction.encode());
    expect(signedTransaction).toBeInstanceOf(SignedTransaction);
    expect(signedTransaction.encode()).toEqual(expected.encode());
  });

  test("hands key actions to Wallet Selector with 2.x public keys it can read", async () => {
    const wallet = await connectNearWallet();
    const publicKey = keyPair.getPublicKey().toString();
    const transaction = createTransaction(
      "alice.near",
      keyPair.getPublicKey(),
      "alice.near",
      8n,
      [
        actions.addFunctionCallAccessKey(keyPair.getPublicKey(), "wrap.near", ["near_deposit"], 5n),
        actions.deleteKey(keyPair.getPublicKey()),
      ],
      new Uint8Array(32).fill(4),
    );

    await wallet.signTransaction(transaction);
    const bridged = walletCalls[0]?.transactions[0] as LegacyTransaction;

    expect(bridged.actions.map(realSelectorCoreSnapshot.najActionToInternal)).toEqual([
      {
        params: {
          accessKey: {
            nonce: 0,
            permission: { allowance: "5", methodNames: ["near_deposit"], receiverId: "wrap.near" },
          },
          publicKey,
        },
        type: "AddKey",
      },
      { params: { publicKey }, type: "DeleteKey" },
    ]);
  });

  test("falls back to sign-and-send with the same transaction in @near-js 2.x form", async () => {
    walletSignsAlone = false;
    const wallet = await connectNearWallet();
    const transaction = transferTransaction();

    const hash = await wallet.signAndBroadcastTransaction(transaction);
    const [, sendCall] = walletCalls;

    expect(hash).toBe("selector-outcome-hash");
    expect(walletCalls.map(({ method }) => method)).toEqual(["signTransaction", "signAndSendTransactions"]);
    expect(sendCall?.transactions).toHaveLength(1);
    expect(sendCall?.transactions[0]).toBeInstanceOf(LegacyTransaction);
    expect((sendCall?.transactions[0] as LegacyTransaction).encode()).toEqual(transaction.encode());
  });

  test("refuses a transaction the @near-js 2.x schema cannot carry instead of handing it to the wallet", async () => {
    const wallet = await connectNearWallet();
    const transaction = transferTransaction(actions.transferToGasKey(keyPair.getPublicKey(), 1n));

    await expect(wallet.signTransaction(transaction)).rejects.toMatchObject({
      errorKey: "wallet_near_method_not_supported",
      info: { wallet: "WALLET_SELECTOR" },
    });
    expect(walletCalls).toEqual([]);
  });
});
