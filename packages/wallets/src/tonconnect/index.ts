import { Chain, filterSupportedChains, type WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import { getWalletForChain } from "./helpers";
import { TON_CONNECT } from "./option";
import type { TonConnectConfig } from "./types";
import { connectTonConnect, getTonConnectInstance } from "./walletMethods";

export const tonconnectWallet = createWallet({
  connect: ({ addChain, supportedChains: walletSupportedChains, walletType }) =>
    async function connectTonConnectWallet(chains: Chain[], config: TonConnectConfig = {}) {
      const supportedChains = filterSupportedChains({ chains, supportedChains: walletSupportedChains, walletType });

      const tonConnectUI = await getTonConnectInstance(config);
      const address = await connectTonConnect(tonConnectUI);

      const promises = supportedChains.map(async (chain) => {
        const walletMethods = await getWalletForChain({ address, chain, config, tonConnectUI });

        addChain({
          ...walletMethods,
          address,
          balance: [],
          chain,
          disconnect: () => tonConnectUI.disconnect(),
          walletType: TON_CONNECT,
        });
      });

      await Promise.all(promises);
      return true;
    },
  directSigningSupport: { [Chain.Ton]: true },
  name: "connectTonConnect",
  supportedChains: [Chain.Ton],
  // createWallet constrains walletType to the WalletOption enum, which has no
  // TON_CONNECT member until the registry lands upstream (swapkit/sdk#346) —
  // the one sanctioned widening; runtime value is the same literal either way.
  walletType: TON_CONNECT as unknown as WalletOption,
});

export const TON_CONNECT_SUPPORTED_CHAINS = getWalletSupportedChains(tonconnectWallet);
export type TonConnectSupportedChain = (typeof TON_CONNECT_SUPPORTED_CHAINS)[number];

export type { TonConnectConfig } from "./types";
