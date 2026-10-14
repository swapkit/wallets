import { Chain, filterSupportedChains, SwapKitError, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { ExtensionWallet } from "../walletTypes";
import { getWalletMethods } from "./helpers";

export const okxWallet: ExtensionWallet<"connectOkx"> = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectOkx(chains: Chain[]) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });

      const results = await Promise.allSettled(
        filteredChains.map(async (chain) => {
          const walletMethods = await getWalletMethods(chain);
          addChain({ ...walletMethods, chain, walletType });
        }),
      );

      const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
      // OKX Mobile does not expose every chain the extension does, only those are skipped
      const realError = errors.find((error) => !isMissingChain(error));

      if (realError) throw realError;
      if (errors.length > 0 && errors.length === results.length) throw errors[0];

      for (const error of errors) {
        console.warn("connectOkx: skipping a chain OKX Wallet does not expose", error);
      }

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
    [Chain.Cardano]: true,
    [Chain.Cosmos]: true,
    [Chain.Ethereum]: true,
    [Chain.Gnosis]: true,
    [Chain.Monad]: true,
    [Chain.Optimism]: true,
    [Chain.Polygon]: true,
    [Chain.Solana]: true,
    [Chain.Starknet]: true,
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
    Chain.Cardano,
    Chain.Cosmos,
    Chain.Ethereum,
    Chain.Gnosis,
    Chain.Monad,
    // NEAR transfer is not yet supported in OKX Wallet
    // Chain.Near,
    Chain.Optimism,
    Chain.Polygon,
    Chain.Solana,
    Chain.Starknet,
    Chain.XLayer,
    Chain.Tron,
  ],
  walletType: WalletOption.OKX,
});

export const OKX_SUPPORTED_CHAINS = getWalletSupportedChains(okxWallet);

function isMissingChain(error: unknown) {
  return error instanceof SwapKitError && error.errorKey === "wallet_okx_not_found";
}
