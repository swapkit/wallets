import { Chain, filterSupportedChains, SwapKitError, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { ExtensionWallet } from "../walletTypes";
import { getWalletMethods } from "./helpers";

export const onekeyWallet: ExtensionWallet<"connectOnekeyWallet"> = createWallet({
  connect: ({ addChain, walletType, supportedChains }) =>
    async function connectOnekeyWallet(chains: Chain[]) {
      if (!window.$onekey) {
        throw new SwapKitError({ errorKey: "wallet_onekey_not_found", info: { wallet: WalletOption.ONEKEY } });
      }

      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });

      await Promise.all(
        filteredChains.map(async (chain) => {
          const walletMethods = await getWalletMethods(chain);
          addChain({ ...walletMethods, chain, walletType });
        }),
      );

      return true;
    },
  name: "connectOnekeyWallet",
  signingSupport: {
    [Chain.Arbitrum]: { direct: true, typedData: true },
    [Chain.Aurora]: { direct: true, typedData: true },
    [Chain.Avalanche]: { direct: true, typedData: true },
    [Chain.Base]: { direct: true, typedData: true },
    [Chain.BinanceSmartChain]: { direct: true, typedData: true },
    [Chain.Bitcoin]: { direct: true },
    [Chain.Cardano]: { direct: true },
    [Chain.Ethereum]: { direct: true, typedData: true },
    [Chain.Gnosis]: { direct: true, typedData: true },
    [Chain.Near]: { direct: true },
    [Chain.Optimism]: { direct: true, typedData: true },
    [Chain.Polygon]: { direct: true, typedData: true },
    [Chain.Solana]: { direct: true },
    [Chain.Stellar]: { direct: true },
    [Chain.Sui]: { direct: true },
    [Chain.Ton]: { direct: true },
    [Chain.Tron]: { direct: true },
    [Chain.XLayer]: { direct: true, typedData: true },
  },
  supportedChains: [
    Chain.Arbitrum,
    Chain.Aurora,
    Chain.Avalanche,
    Chain.Base,
    Chain.BinanceSmartChain,
    Chain.Bitcoin,
    Chain.Cardano,
    Chain.Ethereum,
    Chain.Gnosis,
    Chain.Near,
    Chain.Optimism,
    Chain.Polygon,
    Chain.Solana,
    Chain.Stellar,
    Chain.Sui,
    Chain.Ton,
    Chain.Tron,
    Chain.XLayer,
  ],
  walletType: WalletOption.ONEKEY,
});

export const ONEKEY_WALLET_SUPPORTED_CHAINS = getWalletSupportedChains(onekeyWallet);
