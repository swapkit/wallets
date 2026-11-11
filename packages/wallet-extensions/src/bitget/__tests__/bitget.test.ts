// @ts-nocheck - Test file with intentional mocking of browser globals
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { actionCreators } from "@near-js/transactions";
import { base64 } from "@scure/base";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { Chain, SwapKitError } from "@swapkit/helpers";
import { encode } from "ripple-binary-codec";

import { getWalletMethods, toBitgetNearAction } from "../helpers";
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

describe("Bitget Tron connection", () => {
  function connectWithTronCode(code: number) {
    globalThis.window = {
      bitkeep: {
        suiWallet: suiProvider(),
        tronLink: { request: async () => ({ code, message: "" }) },
        tronWeb: { defaultAddress: {}, trx: {} },
      },
    };

    return connectBitget([Chain.Tron, Chain.Sui]);
  }

  test("skips Tron and connects the rest when the wallet fails without a cancellation", async () => {
    const { connected, result } = connectWithTronCode(4000);

    expect(await result).toBe(true);
    expect(connected).toEqual([Chain.Sui]);
  });

  test("stops when the user cancels the Tron approval", async () => {
    const { connected, result } = connectWithTronCode(4001);

    await expect(result).rejects.toThrow("wallet_connection_rejected_by_user");
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
  const keypair = Keypair.generate();

  function transfer(lamports: number) {
    const transaction = new Transaction({ blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1 });
    transaction.feePayer = keypair.publicKey;
    transaction.add(SystemProgram.transfer({ fromPubkey: keypair.publicKey, lamports, toPubkey: keypair.publicKey }));
    return transaction;
  }

  function mockSolana(signTransaction) {
    globalThis.window = {
      bitkeep: {
        solana: {
          connect: async () => ({ accounts: [{ address: keypair.publicKey.toBase58() }] }),
          publicKey: null,
          signTransaction,
        },
      },
    };
  }

  function signedBytes(transaction: Transaction) {
    transaction.sign(keypair);
    return Promise.resolve([{ signedTransaction: transaction.serialize() }]);
  }

  test("returns the requested transaction carrying the wallet signature", async () => {
    const transaction = transfer(1);
    mockSolana((requested) =>
      signedBytes(Transaction.from(requested.serialize({ requireAllSignatures: false, verifySignatures: false }))),
    );

    const wallet = await getWalletMethods(Chain.Solana);
    const signed = await wallet.signTransaction(transaction);

    expect(wallet.address).toBe(keypair.publicKey.toBase58());
    expect(signed).toBe(transaction);
    expect(signed.verifySignatures()).toBe(true);
  });

  test("rejects a signature over a different transaction", async () => {
    mockSolana(() => signedBytes(transfer(2)));

    const wallet = await getWalletMethods(Chain.Solana);

    await expect(wallet.signTransaction(transfer(1))).rejects.toThrow("core_transaction_failed");
  });
});

describe("Bitget Near actions", () => {
  test("turns transfers and contract calls into the JSON form Bitget expects", () => {
    const call = actionCreators.functionCall("ft_transfer", { amount: "5", receiver_id: "bob.near" }, 30n, 1n);

    expect(toBitgetNearAction(actionCreators.transfer(1000n))).toEqual({
      params: { deposit: "1000" },
      type: "Transfer",
    });
    expect(toBitgetNearAction(call)).toEqual({
      params: { args: { amount: "5", receiver_id: "bob.near" }, deposit: "1", gas: "30", methodName: "ft_transfer" },
      type: "FunctionCall",
    });
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
  const payment = {
    Account: XRP_ADDRESS,
    Amount: "1000000",
    Destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    DestinationTag: 123,
    Memos: [{ Memo: { MemoData: "74657374" } }],
    TransactionType: "Payment",
  };

  function mockXrp(alter = (transaction) => transaction) {
    const signature = { SigningPubKey: `02${"ab".repeat(32)}`, TxnSignature: "ABCDEF" };
    const filled = { Fee: "12", Flags: 0x80000000, LastLedgerSequence: 20, Sequence: 7 };
    const blobs: string[] = [];

    globalThis.window = {
      bitkeep: {
        xrp: {
          connect: async () => XRP_ADDRESS,
          signTransaction: (transaction) => {
            blobs.push(encode({ ...filled, ...alter(transaction), ...signature }));
            return Promise.resolve(blobs[0]);
          },
        },
      },
    };

    return blobs;
  }

  test("returns the blob Bitget signed when it only fills in fee and sequence", async () => {
    const blobs = mockXrp();

    const wallet = await getWalletMethods(Chain.Ripple);
    const signed = await wallet.signTransaction(payment);

    const hash = createHash("sha512")
      .update(Buffer.from(`54584E00${blobs[0]}`, "hex"))
      .digest("hex")
      .slice(0, 64)
      .toUpperCase();

    expect(signed).toEqual({ hash, tx_blob: blobs[0] });
  });

  test("rejects a memo changed in place and leaves the request untouched", async () => {
    mockXrp((transaction) => {
      transaction.Memos[0].Memo.MemoData = "00";
      return transaction;
    });
    const request = structuredClone(payment);

    const wallet = await getWalletMethods(Chain.Ripple);

    await expect(wallet.signTransaction(request)).rejects.toThrow("core_transaction_failed");
    expect(request).toEqual(payment);
  });

  test.each([
    ["drops the memo", ({ Memos, ...rest }) => rest],
    ["drops the destination tag", ({ DestinationTag, ...rest }) => rest],
    ["changes the amount", (transaction) => ({ ...transaction, Amount: "2000000" })],
    ["changes the destination", (transaction) => ({ ...transaction, Destination: XRP_ADDRESS })],
    ["adds a field", (transaction) => ({ ...transaction, SourceTag: 9 })],
    ["adds the partial payment flag", (transaction) => ({ ...transaction, Flags: 0x80020000 })],
  ])("rejects a blob where Bitget %s", async (_name, alter) => {
    mockXrp(alter);

    const wallet = await getWalletMethods(Chain.Ripple);

    await expect(wallet.signTransaction(payment)).rejects.toThrow("core_transaction_failed");
  });
});
