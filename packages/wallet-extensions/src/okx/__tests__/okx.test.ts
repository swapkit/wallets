// @ts-nocheck - Test file with intentional mocking of browser globals
import { afterEach, describe, expect, mock, test } from "bun:test";
import { bech32, hex } from "@scure/base";
import { Chain } from "@swapkit/helpers";

import { getWalletMethods } from "../helpers";
import { okxWallet } from "../index";

const SUI_ADDRESS = `0x${"7".repeat(64)}`;
const suiRequests = [];
const suiWallet = {
  chains: ["sui:mainnet"],
  features: {
    "standard:connect": { connect: async () => ({ accounts: [{ address: SUI_ADDRESS, chains: ["sui:mainnet"] }] }) },
    "sui:signTransaction": {
      signTransaction: async (input) => {
        suiRequests.push({ ...input, transaction: await input.transaction.toJSON() });
        return { bytes: "c2lnbmVk", signature: "c2lnbmF0dXJl" };
      },
    },
  },
  name: "OKX Wallet",
};

mock.module("@wallet-standard/app", () => ({ getWallets: () => ({ get: () => [suiWallet] }) }));

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

  test("reads the Starknet account once the wallet has been enabled", async () => {
    const address = `0x${"1".repeat(64)}`;
    const starknet = {
      enable() {
        this.account = { address };
        return Promise.resolve([address]);
      },
    };
    globalThis.window = { okxwallet: { starknet } };
    const { added, result } = connect([Chain.Starknet]);

    expect(await result).toBe(true);
    expect(added[0].address).toBe(address);
  });

  test("fails when the user rejects a chain even if another one connects", async () => {
    const rejection = new Error("User rejected the request");
    globalThis.window = {
      okxwallet: { cardano: mockCardano(), starknet: { enable: () => Promise.reject(rejection) } },
    };

    await expect(connect([Chain.Cardano, Chain.Starknet]).result).rejects.toBe(rejection);
  });

  test("asks the wallet for one chain at a time", async () => {
    let pending = 0;
    let maxPending = 0;
    const approve = async <T>(value: T) => {
      pending += 1;
      maxPending = Math.max(maxPending, pending);
      await Bun.sleep(1);
      pending -= 1;
      return value;
    };
    const address = `0x${"1".repeat(64)}`;
    globalThis.window = {
      okxwallet: {
        cardano: { enable: () => approve(mockCardano().enable()) },
        starknet: {
          enable() {
            this.account = { address };
            return approve([address]);
          },
        },
      },
    };

    await connect([Chain.Cardano, Chain.Starknet]).result;

    expect(maxPending).toBe(1);
  });
});

describe("OKX Sui", () => {
  test("asks the wallet standard account to sign the exact transaction bytes", async () => {
    const wallet = await getWalletMethods(Chain.Sui);
    const signed = await wallet.signTransaction(Uint8Array.from([1, 2, 3]));

    expect(wallet.address).toBe(SUI_ADDRESS);
    expect(suiRequests).toEqual([
      { account: { address: SUI_ADDRESS, chains: ["sui:mainnet"] }, chain: "sui:mainnet", transaction: "AQID" },
    ]);
    expect(signed).toEqual({ bytes: "c2lnbmVk", signature: "c2lnbmF0dXJl" });
  });
});
