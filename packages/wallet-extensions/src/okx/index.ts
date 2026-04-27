import { Chain, filterSupportedChains, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { ExtensionWallet } from "../walletTypes";
import { getWalletMethods } from "./helpers";

export const okxWallet: ExtensionWallet<"connectOkx"> = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectOkx(chains: Chain[]) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });

      await Promise.all(
        filteredChains.map(async (chain) => {
          const walletMethods = await getWalletMethods(chain);
          addChain({ ...walletMethods, chain, walletType });
        }),
      );

      return true;
    },
  directSigningSupport: {
    [Chain.Arbitrum]: true,
    [Chain.Aurora]: true,
    [Chain.Avalanche]: true,
    [Chain.Base]: true,
    [Chain.Berachain]: true,
    [Chain.BinanceSmartChain]: true,
    [Chain.Bitcoin]: true,
    [Chain.Cosmos]: true,
    [Chain.Ethereum]: true,
    [Chain.Gnosis]: true,
    [Chain.Monad]: true,
    [Chain.Optimism]: true,
    [Chain.Polygon]: true,
    [Chain.Tron]: true,
    [Chain.XLayer]: true,
    // [Chain.Aptos]: blocked on toolbox
  },
  name: "connectOkx",
  supportedChains: [
    Chain.Arbitrum,
    Chain.Aurora,
    Chain.Avalanche,
    Chain.Base,
    Chain.Berachain,
    Chain.BinanceSmartChain,
    Chain.Bitcoin,
    Chain.Cosmos,
    Chain.Ethereum,
    Chain.Gnosis,
    Chain.Monad,
    // NEAR transfer is not yet supported in OKX Wallet
    // Chain.Near,
    Chain.Optimism,
    Chain.Polygon,
    Chain.XLayer,
    Chain.Tron,
  ],
  walletType: WalletOption.OKX,
});

export const OKX_SUPPORTED_CHAINS = getWalletSupportedChains(okxWallet);
