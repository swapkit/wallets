import { describe, expect, test } from "bun:test";
import { Chain, EVMChains, WalletOption } from "@swapkit/helpers";
import type { ChainSigningSupport } from "@swapkit/wallet-core";
import { loadWallet } from "../src/utils";

async function getSigningSupport(option: WalletOption) {
  const wallet = await loadWallet(option);
  const [descriptor] = Object.values(wallet) as [{ signingSupport: ChainSigningSupport; supportedChains: Chain[] }];
  return descriptor;
}

describe("wallet signing support", () => {
  test("no connector declares Bitcoin message signing", async () => {
    for (const option of Object.values(WalletOption)) {
      const { signingSupport } = await getSigningSupport(option);
      for (const support of Object.values(signingSupport)) expect(support?.btcMessage).toBeUndefined();
    }
  });

  test("WalletConnect declares no typed data signing", async () => {
    const { signingSupport } = await getSigningSupport(WalletOption.WALLETCONNECT);
    expect(Object.values(signingSupport).some((support) => support?.typedData)).toBe(false);
  });

  test.each([
    WalletOption.METAMASK,
    WalletOption.LEDGER,
  ])("%s declares typed data on its EVM chains only", async (option) => {
    const { signingSupport, supportedChains } = await getSigningSupport(option);
    const evmChains = supportedChains.filter((chain) => (EVMChains as readonly Chain[]).includes(chain));

    expect(evmChains).toContain(Chain.Ethereum);
    for (const chain of supportedChains) {
      expect(signingSupport[chain]?.typedData).toBe(evmChains.includes(chain) ? true : undefined);
    }
  });
});
