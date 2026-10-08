// @ts-nocheck - Test file with intentional mocking of browser globals
import { afterEach, describe, expect, test } from "bun:test";
import { Decoder, Encoder } from "@stricahq/cbors";
import { Chain } from "@swapkit/helpers";

import { getWalletMethods } from "../helpers";
import { okxWallet } from "../index";

const CARDANO_ADDRESS_HEX = `01${"11".repeat(56)}`;
const walletWitness = [Buffer.alloc(32, 1), Buffer.alloc(64, 2)];

function mockCardano() {
  return {
    enable: async () => ({
      getChangeAddress: async () => CARDANO_ADDRESS_HEX,
      getNetworkId: async () => 1,
      signTx: async () => Encoder.encode(new Map([[0, [walletWitness]]])).toString("hex"),
    }),
  };
}

afterEach(() => {
  globalThis.window = undefined;
});

describe("OKX Cardano", () => {
  test("adds the wallet witness to the transaction and exposes a bech32 address", async () => {
    globalThis.window = { okxwallet: { cardano: mockCardano() } };

    const wallet = await getWalletMethods(Chain.Cardano);
    const unsignedTx = Encoder.encode([new Map([[2, 170000]]), new Map(), true, null]).toString("hex");
    const [, witnesses] = Decoder.decode(Buffer.from(await wallet.signTransaction(unsignedTx), "hex")).value;

    expect(wallet.address.startsWith("addr1")).toBe(true);
    expect(witnesses.get(0)).toEqual([walletWitness]);
  });
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
