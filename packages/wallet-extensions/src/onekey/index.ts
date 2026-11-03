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

      const failedChains: unknown[] = [];

      // OneKey queues every pending approval, so asking one chain at a time lets a cancel stop the rest
      for (const chain of filteredChains) {
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
        console.warn("connectOnekeyWallet: skipping a chain OneKey cannot connect", error);
      }

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
    [Chain.Ethereum]: { direct: true, typedData: true },
    [Chain.Gnosis]: { direct: true, typedData: true },
    [Chain.Near]: { direct: true },
    [Chain.Optimism]: { direct: true, typedData: true },
    [Chain.Polygon]: { direct: true, typedData: true },
    [Chain.Solana]: { direct: true },
    [Chain.Stellar]: { direct: true },
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
    Chain.Ethereum,
    Chain.Gnosis,
    Chain.Near,
    Chain.Optimism,
    Chain.Polygon,
    Chain.Solana,
    Chain.Stellar,
    Chain.Ton,
    Chain.Tron,
    Chain.XLayer,
  ],
  walletType: WalletOption.ONEKEY,
});

export const ONEKEY_WALLET_SUPPORTED_CHAINS = getWalletSupportedChains(onekeyWallet);

// TON Connect reports a rejected approval as 300 and manifest problems with other codes
const TON_CONNECT_USER_REJECTS_ERROR = 300;

function isUserRejection(error: unknown) {
  if (error instanceof SwapKitError) {
    const code = error.info?.code;
    return (
      error.errorKey === "wallet_connection_rejected_by_user" &&
      (code === undefined || code === TON_CONNECT_USER_REJECTS_ERROR)
    );
  }

  return (error as { code?: unknown } | null)?.code === 4001;
}
