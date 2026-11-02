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
  name: "connectOkx",
  signingSupport: {
    [Chain.Arbitrum]: { direct: true, typedData: true },
    [Chain.Arc]: { direct: true, typedData: true },
    [Chain.Aurora]: { direct: true, typedData: true },
    [Chain.Avalanche]: { direct: true, typedData: true },
    [Chain.Base]: { direct: true, typedData: true },
    [Chain.Berachain]: { direct: true, typedData: true },
    [Chain.BinanceSmartChain]: { direct: true, typedData: true },
    [Chain.Bitcoin]: { direct: true },
    [Chain.Cardano]: { direct: true },
    [Chain.Cosmos]: { direct: true },
    [Chain.Ethereum]: { direct: true, typedData: true },
    [Chain.Gnosis]: { direct: true, typedData: true },
    [Chain.Hyperevm]: { direct: true, typedData: true },
    [Chain.Monad]: { direct: true, typedData: true },
    [Chain.Optimism]: { direct: true, typedData: true },
    [Chain.Polygon]: { direct: true, typedData: true },
    [Chain.Robinhood]: { direct: true, typedData: true },
    [Chain.Solana]: { direct: true },
    [Chain.Starknet]: { direct: true },
    [Chain.Ton]: { direct: true },
    [Chain.Tron]: { direct: true },
    [Chain.XLayer]: { direct: true, typedData: true },
    // [Chain.Aptos]: blocked on toolbox
  },
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
    Chain.Starknet,
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
