// @ts-nocheck - Test file with intentional mocking of browser globals
import { afterEach, describe, expect, test } from "bun:test";
import { Decoder, Encoder } from "@stricahq/cbors";
import { Chain } from "@swapkit/helpers";
import { Address, beginCell } from "@ton/core";

import { getWalletMethods } from "../helpers";

const RAW_TON_ADDRESS = `0:${"ab".repeat(32)}`;
const CARDANO_ADDRESS_HEX = `01${"11".repeat(56)}`;

afterEach(() => {
  globalThis.window = undefined;
});

describe("OKX Cardano", () => {
  test("adds the wallet witness to the transaction and exposes a bech32 address", async () => {
    const walletWitness = [Buffer.alloc(32, 1), Buffer.alloc(64, 2)];
    globalThis.window = {
      okxwallet: {
        cardano: {
          enable: async () => ({
            getChangeAddress: async () => CARDANO_ADDRESS_HEX,
            getNetworkId: async () => 1,
            signTx: async () => Encoder.encode(new Map([[0, [walletWitness]]])).toString("hex"),
          }),
        },
      },
    };

    const wallet = await getWalletMethods(Chain.Cardano);
    const unsignedTx = Encoder.encode([new Map([[2, 170000]]), new Map(), true, null]).toString("hex");
    const [, witnesses] = Decoder.decode(Buffer.from(await wallet.signTransaction(unsignedTx), "hex")).value;

    expect(wallet.address.startsWith("addr1")).toBe(true);
    expect(witnesses.get(0)).toEqual([walletWitness]);
  });
});

describe("OKX TON", () => {
  function mockTonBridge(requests: unknown[]) {
    globalThis.window = {
      okxTonWallet: {
        tonconnect: {
          restoreConnection: async () => ({
            event: "connect",
            payload: { items: [{ address: RAW_TON_ADDRESS, name: "ton_addr", network: "-239" }] },
          }),
          send: (request) => {
            requests.push(JSON.parse(request.params[0]));
            return Promise.resolve({ id: request.id, result: beginCell().endCell().toBoc().toString("base64") });
          },
        },
      },
    };
  }

  test("sends friendly destinations and returns the message hash", async () => {
    const requests = [];
    mockTonBridge(requests);

    const wallet = await getWalletMethods(Chain.Ton);
    const hash = await wallet.signAndBroadcastTransaction([{ address: RAW_TON_ADDRESS, amount: "1000" }]);

    expect(wallet.address).toBe(Address.parse(RAW_TON_ADDRESS).toString({ bounceable: false, urlSafe: true }));
    expect(requests[0].messages[0].address).toBe(
      Address.parse(RAW_TON_ADDRESS).toString({ bounceable: true, urlSafe: true }),
    );
    expect(hash).toBe(beginCell().endCell().hash().toString("hex"));
  });

  test("rejects sweep transactions before reaching the wallet", async () => {
    const requests = [];
    mockTonBridge(requests);

    const wallet = await getWalletMethods(Chain.Ton);
    const sweep = { messages: [{ address: RAW_TON_ADDRESS, amount: "0" }], sendMode: 128 };

    await expect(wallet.signAndBroadcastTransaction(sweep)).rejects.toThrow();
    expect(requests).toHaveLength(0);
  });
});
