import { Chain, ChainToChainId, filterSupportedChains, SKConfig, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";

import { getWalletMethods } from "./signer";

export const coinbaseWallet = createWallet({
  connect: ({ addChain, walletType, supportedChains }) =>
    async function connectCoinbaseWallet(chains: Chain[]) {
      const { createCoinbaseWalletSDK } = await import("@coinbase/wallet-sdk");

      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });

      const coinbaseConfig = SKConfig.get("integrations").coinbase || { appName: "Swapkit Playground" };

      const coinbaseSdk = createCoinbaseWalletSDK({
        ...coinbaseConfig,
        appChainIds: filteredChains.map((chain) => Number(ChainToChainId[chain])),
      });

      await Promise.all(
        filteredChains.map(async (chain) => {
          const walletMethods = await getWalletMethods({ chain, coinbaseSdk });

          addChain({ ...walletMethods, chain, walletType });
        }),
      );

      return true;
    },
  name: "connectCoinbaseWallet",
  signingSupport: {
    [Chain.Arbitrum]: { direct: true, typedData: true },
    [Chain.Arc]: { direct: true, typedData: true },
    [Chain.Avalanche]: { direct: true, typedData: true },
    [Chain.Base]: { direct: true, typedData: true },
    [Chain.BinanceSmartChain]: { direct: true, typedData: true },
    [Chain.Ethereum]: { direct: true, typedData: true },
    [Chain.Optimism]: { direct: true, typedData: true },
    [Chain.Polygon]: { direct: true, typedData: true },
    [Chain.XLayer]: { direct: true },
  },
  supportedChains: [
    Chain.Arbitrum,
    Chain.Arc,
    Chain.Avalanche,
    Chain.Base,
    Chain.BinanceSmartChain,
    Chain.Ethereum,
    Chain.Optimism,
    Chain.Polygon,
    Chain.XLayer,
  ],
  walletType: WalletOption.COINBASE_MOBILE,
});

export const COINBASE_SUPPORTED_CHAINS = getWalletSupportedChains(coinbaseWallet);
