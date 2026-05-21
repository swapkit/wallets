import { afterEach, describe, expect, mock, test } from "bun:test";
import { Chain } from "@swapkit/helpers";
import { getNetworkForChain } from "@swapkit/toolboxes/utxo";
import { Transaction } from "@swapkit/utxo-signer";
import { extractTCLikeTransferIntent } from "../src/helpers/tclikeTransferIntent";
import { keepkeyBexWallet } from "../src/keepkey-bex";
import { vultisigWallet } from "../src/vultisig";

const thorDepositTx = {
  fee: { gas: "500000000" },
  memo: "=:ETH.ETH:0xabc",
  msgs: [
    {
      typeUrl: "/types.MsgDeposit",
      value: {
        coins: [{ amount: "123456789", asset: { chain: "THOR", symbol: "RUNE", synth: false, ticker: "RUNE" } }],
        memo: "=:ETH.ETH:0xabc",
        signer: "thor1sender",
      },
    },
  ],
};

const btcSender = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT";
const btcRecipient = "1dice8EMZmqKvrGE4Qc9bUFf9PX3xaYDp";
const cosmosSender = "cosmos1sender";
const cosmosRecipient = "cosmos1recipient";
const rippleSender = "rSender";
const rippleRecipient = "rRecipient";

function createBtcSwapTx() {
  const tx = new Transaction({ allowUnknownOutputs: true });
  const network = getNetworkForChain(Chain.Bitcoin);

  tx.addOutputAddress(btcRecipient, 12_345n, network);
  tx.addOutputAddress(btcSender, 67_890n, network);

  return tx;
}

