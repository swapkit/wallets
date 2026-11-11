import { Chain, EVMChains, filterSupportedChains, SwapKitError, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { ExtensionWallet } from "../walletTypes";
import { getWalletMethods } from "./helpers";

export const bitgetWallet: ExtensionWallet<"connectBitget"> = createWallet({
  connect: ({ addChain, walletType, supportedChains }) =>
    async function connectBitget(chains: Chain[]) {
      // EVM goes first: its approval waits for the user, and the site approval it grants covers the other chains
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType }).sort(
        (a, b) => Number(isEvmChain(b)) - Number(isEvmChain(a)),
      );

      const failedChains: unknown[] = [];

      // One chain at a time, so a cancelled approval stops the rest and a missing chain does not drop the others
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
    [Chain.Cosmos]: { direct: true },
    [Chain.Near]: { direct: true },
    [Chain.Ripple]: { direct: true },
    [Chain.Solana]: { direct: true },
    [Chain.Starknet]: { direct: true },
    [Chain.Sui]: { direct: true },
    [Chain.Ton]: { direct: true },
    [Chain.Tron]: { direct: true },
    // [Chain.Aptos]: blocked on toolbox — getAptosToolbox needs to accept AptosExtensionProvider
  },
  supportedChains: [
    ...EVMChains,
    Chain.Bitcoin,
    Chain.Cosmos,
    Chain.Near,
    Chain.Ripple,
    Chain.Solana,
    Chain.Starknet,
    Chain.Sui,
    Chain.Ton,
    Chain.Tron,
  ],
  walletType: WalletOption.BITGET,
});

export const BITGET_SUPPORTED_CHAINS = getWalletSupportedChains(bitgetWallet);

function isUserRejection(error: unknown) {
  if (error instanceof SwapKitError) return error.errorKey === "wallet_connection_rejected_by_user";

  // ethers wraps the EIP-1193 4001 rejection of the EVM provider as ACTION_REJECTED
  const code = (error as { code?: unknown } | null)?.code;
  return code === 4001 || code === "ACTION_REJECTED";
}

function isEvmChain(chain: Chain) {
  return (EVMChains as readonly Chain[]).includes(chain);
}
