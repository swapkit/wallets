// Registers WalletOption.TON_CONNECT before anything below reads it.
import "./register";

import { Chain, filterSupportedChains, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import { getWalletForChain } from "./helpers";
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
          walletType: WalletOption.TON_CONNECT,
        });
      });

      await Promise.all(promises);
      return true;
    },
  directSigningSupport: { [Chain.Ton]: true },
  name: "connectTonConnect",
  supportedChains: [Chain.Ton],
  walletType: WalletOption.TON_CONNECT,
});

export const TON_CONNECT_SUPPORTED_CHAINS = getWalletSupportedChains(tonconnectWallet);
export type TonConnectSupportedChain = (typeof TON_CONNECT_SUPPORTED_CHAINS)[number];

export type { TonConnectConfig } from "./types";
