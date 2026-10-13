// @ts-nocheck - Test file with intentional mocking of browser globals
import { afterEach, describe, expect, test } from "bun:test";
import { bech32, hex } from "@scure/base";
import { Chain } from "@swapkit/helpers";

import { okxWallet } from "../index";

// CIP-19 mainnet base address test vector
const CARDANO_ADDRESS =
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";

function mockCardano() {
  return {
    enable: async () => ({
      getChangeAddress: async () => hex.encode(bech32.fromWords(bech32.decode(CARDANO_ADDRESS, 120).words)),
      getNetworkId: async () => 1,
    }),
  };
}

afterEach(() => {
  globalThis.window = undefined;
});

describe("connectOkx", () => {
  function connect(chains: Chain[]) {
    const added = [];
    const connectOkx = okxWallet.connectOkx.connectWallet({ addChain: (wallet) => added.push(wallet) });

    return { added, result: connectOkx(chains) };
  }

  test("keeps the available chains when another chain is missing in the wallet", async () => {
    globalThis.window = { okxwallet: { cardano: mockCardano() } };
    const { added, result } = connect([Chain.Cardano, Chain.Starknet]);

    expect(await result).toBe(true);
    expect(added.map(({ chain }) => chain)).toEqual([Chain.Cardano]);
    expect(added[0].address).toBe(CARDANO_ADDRESS);
  });

  test("fails when no chain can be connected", async () => {
    globalThis.window = { okxwallet: {} };

    await expect(connect([Chain.Starknet]).result).rejects.toThrow();
  });
});
