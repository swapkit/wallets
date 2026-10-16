import { Chain, filterSupportedChains, SwapKitError, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { ExtensionWallet } from "../walletTypes";
import { getWalletMethods } from "./helpers";

export const okxWallet: ExtensionWallet<"connectOkx"> = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectOkx(chains: Chain[]) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });

      const missingChains: unknown[] = [];

      // OKX Wallet shows one approval at a time and rejects requests made while one is open
      for (const chain of filteredChains) {
        try {
          const walletMethods = await getWalletMethods(chain);
          addChain({ ...walletMethods, chain, walletType });
        } catch (error) {
          // OKX Mobile does not expose every chain the extension does, and TON needs a TON Connect manifest
          if (!isSkippableChain(error)) throw error;
          missingChains.push(error);
        }
      }

      if (missingChains.length > 0 && missingChains.length === filteredChains.length) throw missingChains[0];

      for (const error of missingChains) {
        console.warn("connectOkx: skipping a chain OKX Wallet cannot connect", error);
      }

      return true;
    },
  directSigningSupport: {
    [Chain.Arbitrum]: true,
    [Chain.Arc]: true,
    [Chain.Aurora]: true,
    [Chain.Avalanche]: true,
    [Chain.Base]: true,
    [Chain.Berachain]: true,
    [Chain.BinanceSmartChain]: true,
    [Chain.Bitcoin]: true,
    [Chain.Cardano]: true,
    [Chain.Cosmos]: true,
    [Chain.Ethereum]: true,
    [Chain.Gnosis]: true,
    [Chain.Hyperevm]: true,
    [Chain.Monad]: true,
    [Chain.Optimism]: true,
    [Chain.Polygon]: true,
    [Chain.Robinhood]: true,
    [Chain.Solana]: true,
    [Chain.Ton]: true,
    [Chain.Tron]: true,
    [Chain.XLayer]: true,
    // [Chain.Aptos]: blocked on toolbox
  },
  name: "connectOkx",
  supportedChains: [
    Chain.Arbitrum,
    Chain.Arc,
    Chain.Aurora,
    Chain.Avalanche,
    Chain.Base,
    Chain.Berachain,
    Chain.BinanceSmartChain,
    Chain.Bitcoin,
    Chain.Cardano,
    Chain.Cosmos,
    Chain.Ethereum,
    Chain.Gnosis,
    Chain.Hyperevm,
    Chain.Monad,
    // NEAR transfer is not yet supported in OKX Wallet
    // Chain.Near,
    Chain.Optimism,
    Chain.Polygon,
    Chain.Robinhood,
    Chain.Solana,
    Chain.XLayer,
    Chain.Ton,
    Chain.Tron,
  ],
  walletType: WalletOption.OKX,
});

export const OKX_SUPPORTED_CHAINS = getWalletSupportedChains(okxWallet);

function isSkippableChain(error: unknown) {
  return error instanceof SwapKitError && ["wallet_okx_not_found", "wallet_missing_params"].includes(error.errorKey);
}