describe("extractTCLikeTransferIntent", () => {
  afterEach(() => {
    // @ts-expect-error test cleanup
    delete globalThis.window;
  });

  test("converts THORChain deposit transactions into provider params", () => {
    const intent = extractTCLikeTransferIntent({ chain: Chain.THORChain, tx: thorDepositTx });

    expect(intent).toMatchObject({
      amount: { amount: 123456789, decimals: 8 },
      asset: { chain: "THOR", symbol: "RUNE", ticker: "RUNE" },
      from: "thor1sender",
      gasLimit: "500000000",
      memo: "=:ETH.ETH:0xabc",
      method: "deposit",
      recipient: "",
    });
  });

  test("converts base64 Maya deposit signer bytes to bech32", () => {
    const intent = extractTCLikeTransferIntent({
      chain: Chain.Maya,
      tx: {
        fee: { gas: "500000000" },
        memo: "=:BTC.BTC:bc1qrecipient",
        msgs: [
          {
            typeUrl: "/types.MsgDeposit",
            value: {
              coins: [{ amount: "1800000000", asset: { chain: "MAYA", symbol: "CACAO", ticker: "CACAO" } }],
              memo: "=:BTC.BTC:bc1qrecipient",
              signer: "nlf3C5LoXHB9Z3muFI3zB1i6lq8=",
            },
          },
        ],
      },
    });

    expect(intent.from).toBe("maya1netlwzujapw8qlt80xhpfr0nqavt494074s0ze");
    expect(intent.amount).toEqual({ amount: 1800000000, decimals: 8 });
    expect(intent.asset).toEqual({ chain: "MAYA", symbol: "CACAO", ticker: "CACAO" });
  });

  test("converts THORChain transfer transactions into provider params", () => {
    const intent = extractTCLikeTransferIntent({
      chain: Chain.THORChain,
      tx: {
        fee: { gas: "500000000" },
        memo: "memo",
        msgs: [
          {
            typeUrl: "/types.MsgSend",
            value: {
              amount: [{ amount: "200000000", denom: "rune" }],
              fromAddress: "thor1sender",
              toAddress: "thor1recipient",
            },
          },
        ],
      },
    });

    expect(intent).toMatchObject({
      amount: { amount: 200000000, decimals: 8 },
      asset: { chain: "THOR", symbol: "RUNE", ticker: "RUNE" },
      from: "thor1sender",
      gasLimit: "500000000",
      memo: "memo",
      method: "transfer",
      recipient: "thor1recipient",
    });
  });

  test("submits KeepKey BEX THORChain deposits through signAndBroadcastTransaction", async () => {
    const requests: unknown[] = [];

    // @ts-expect-error test window shim
    globalThis.window = {
      keepkey: {
        thorchain: {
          request: (request: unknown, cb?: (err: unknown, result: unknown) => void) => {
            requests.push(request);
            if (cb) {
              cb(null, "0xhash");
              return;
            }

            return Promise.resolve(["thor1sender"]);
          },
        },
      },
    };

    const addChain = mock(() => {});
    const connectKeepkeyBex = keepkeyBexWallet.connectKeepkeyBex.connectWallet({ addChain });

    await connectKeepkeyBex([Chain.THORChain]);

    const walletMethods = addChain.mock.calls[0]?.[0] as
      | { signAndBroadcastTransaction?: (tx: typeof thorDepositTx) => Promise<string> }
      | undefined;

    await expect(walletMethods?.signAndBroadcastTransaction?.(thorDepositTx)).resolves.toBe("0xhash");

    expect(requests).toEqual([
      { method: "request_accounts", params: [] },
      {
        method: "deposit",
        params: [
          {
            amount: { amount: 123456789, decimals: 8 },
            asset: { chain: "THOR", symbol: "RUNE", ticker: "RUNE" },
            from: "thor1sender",
            gasLimit: "500000000",
            memo: "=:ETH.ETH:0xabc",
            recipient: "",
          },
        ],
      },
    ]);
  });

  test("submits Vultisig THORChain deposits through signAndBroadcastTransaction", async () => {
    const requests: unknown[] = [];

    // @ts-expect-error test window shim
    globalThis.window = {
      vultisig: {
        thorchain: {
          request: (request: unknown, cb?: (err: unknown, result: unknown) => void) => {
            requests.push(request);
            if (cb) {
              cb(null, "0xhash");
              return;
            }

            return Promise.resolve(["thor1sender"]);
          },
        },
      },
    };

    const addChain = mock(() => {});
    const connectVultisig = vultisigWallet.connectVultisig.connectWallet({ addChain });

    await connectVultisig([Chain.THORChain]);

    const walletMethods = addChain.mock.calls[0]?.[0] as
      | { signAndBroadcastTransaction?: (tx: typeof thorDepositTx) => Promise<string> }
      | undefined;

    await expect(walletMethods?.signAndBroadcastTransaction?.(thorDepositTx)).resolves.toBe("0xhash");

    expect(requests).toEqual([
      { method: "request_accounts", params: [] },
      {
        method: "deposit_transaction",
        params: [
          {
            amount: { amount: 123456789, decimals: 8 },
            asset: { chain: "THOR", symbol: "RUNE", ticker: "RUNE" },
            data: "=:ETH.ETH:0xabc",
            from: "thor1sender",
            gasLimit: "500000000",
            to: "",
          },
        ],
      },
    ]);
  });

  test("submits Vultisig BTC transactions through signAndBroadcastTransaction", async () => {
    const requests: unknown[] = [];

    // @ts-expect-error test window shim
    globalThis.window = {
      vultisig: {
        bitcoin: {
          request: (request: unknown, cb?: (err: unknown, result: unknown) => void) => {
            requests.push(request);
            if (cb) {
              cb(null, "btcHash");
              return;
            }

            return Promise.resolve([btcSender]);
          },
        },
      },
    };

    const addChain = mock(() => {});
    const connectVultisig = vultisigWallet.connectVultisig.connectWallet({ addChain });

    await connectVultisig([Chain.Bitcoin]);

    const walletMethods = addChain.mock.calls[0]?.[0] as
      | { signAndBroadcastTransaction?: (tx: Transaction) => Promise<string> }
      | undefined;

    await expect(walletMethods?.signAndBroadcastTransaction?.(createBtcSwapTx())).resolves.toBe("btcHash");

    expect(requests).toEqual([
      { method: "request_accounts", params: [] },
      { method: "request_accounts", params: [] },
      {
        method: "send_transaction",
        params: [
          {
            amount: { amount: 12345, decimals: 8 },
            asset: { chain: "BTC", symbol: "BTC", ticker: "BTC" },
            data: "",
            from: btcSender,
            gasLimit: undefined,
            to: btcRecipient,
          },
        ],
      },
    ]);
  });

  test("submits Vultisig Cosmos transactions through signAndBroadcastTransaction", async () => {
    const requests: unknown[] = [];

    // @ts-expect-error test window shim
    globalThis.window = {
      vultisig: {
        cosmos: {
          request: (request: unknown, cb?: (err: unknown, result: unknown) => void) => {
            requests.push(request);
            const method = (request as { method?: string }).method;

            if (method === "get_accounts" || method === "request_accounts") return Promise.resolve([cosmosSender]);
            if (cb) {
              cb(null, "cosmosHash");
              return;
            }

            return Promise.resolve("cosmosHash");
          },
        },
      },
    };

    const addChain = mock(() => {});
    const connectVultisig = vultisigWallet.connectVultisig.connectWallet({ addChain });

    await connectVultisig([Chain.Cosmos]);

    const walletMethods = addChain.mock.calls[0]?.[0] as
      | { signAndBroadcastTransaction?: (tx: { memo: string; msgs: unknown[] }) => Promise<string> }
      | undefined;

    await expect(
      walletMethods?.signAndBroadcastTransaction?.({
        memo: "cosmosMemo",
        msgs: [
          {
            typeUrl: "/cosmos.bank.v1beta1.MsgSend",
            value: {
              amount: [{ amount: "123456", denom: "uatom" }],
              fromAddress: cosmosSender,
              toAddress: cosmosRecipient,
            },
          },
        ],
      }),
    ).resolves.toBe("cosmosHash");

    expect(requests).toEqual([
      { method: "wallet_switch_chain", params: [{ chainId: "cosmoshub-4" }] },
      { method: "get_accounts" },
      { method: "wallet_switch_chain", params: [{ chainId: "cosmoshub-4" }] },
      {
        method: "send_transaction",
        params: [{ data: "cosmosMemo", from: cosmosSender, to: cosmosRecipient, value: "123456" }],
      },
    ]);
  });

  test("submits Vultisig Ripple transactions through signAndBroadcastTransaction", async () => {
    const requests: unknown[] = [];

    // @ts-expect-error test window shim
    globalThis.window = {
      vultisig: {
        ripple: {
          request: (request: unknown) => {
            requests.push(request);
            const method = (request as { method?: string }).method;

            if (method === "request_accounts") return Promise.resolve([rippleSender]);
            return Promise.resolve("rippleHash");
          },
        },
      },
    };

    const addChain = mock(() => {});
    const connectVultisig = vultisigWallet.connectVultisig.connectWallet({ addChain });

    await connectVultisig([Chain.Ripple]);

    const walletMethods = addChain.mock.calls[0]?.[0] as
      | { signAndBroadcastTransaction?: (tx: { [key: string]: unknown }) => Promise<string> }
      | undefined;

    await expect(
      walletMethods?.signAndBroadcastTransaction?.({
        Account: rippleSender,
        Amount: "1000000",
        Destination: rippleRecipient,
        Memos: [{ Memo: { MemoData: Buffer.from("xrpMemo").toString("hex").toUpperCase() } }],
        TransactionType: "Payment",
      }),
    ).resolves.toBe("rippleHash");

    expect(requests).toEqual([
      { method: "request_accounts", params: [] },
      {
        method: "send_transaction",
        params: [{ data: "xrpMemo", from: rippleSender, to: rippleRecipient, value: "1000000" }],
      },
    ]);
  });

  test("marks KeepKey BEX and Vultisig direct signing as available", () => {
    expect(keepkeyBexWallet.connectKeepkeyBex.directSigningSupport[Chain.THORChain]).toBe(true);
    expect(keepkeyBexWallet.connectKeepkeyBex.directSigningSupport[Chain.Maya]).toBe(true);
    expect(vultisigWallet.connectVultisig.directSigningSupport[Chain.Bitcoin]).toBe(true);
    expect(vultisigWallet.connectVultisig.directSigningSupport[Chain.Cosmos]).toBe(true);
    expect(vultisigWallet.connectVultisig.directSigningSupport[Chain.Kujira]).toBe(true);
    expect(vultisigWallet.connectVultisig.directSigningSupport[Chain.Ripple]).toBe(true);
    expect(vultisigWallet.connectVultisig.directSigningSupport[Chain.THORChain]).toBe(true);
    expect(vultisigWallet.connectVultisig.directSigningSupport[Chain.Maya]).toBe(true);
  });
});
