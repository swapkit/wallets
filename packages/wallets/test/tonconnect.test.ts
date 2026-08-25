import { describe, expect, it } from "bun:test";
import { SwapKitError, WalletOption } from "@swapkit/helpers";
import { Address, beginCell } from "@ton/core";
import type { TonConnectUI } from "@tonconnect/ui";

import "../src/tonconnect/register";
import { sendTonConnectTransaction, toFriendlyDestination } from "../src/tonconnect/walletMethods";

const RAW_ADDRESS = "0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8";
const BOUNCEABLE = Address.parse(RAW_ADDRESS).toString({ bounceable: true, urlSafe: true });
const NON_BOUNCEABLE = Address.parse(RAW_ADDRESS).toString({ bounceable: false, urlSafe: true });
const VALID_BOC = beginCell().endCell().toBoc().toString("base64");

function makeFakeTonConnectUI(sentRequests: { address: string }[][]) {
  return {
    connected: true,
    sendTransaction: (request: { messages: { address: string }[] }) => {
      sentRequests.push(request.messages);
      return Promise.resolve({ boc: VALID_BOC });
    },
  } as unknown as TonConnectUI;
}

describe("WalletOption", () => {
  it("registers TON_CONNECT in the extensible WalletOption registry", () => {
    expect(WalletOption.TON_CONNECT).toBe("TON_CONNECT");
  });
});

describe("toFriendlyDestination", () => {
  it("converts raw-form destinations to the BOUNCEABLE friendly form (toolbox convention)", () => {
    const friendly = toFriendlyDestination(RAW_ADDRESS, Address);

    expect(friendly).toBe(BOUNCEABLE);
    expect(Address.parseFriendly(friendly).isBounceable).toBe(true);
  });

  it("keeps already-friendly addresses untouched, preserving the caller's bounce flag", () => {
    expect(toFriendlyDestination(NON_BOUNCEABLE, Address)).toBe(NON_BOUNCEABLE);
    expect(toFriendlyDestination(BOUNCEABLE, Address)).toBe(BOUNCEABLE);
  });
});

describe("sendTonConnectTransaction", () => {
  it("normalizes raw destinations to bounceable friendly form in the wallet request", async () => {
    const sent: { address: string }[][] = [];
    const hash = await sendTonConnectTransaction({
      tonConnectUI: makeFakeTonConnectUI(sent),
      transaction: { messages: [{ address: RAW_ADDRESS, amount: "1" }] },
    });

    expect(sent[0]?.[0]?.address).toBe(BOUNCEABLE);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects sweep sendMode on the object transaction shape", () => {
    expect(
      sendTonConnectTransaction({
        tonConnectUI: makeFakeTonConnectUI([]),
        transaction: { messages: [{ address: RAW_ADDRESS, amount: "1" }], sendMode: 128 },
      }),
    ).rejects.toBeInstanceOf(SwapKitError);
  });

  it("rejects sweep sendMode carried on the legacy bare-array shape", () => {
    expect(
      sendTonConnectTransaction({
        tonConnectUI: makeFakeTonConnectUI([]),
        transaction: [{ address: RAW_ADDRESS, amount: "1", sendMode: 128 }],
      }),
    ).rejects.toBeInstanceOf(SwapKitError);
  });

  it("rejects empty message lists", () => {
    expect(
      sendTonConnectTransaction({ tonConnectUI: makeFakeTonConnectUI([]), transaction: [] }),
    ).rejects.toBeInstanceOf(SwapKitError);
  });
});
