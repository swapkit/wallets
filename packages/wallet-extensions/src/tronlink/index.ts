import { Chain, filterSupportedChains, SwapKitError, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { ExtensionWallet } from "../walletTypes";
import { getEvmWalletForChain, getExpectedTronNetwork, getWalletForChain, setupEventListeners } from "./helpers.js";

export const tronlinkWallet: ExtensionWallet<"connectTronLink"> = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectTronLink(chains: Chain[]) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });

      if (filteredChains.length === 0) {
        throw new SwapKitError("wallet_chain_not_supported", { chain: chains.join(", "), wallet: walletType });
      }

      const evmChains = filteredChains.filter(
        (chain): chain is Chain.Ethereum | Chain.BinanceSmartChain => chain !== Chain.Tron,
      );

      for (const chain of evmChains) {
        const walletMethods = await getEvmWalletForChain(chain);
        addChain({ ...walletMethods, chain, walletType });
      }

      if (!filteredChains.includes(Chain.Tron)) return true;

      const expectedNetwork = getExpectedTronNetwork(false);

      const walletMethods = await getWalletForChain(Chain.Tron, expectedNetwork);

      const currentAddress = walletMethods.address;

      const cleanup = setupEventListeners(
        (newAddress) => {
          if (newAddress !== currentAddress) {
            window.location.reload();
          }
        },
        (newNetwork) => {
          if (!newNetwork.includes(expectedNetwork)) {
            window.location.reload();
          }
        },
      );

      const disconnect = () => {
        cleanup();
      };

      addChain({ ...walletMethods, balance: [], chain: Chain.Tron, disconnect, walletType });

      return true;
    },
  directSigningSupport: { [Chain.BinanceSmartChain]: true, [Chain.Ethereum]: true, [Chain.Tron]: true },
  name: "connectTronLink",
  supportedChains: [Chain.Tron, Chain.Ethereum, Chain.BinanceSmartChain],
  walletType: WalletOption.TRONLINK,
});

export const TRONLINK_SUPPORTED_CHAINS = getWalletSupportedChains(tronlinkWallet);

export * from "./helpers.js";
export * from "./types.js";
