import { describe, expect, test } from "bun:test";
import { Chain, EVMChains, WalletOption } from "@swapkit/helpers";
import type { ChainSigningSupport } from "@swapkit/wallet-core";
import { loadWallet } from "../src/utils";

async function getSigningSupport(option: WalletOption) {
  const wallet = await loadWallet(option);
  const [descriptor] = Object.values(wallet) as [{ signingSupport: ChainSigningSupport; supportedChains: Chain[] }];
  return descriptor;
}

// What `directSigningSupport` declared on develop, before it moved into `signingSupport`.
const DIRECT_SIGNING_ON_DEVELOP: Partial<Record<WalletOption, Chain[]>> = {
  [WalletOption.LEDGER]: [
    Chain.Arbitrum,
    Chain.Arc,
    Chain.Aurora,
    Chain.Avalanche,
    Chain.Base,
    Chain.Berachain,
    Chain.BinanceSmartChain,
    Chain.Ethereum,
    Chain.Gnosis,
    Chain.Monad,
    Chain.Bitcoin,
    Chain.BitcoinCash,
    Chain.Cardano,
    Chain.Cosmos,
    Chain.Dash,
    Chain.Dogecoin,
    Chain.Litecoin,
    Chain.Near,
    Chain.Optimism,
    Chain.Polygon,
    Chain.Ripple,
    Chain.Robinhood,
    Chain.Sui,
    Chain.THORChain,
    Chain.Ton,
    Chain.Tron,
    Chain.XLayer,
  ],
  [WalletOption.METAMASK]: [...EVMChains, Chain.Solana],
};

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

  test.each([
    WalletOption.METAMASK,
    WalletOption.LEDGER,
  ])("%s declares direct signing on the same chains as before", async (option) => {
    const { signingSupport } = await getSigningSupport(option);
    const directChains = (Object.keys(signingSupport) as Chain[]).filter((chain) => signingSupport[chain]?.direct);

    expect(directChains.sort()).toEqual([...(DIRECT_SIGNING_ON_DEVELOP[option] ?? [])].sort());
  });
});
