import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type Transport from "@ledgerhq/hw-transport";
import type { DerivationPathArray } from "@swapkit/helpers";
import * as realHelpers from "@swapkit/helpers";
import type { TONTransactionInput } from "@swapkit/toolboxes/ton";
import { Address, beginCell, type Cell, comment, internal, loadMessage, storeMessageRelaxed, toNano } from "@ton/core";
import * as realTonTon from "@ton/ton";
import type { TonPayloadFormat, TonTransport } from "@ton-community/ton-ledger";
import * as realTonLedger from "@ton-community/ton-ledger";

// mock.module replaces the whole export namespace process-wide; snapshot the real modules so afterAll can restore
// them for test files that run later.
const realHelpersSnapshot = { ...realHelpers };
const realTonLedgerSnapshot = { ...realTonLedger };
const realTonTonSnapshot = { ...realTonTon };

type SignTransactionRequest = Parameters<TonTransport["signTransaction"]>[1];

const PUBLIC_KEY = Buffer.alloc(32, 7);
const wallet = realTonTonSnapshot.WalletContractV4.create({ publicKey: PUBLIC_KEY, workchain: 0 });
const WALLET_ADDRESS = wallet.address.toString({ bounceable: false, urlSafe: true });
const RECIPIENT_RAW = "0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8";
const RECIPIENT_BOUNCEABLE = Address.parse(RECIPIENT_RAW).toString({ bounceable: true, urlSafe: true });
const RECIPIENT_NON_BOUNCEABLE = Address.parse(RECIPIENT_RAW).toString({ bounceable: false, urlSafe: true });
const JETTON_WALLET = Address.parse("0:1111111111111111111111111111111111111111111111111111111111111111");
const transport = {} as unknown as Transport;

const walletState = { deployed: true, seqno: 12 };
// Lets one test make the device sign a different destination than the one requested.
const deviceOverrides: { to?: Address } = {};
const addressRequests: Array<{ opts: unknown; path: number[] }> = [];
const signRequests: Array<{ path: number[]; signed: Cell; transaction: SignTransactionRequest }> = [];
const rpcEndpoints: string[] = [];

function encodePayload(payload: TonPayloadFormat | undefined) {
  if (!payload) return undefined;
  switch (payload.type) {
    case "unsafe":
      return payload.message;
    case "comment":
      return comment(payload.text);
    case "jetton-transfer":
      return beginCell()
        .storeUint(0x0f8a7ea5, 32)
        .storeUint(payload.queryId ?? 0n, 64)
        .storeCoins(payload.amount)
        .storeAddress(payload.destination)
        .storeAddress(payload.responseDestination)
        .storeMaybeRef(payload.customPayload)
        .storeCoins(payload.forwardAmount)
        .storeMaybeRef(payload.forwardPayload)
        .endCell();
    default:
      throw new Error(`Unexpected payload type ${payload.type}`);
  }
}

// The wallet v4 transfer body the library returns: signature, then the signing message with the order in a ref.
function buildSignedBody(transaction: SignTransactionRequest) {
  const order = internal({
    body: encodePayload(transaction.payload),
    bounce: transaction.bounce,
    init: transaction.stateInit,
    to: deviceOverrides.to ?? transaction.to,
    value: transaction.amount,
  });

  return beginCell()
    .storeBuffer(Buffer.alloc(64, 0xab))
    .storeUint(wallet.walletId, 32)
    .storeUint(transaction.timeout, 32)
    .storeUint(transaction.seqno, 32)
    .storeUint(0, 8)
    .storeUint(transaction.sendMode, 8)
    .storeRef(beginCell().store(storeMessageRelaxed(order)).endCell())
    .endCell();
}

mock.module("@swapkit/helpers", () => ({
  ...realHelpersSnapshot,
  getRPCUrl: () => Promise.resolve("https://ton.rpc.test"),
}));

mock.module("@ton-community/ton-ledger", () => ({
  ...realTonLedgerSnapshot,
  TonTransport: class MockTonTransport {
    getAddress(path: number[], opts: { bounceable?: boolean; testOnly?: boolean }) {
      addressRequests.push({ opts, path });
      return Promise.resolve({
        address: wallet.address.toString({ bounceable: opts.bounceable, testOnly: opts.testOnly }),
        publicKey: PUBLIC_KEY,
      });
    }

    signTransaction = (path: number[], transaction: SignTransactionRequest) => {
      const signed = buildSignedBody(transaction);
      signRequests.push({ path, signed, transaction });
      return Promise.resolve(signed);
    };
  },
}));

mock.module("@ton/ton", () => ({
  ...realTonTonSnapshot,
  TonClient: class MockTonClient {
    constructor({ endpoint }: { endpoint: string }) {
      rpcEndpoints.push(endpoint);
    }

    getContractState() {
      return Promise.resolve({ state: walletState.deployed ? "active" : "uninitialized" });
    }

    open() {
      return { getSeqno: () => Promise.resolve(walletState.seqno) };
    }
  },
}));

import { TONLedger } from "../src/ledger/clients/ton";

