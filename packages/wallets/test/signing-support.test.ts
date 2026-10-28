import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type AddChainType, Chain, EVMChains, UTXOScriptType, WalletOption } from "@swapkit/helpers";
import type { ChainSigningSupport, DirectSigningSupport } from "@swapkit/wallet-core";
import { keystoreWallet } from "../src/keystore";
import { loadWallet } from "../src/utils";

async function getSigningSupport(option: WalletOption) {
  const wallet = await loadWallet(option);
  const [descriptor] = Object.values(wallet) as [
    { directSigningSupport: DirectSigningSupport; signingSupport: ChainSigningSupport; supportedChains: Chain[] },
  ];
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
    Chain.Stellar,
    Chain.Sui,
    Chain.THORChain,
    Chain.Ton,
    Chain.Tron,
    Chain.XLayer,
  ],
  [WalletOption.METAMASK]: [...EVMChains, Chain.Solana],
};

describe("wallet signing support", () => {
  // Other test files leave a stub `window` on globalThis. With one present, @passkeys/core (re-exported by the
  // passkeys connector) builds a DOMParser at import time, which Bun does not provide, so load connectors without it.
  const leakedWindow = globalThis.window;
  beforeAll(() => {
    Reflect.deleteProperty(globalThis, "window");
  });
  afterAll(() => {
    if (leakedWindow !== undefined) globalThis.window = leakedWindow;
  });

  test("no connector other than the keystore declares Bitcoin message signing", async () => {
    for (const option of Object.values(WalletOption).filter((option) => option !== WalletOption.KEYSTORE)) {
      const { signingSupport } = await getSigningSupport(option);
      for (const support of Object.values(signingSupport)) expect(support?.btcMessage).toBeUndefined();
    }
  });

  test("the keystore declares Bitcoin message signing on Bitcoin only", async () => {
    const added: Parameters<AddChainType>[0][] = [];
    await keystoreWallet.connectKeystore.connectWallet({ addChain: (wallet) => added.push(wallet) })(
      [Chain.Bitcoin, Chain.Litecoin],
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    );

    expect(added.find((wallet) => wallet.chain === Chain.Bitcoin)?.signing?.btcMessage).toBe(true);
    expect(added.find((wallet) => wallet.chain === Chain.Litecoin)?.signing?.btcMessage).toBeUndefined();
  });

  test("a keystore on a Taproot Bitcoin derivation does not declare Bitcoin message signing", async () => {
    const added: Parameters<AddChainType>[0][] = [];
    await keystoreWallet.connectKeystore.connectWallet({ addChain: (wallet) => added.push(wallet) })(
      [Chain.Bitcoin],
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      { [Chain.Bitcoin]: { derivationPath: [86, 0, 0, 0, 0], scriptType: UTXOScriptType.P2TR } },
    );

    const bitcoin = added.find((wallet) => wallet.chain === Chain.Bitcoin);
    expect(bitcoin?.signing?.btcMessage).not.toBe(true);
    expect(bitcoin?.signing?.direct).toBe(true);
  });

  test("the legacy directSigningSupport alias mirrors signingSupport direct", async () => {
    for (const option of Object.values(WalletOption)) {
      const { directSigningSupport, signingSupport } = await getSigningSupport(option);
      const directChains = (Object.keys(signingSupport) as Chain[]).filter(
        (chain) => signingSupport[chain]?.direct === true,
      );

      expect(Object.keys(directSigningSupport).sort()).toEqual(directChains.sort());
      for (const [chain, direct] of Object.entries(directSigningSupport) as [Chain, boolean | undefined][]) {
        expect(direct).toBe(true);
        expect(signingSupport[chain]?.direct).toBe(true);
      }
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
