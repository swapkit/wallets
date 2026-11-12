import { Chain, EVMChains, filterSupportedChains, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import { isUserRejection } from "../helpers/userRejection";
import type { ExtensionWallet } from "../walletTypes";
import { getWalletMethods, isEvmChain } from "./helpers";

export const bitgetWallet: ExtensionWallet<"connectBitget"> = createWallet({
  connect: ({ addChain, walletType, supportedChains }) =>
    async function connectBitget(chains: Chain[]) {
      // EVM goes last: the chains asked right after its approval were refused as already pending
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType }).sort(
        (a, b) => Number(isEvmChain(a)) - Number(isEvmChain(b)),
      );

      const failedChains: unknown[] = [];

      // One chain at a time, so a cancelled approval stops the rest and a missing chain does not drop the others
      for (const [index, chain] of filteredChains.entries()) {
        // With less than a second between requests Bitget mixes up its approval windows; EVM chains share one account
        const previous = filteredChains[index - 1];
        if (previous && !(isEvmChain(previous) && isEvmChain(chain))) {
          await new Promise((resolve) => setTimeout(resolve, CHAIN_PAUSE_MS));
        }

        try {
          const walletMethods = await getWalletMethods(chain);
          addChain({ ...walletMethods, chain, walletType });
        } catch (error) {
          if (isUserRejection(error)) throw error;
          failedChains.push(error);
        }
      }

      if (failedChains.length > 0 && failedChains.length === filteredChains.length) throw failedChains[0];

      for (const error of failedChains) {
        console.warn("connectBitget: skipping a chain Bitget cannot connect", error);
      }

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
    [Chain.Ripple]: { direct: true },
    [Chain.Solana]: { direct: true },
    [Chain.Sui]: { direct: true },
    [Chain.Ton]: { direct: true },
    [Chain.Tron]: { direct: true },
    // [Chain.Aptos]: blocked on toolbox — getAptosToolbox needs to accept AptosExtensionProvider
  },
  supportedChains: [...EVMChains, Chain.Bitcoin, Chain.Ripple, Chain.Solana, Chain.Sui, Chain.Ton, Chain.Tron],
  walletType: WalletOption.BITGET,
});

export const BITGET_SUPPORTED_CHAINS = getWalletSupportedChains(bitgetWallet);

const CHAIN_PAUSE_MS = 1000;