function jettonTransferPayload({ forwardPayload }: { forwardPayload?: Cell } = {}) {
  const builder = beginCell()
    .storeUint(0x0f8a7ea5, 32)
    .storeUint(0, 64)
    .storeCoins(123456n)
    .storeAddress(Address.parse(RECIPIENT_RAW))
    .storeAddress(wallet.address)
    .storeBit(0)
    .storeCoins(toNano("0.01"));
  return (forwardPayload ? builder.storeBit(1).storeRef(forwardPayload) : builder.storeBit(0)).endCell();
}

function toBase64(cell: Cell) {
  return cell.toBoc().toString("base64");
}

describe("ledger TON client", () => {
  beforeEach(() => {
    walletState.deployed = true;
    walletState.seqno = 12;
    deviceOverrides.to = undefined;
    addressRequests.length = 0;
    signRequests.length = 0;
    rpcEndpoints.length = 0;
  });

  it("derives the non-bounceable wallet v4 address from the six-level Ledger path", async () => {
    const client = await TONLedger(undefined, transport);
    const custom = await TONLedger({ derivationPath: [44, 607, 0, 0, 3], transport });

    expect(client.getAddress()).toBe(WALLET_ADDRESS);
    expect(client.getAddress()).toStartWith("UQ");
    expect(client.publicKey).toEqual(PUBLIC_KEY);
    expect(custom.getAddress()).toBe(WALLET_ADDRESS);
    expect(addressRequests).toEqual([
      { opts: { bounceable: false, chain: 0, testOnly: false, walletVersion: "v4" }, path: [44, 607, 0, 0, 0, 0] },
      { opts: { bounceable: false, chain: 0, testOnly: false, walletVersion: "v4" }, path: [44, 607, 0, 0, 3, 0] },
    ]);
  });

  it("rejects derivation paths that are not m/44'/607'/0'/0'/{account}'", async () => {
    const invalidPaths = [
      [44, 607, 0, 0, 0, 0],
      [44, 607, 1, 0, 0],
      [44, 607, 0, 255, 0],
      [44, 60, 0, 0, 0],
      [44, 607, 0, 0],
    ] as unknown as DerivationPathArray[];

    for (const derivationPath of invalidPaths) {
      await expect(TONLedger({ derivationPath, transport })).rejects.toMatchObject({
        errorKey: "wallet_ledger_derivation_path_error",
      });
    }
    expect(addressRequests).toEqual([]);
  });

  it("signs a TON transfer with a comment and wraps the device body in the external message", async () => {
    const client = await TONLedger(undefined, transport);
    const payload = comment("hello swapkit");
    const before = Math.floor(Date.now() / 1000);

    const externalMessage = await client.signTransaction({
      messages: [{ address: RECIPIENT_BOUNCEABLE, amount: "1500000000", payload: toBase64(payload) }],
      sendMode: 3,
    });

    expect(rpcEndpoints).toEqual(["https://ton.rpc.test"]);
    expect(signRequests).toHaveLength(1);
    const [{ path, signed, transaction }] = signRequests as [(typeof signRequests)[number]];
    expect(path).toEqual([44, 607, 0, 0, 0, 0]);
    expect(transaction.to.equals(Address.parse(RECIPIENT_RAW))).toBe(true);
    expect(transaction).toMatchObject({
      amount: 1500000000n,
      bounce: true,
      payload: { text: "hello swapkit", type: "comment" },
      sendMode: 3,
      seqno: 12,
      stateInit: undefined,
    });
    expect(transaction.timeout).toBeGreaterThanOrEqual(before + 300);
    expect(transaction.timeout).toBeLessThanOrEqual(before + 305);

    const message = loadMessage(externalMessage.beginParse());
    expect(message.info.type).toBe("external-in");
    expect(message.info.type === "external-in" && message.info.dest.equals(wallet.address)).toBe(true);
    expect(message.init).toBeNull();
    expect(message.body.hash().equals(signed.hash())).toBe(true);
  });

  it("takes the bounce flag from the destination and the send mode from the message when the transaction has none", async () => {
    const client = await TONLedger(undefined, transport);

    await client.signTransaction([{ address: RECIPIENT_NON_BOUNCEABLE, amount: "1", sendMode: 130 }]);
    await client.signTransaction([{ address: RECIPIENT_RAW, amount: "2" }]);
    await client.signTransaction({
      messages: [{ address: RECIPIENT_NON_BOUNCEABLE, amount: "3", sendMode: 128 }],
    } as unknown as TONTransactionInput);

    expect(
      signRequests.map(({ transaction }) => [transaction.bounce, transaction.sendMode, transaction.payload]),
    ).toEqual([
      [false, 130, undefined],
      [true, 3, undefined],
      [false, 128, undefined],
    ]);
  });

  it("forwards a jetton transfer payload to the device as a parsed jetton-transfer", async () => {
    const client = await TONLedger(undefined, transport);
    const forwardPayload = comment("memo");
    const payload = jettonTransferPayload({ forwardPayload });

    await client.signTransaction({
      messages: [{ address: JETTON_WALLET.toString(), amount: toNano("0.05").toString(), payload: toBase64(payload) }],
      sendMode: 3,
    });

    const [request] = signRequests;
    const devicePayload = request?.transaction.payload;
    expect(request?.transaction.to.equals(JETTON_WALLET)).toBe(true);
    expect(request?.transaction.amount).toBe(toNano("0.05"));
    expect(devicePayload?.type).toBe("jetton-transfer");
    if (devicePayload?.type !== "jetton-transfer") throw new Error("unreachable");
    expect(devicePayload.amount).toBe(123456n);
    expect(devicePayload.queryId).toBeNull();
    expect(devicePayload.customPayload).toBeNull();
    expect(devicePayload.forwardAmount).toBe(toNano("0.01"));
    expect(devicePayload.destination.equals(Address.parse(RECIPIENT_RAW))).toBe(true);
    expect(devicePayload.responseDestination.equals(wallet.address)).toBe(true);
    expect(devicePayload.forwardPayload?.hash().equals(forwardPayload.hash())).toBe(true);
  });

  it("passes a payload the app cannot display as the untouched unsafe cell", async () => {
    const client = await TONLedger(undefined, transport);
    const payload = beginCell().storeUint(0xdeadbeef, 32).storeUint(1, 8).endCell();

    await client.signTransaction([{ address: RECIPIENT_BOUNCEABLE, amount: "1", payload: toBase64(payload) }]);

    const devicePayload = signRequests[0]?.transaction.payload;
    expect(devicePayload?.type).toBe("unsafe");
    expect(devicePayload?.type === "unsafe" && devicePayload.message.hash().equals(payload.hash())).toBe(true);
  });

  it("deploys the wallet with the first transfer", async () => {
    walletState.deployed = false;
    const client = await TONLedger(undefined, transport);

    const externalMessage = await client.signTransaction([{ address: RECIPIENT_BOUNCEABLE, amount: "1" }]);

    expect(signRequests[0]?.transaction.seqno).toBe(0);
    const message = loadMessage(externalMessage.beginParse());
    expect(message.init?.code?.hash().equals(wallet.init.code.hash())).toBe(true);
    expect(message.init?.data?.hash().equals(wallet.init.data.hash())).toBe(true);
    expect(message.body.hash().equals(signRequests[0]?.signed.hash() as Buffer)).toBe(true);
  });

  it("rejects inputs the TON app cannot represent before calling the device", async () => {
    const client = await TONLedger(undefined, transport);
    const message = { address: RECIPIENT_BOUNCEABLE, amount: "1" };

    await expect(client.signTransaction({ messages: [message, message], sendMode: 3 })).rejects.toMatchObject({
      errorKey: "wallet_ledger_method_not_supported",
      info: { reason: "Ledger signs one TON message per transaction" },
    });
    await expect(
      client.signTransaction({ messages: [{ ...message, sendMode: 128 }], sendMode: 3 }),
    ).rejects.toMatchObject({ errorKey: "wallet_ledger_invalid_params", info: { messageSendMode: 128, sendMode: 3 } });
    await expect(client.signTransaction({ messages: [], sendMode: 3 })).rejects.toMatchObject({
      errorKey: "wallet_ledger_invalid_params",
    });
    await expect(client.signTransaction([{ ...message, amount: "1.5" }])).rejects.toMatchObject({
      errorKey: "wallet_ledger_invalid_params",
      info: { amount: "1.5" },
    });
    await expect(client.signTransaction([{ ...message, payload: "not a boc" }])).rejects.toMatchObject({
      errorKey: "wallet_ledger_invalid_params",
      info: { payload: "not a boc" },
    });
    await expect(client.signTransaction([{ ...message, stateInit: "not a boc" }])).rejects.toMatchObject({
      errorKey: "wallet_ledger_invalid_params",
      info: { stateInit: "not a boc" },
    });
    await expect(client.signTransaction([{ ...message, address: "not an address" }])).rejects.toMatchObject({
      errorKey: "wallet_ledger_invalid_params",
      info: { address: "not an address" },
    });
    await expect(client.signTransaction([{ ...message, sendMode: 256 }])).rejects.toMatchObject({
      errorKey: "wallet_ledger_invalid_params",
      info: { sendMode: 256 },
    });

    expect(signRequests).toEqual([]);
  });

  it("refuses to broadcast a signed body whose order differs from the request", async () => {
    deviceOverrides.to = JETTON_WALLET;
    const client = await TONLedger(undefined, transport);

    await expect(client.signTransaction([{ address: RECIPIENT_BOUNCEABLE, amount: "1" }])).rejects.toMatchObject({
      errorKey: "wallet_ledger_signing_error",
    });
    expect(signRequests).toHaveLength(1);
  });
});

afterAll(() => {
  mock.module("@swapkit/helpers", () => realHelpersSnapshot);
  mock.module("@ton-community/ton-ledger", () => realTonLedgerSnapshot);
  mock.module("@ton/ton", () => realTonTonSnapshot);
});
