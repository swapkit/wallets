// @ts-nocheck - Test file with intentional mocking of browser globals
import { afterEach, describe, expect, mock, test } from "bun:test";
import { bech32, hex } from "@scure/base";
import { AssetValue, Chain } from "@swapkit/helpers";
import { Address, beginCell } from "@ton/core";

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

const RAW_TON_ADDRESS = `0:${"ab".repeat(32)}`;

// CIP-19 mainnet base address test vector
const CARDANO_ADDRESS =
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";

const SOLANA_ADDRESS = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

function mockSolanaConnect() {
  return Promise.resolve({ publicKey: { toString: () => SOLANA_ADDRESS } });
}

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
    const { added, result } = connect([Chain.Cardano, Chain.Solana]);

    expect(await result).toBe(true);
    expect(added.map(({ chain }) => chain)).toEqual([Chain.Cardano]);
    expect(added[0].address).toBe(CARDANO_ADDRESS);
  });

  test("fails when no chain can be connected", async () => {
    globalThis.window = { okxwallet: {} };

    await expect(connect([Chain.Solana]).result).rejects.toThrow();
  });

  test("fails when the user rejects a chain even if another one connects", async () => {
    const rejection = new Error("User rejected the request");
    globalThis.window = { okxwallet: { cardano: mockCardano(), solana: { connect: () => Promise.reject(rejection) } } };

    await expect(connect([Chain.Cardano, Chain.Solana]).result).rejects.toBe(rejection);
  });

  test("keeps the other chains when TON has no TON Connect manifest", async () => {
    globalThis.window = {
      okxTonWallet: { tonconnect: { restoreConnection: () => Promise.reject(new Error("No session")) } },
      okxwallet: { cardano: mockCardano() },
    };
    const { added, result } = connect([Chain.Ton, Chain.Cardano]);

    expect(await result).toBe(true);
    expect(added.map(({ chain }) => chain)).toEqual([Chain.Cardano]);
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
    globalThis.window = {
      okxwallet: {
        cardano: { enable: () => approve(mockCardano().enable()) },
        solana: { connect: () => approve(mockSolanaConnect()) },
      },
    };

    await connect([Chain.Cardano, Chain.Solana]).result;

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

  test("rejects a wallet that only returns non-mainnet accounts", async () => {
    const { connect } = suiWallet.features["standard:connect"];
    suiWallet.features["standard:connect"].connect = async () => ({
      accounts: [{ address: SUI_ADDRESS, chains: ["sui:testnet"] }],
    });

    await expect(getWalletMethods(Chain.Sui)).rejects.toThrow("wallet_okx_chain_not_supported");
    suiWallet.features["standard:connect"].connect = connect;
  });

  test("rejects a wallet without a Sui signing feature before connecting", async () => {
    const { "sui:signTransaction": signFeature, ...features } = suiWallet.features;
    let connected = false;
    suiWallet.features = { ...features, "standard:connect": { connect: async () => (connected = true) } };

    await expect(getWalletMethods(Chain.Sui)).rejects.toThrow("wallet_okx_chain_not_supported");
    expect(connected).toBe(false);
    suiWallet.features = { ...features, "sui:signTransaction": signFeature };
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
    expect(requests[0].messages).toEqual([
      { address: Address.parse(RAW_TON_ADDRESS).toString({ bounceable: true, urlSafe: true }), amount: "1000" },
    ]);
    expect(hash).toBe(beginCell().endCell().hash().toString("hex"));
  });

  test.each([0, 130])("rejects send mode %d before reaching the wallet", async (sendMode) => {
    const requests = [];
    mockTonBridge(requests);

    const wallet = await getWalletMethods(Chain.Ton);
    const transaction = { messages: [{ address: RAW_TON_ADDRESS, amount: "1000" }], sendMode };

    await expect(wallet.signAndBroadcastTransaction(transaction)).rejects.toThrow("core_swap_invalid_params");
    expect(requests).toHaveLength(0);
  });

  test("rejects a TON balance sweep before reaching the wallet", async () => {
    const requests = [];
    mockTonBridge(requests);

    const wallet = await getWalletMethods(Chain.Ton);
    const sweep = wallet.transfer({
      assetValue: AssetValue.from({ chain: Chain.Ton, value: "1" }),
      recipient: RAW_TON_ADDRESS,
      sweep: true,
    });

    await expect(sweep).rejects.toThrow("core_swap_invalid_params");
    expect(requests).toHaveLength(0);
  });
});
