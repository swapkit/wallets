import { Chain, EVMChains, filterSupportedChains, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { ExtensionWallet } from "../walletTypes";
import { getWalletMethods } from "./helpers";

export const bitgetWallet: ExtensionWallet<"connectBitget"> = createWallet({
  connect: ({ addChain, walletType, supportedChains }) =>
    async function connectBitget(chains: Chain[]) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });

      await Promise.all(
        filteredChains.map(async (chain) => {
          const walletMethods = await getWalletMethods(chain);

          addChain({ ...walletMethods, chain, walletType });
        }),
      );

      return true;
    },
  name: "connectBitget",
  signingSupport: {
    ...Object.fromEntries(EVMChains.map((chain) => [chain, { direct: true }])),
    ...Object.fromEntries(
      [
        Chain.Arbitrum,
        Chain.Aurora,
        Chain.Avalanche,
        Chain.Base,
        Chain.Berachain,
        Chain.BinanceSmartChain,
        Chain.Ethereum,
        Chain.Gnosis,
        Chain.Monad,
        Chain.Optimism,
        Chain.Polygon,
        Chain.XLayer,
      ].map((chain) => [chain, { direct: true, typedData: true }]),
    ),
    [Chain.Bitcoin]: { direct: true },
    [Chain.Cosmos]: { direct: true },
    [Chain.Solana]: { direct: true },
    [Chain.Tron]: { direct: true },
    // [Chain.Aptos]: blocked on toolbox — getAptosToolbox needs to accept AptosExtensionProvider
  },
  supportedChains: [...EVMChains, Chain.Cosmos, Chain.Bitcoin, Chain.Solana, Chain.Tron],
  walletType: WalletOption.BITGET,
});

export const BITGET_SUPPORTED_CHAINS = getWalletSupportedChains(bitgetWallet);
