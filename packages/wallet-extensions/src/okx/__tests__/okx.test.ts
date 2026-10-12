// @ts-nocheck - Test file with intentional mocking of browser globals
import { afterEach, describe, expect, test } from "bun:test";
import { Chain } from "@swapkit/helpers";

import { okxWallet } from "../index";

const CARDANO_ADDRESS_HEX = `01${"11".repeat(56)}`;

function mockCardano() {
  return { enable: async () => ({ getChangeAddress: async () => CARDANO_ADDRESS_HEX, getNetworkId: async () => 1 }) };
}

afterEach(() => {
  globalThis.window = undefined;
});

describe("connectOkx", () => {
  function connect(chains: Chain[]) {
    const added = [];
    const connectOkx = okxWallet.connectOkx.connectWallet({ addChain: (wallet) => added.push(wallet.chain) });

    return { added, result: connectOkx(chains) };
  }

  test("keeps the available chains when another chain is missing in the wallet", async () => {
    globalThis.window = { okxwallet: { cardano: mockCardano() } };
    const { added, result } = connect([Chain.Cardano, Chain.Starknet]);

    expect(await result).toBe(true);
    expect(added).toEqual([Chain.Cardano]);
  });

  test("fails when no chain can be connected", async () => {
    globalThis.window = { okxwallet: {} };

    await expect(connect([Chain.Starknet]).result).rejects.toThrow();
  });
});
