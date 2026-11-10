// @ts-nocheck - Test file with intentional mocking of browser globals
import { afterEach, describe, expect, test } from "bun:test";
import { bech32, hex } from "@scure/base";
import { Chain, WalletOption } from "@swapkit/helpers";
import { decodeCardanoTransaction } from "@swapkit/toolboxes/cardano";

import { cardanoWallet, getCardanoWallets } from "../index";

// CIP-19 mainnet base address test vectors
const USED_ADDRESS =
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";
const OTHER_ADDRESS = "addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8";

const UNSIGNED_TX =
  "84a500828258203b40265111d8bb3c3c608d95b3a0bf83461ace32d79336579a1939b3aad1c0b700825820fa6f0b48a3a1d4c7ee6d1b9e16c2d8a1d7d4b6a8b2a35e1f6c2b9d0e4f1a2b3c010182a2005839015b1ac02842acd257d33ab3e3142d6e980fe9aaccd06d864a7cb77e614faf8806d4d3bfb9ae5241aade08a6c6162c1bd5689899ddff9eb503011a005b8d80a2005839019493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c4725101821a001bdba3a1581c29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6a1434d494e182a021a0002a8dd031a0a037a00075820b5876c72e8bea78ff57e82306a5c1b83eb86f52a127bd81087b9821e70fd3ef8a0f5d90103a100a11902a2a1636d73678167737761706b6974";
const PUBLIC_KEY = "11".repeat(32);
const SIGNATURE = "22".repeat(64);
const WITNESS_SET = `a10081825820${PUBLIC_KEY}5840${SIGNATURE}`;

function toHex(address: string) {
  return hex.encode(bech32.fromWords(bech32.decode(address, 120).words));
}

function mockProvider(api = {}) {
  return {
    apiVersion: "1",
    enable: async () => ({
      getChangeAddress: async () => toHex(OTHER_ADDRESS),
      getNetworkId: async () => 1,
      getUnusedAddresses: async () => [],
      getUsedAddresses: async () => [toHex(USED_ADDRESS)],
      ...api,
    }),
    icon: "data:image/svg+xml;base64,AA==",
    isEnabled: async () => false,
    name: "Lace",
  };
}

async function connect(walletKey = "lace") {
  const added = [];
  const connectCardano = cardanoWallet.connectCardano.connectWallet({ addChain: (wallet) => added.push(wallet) });
  await connectCardano([Chain.Cardano], walletKey);

  return added[0];
}

afterEach(() => {
  globalThis.window = undefined;
});

describe("CIP-30 Cardano wallets", () => {
  test("registers CIP30 in the extensible WalletOption registry", () => {
    expect(WalletOption.CIP30).toBe("CIP30");
  });

  test("lists only the CIP-30 wallets injected in the page", () => {
    globalThis.window = { cardano: { lace: mockProvider(), typhon: { isEnabled: async () => true }, version: "1" } };

    expect(getCardanoWallets()).toEqual([
      { apiVersion: "1", icon: "data:image/svg+xml;base64,AA==", key: "lace", name: "Lace" },
    ]);
  });

  test("connects with the first used address instead of the change address", async () => {
    globalThis.window = { cardano: { lace: mockProvider() } };
    const wallet = await connect();

    expect(wallet.address).toBe(USED_ADDRESS);
    expect(wallet.chain).toBe(Chain.Cardano);
    expect(wallet.walletType).toBe("CIP30");
  });

  test("falls back to the change address for a wallet without any address yet", async () => {
    globalThis.window = { cardano: { lace: mockProvider({ getUsedAddresses: async () => [] }) } };

    expect((await connect()).address).toBe(OTHER_ADDRESS);
  });

  test("refuses a wallet that is not on mainnet", async () => {
    globalThis.window = { cardano: { lace: mockProvider({ getNetworkId: async () => 0 }) } };

    await expect(connect()).rejects.toThrow("wallet_cip30_network_not_supported");
  });

  test("fails when the requested wallet is not injected", async () => {
    globalThis.window = { cardano: { lace: mockProvider() } };

    await expect(connect("eternl")).rejects.toThrow("wallet_cip30_not_found");
  });

  test("reports a refused connection as rejected by the user", async () => {
    const provider = { ...mockProvider(), enable: () => Promise.reject({ code: -3, info: "Refused" }) };
    globalThis.window = { cardano: { lace: provider } };

    await expect(connect()).rejects.toThrow("wallet_connection_rejected_by_user");
  });

  test("signs the transaction it receives and only adds the wallet signature", async () => {
    const requested = [];
    const signTx = (transaction) => {
      requested.push(transaction);
      return Promise.resolve(WITNESS_SET);
    };
    globalThis.window = { cardano: { lace: mockProvider({ signTx }) } };

    const signedTx = await (await connect()).signTransaction(UNSIGNED_TX);

    expect(requested).toEqual([UNSIGNED_TX]);
    expect(signedTx).toContain(`${PUBLIC_KEY}5840${SIGNATURE}`);
    expect((await decodeCardanoTransaction(signedTx)).bodyHash).toBe(
      (await decodeCardanoTransaction(UNSIGNED_TX)).bodyHash,
    );
  });
});
