import { Chain, EVMChains, filterSupportedChains, SwapKitError, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { ExtensionWallet } from "../walletTypes";
import { getWalletMethods } from "./helpers";

export const bitgetWallet: ExtensionWallet<"connectBitget"> = createWallet({
  connect: ({ addChain, walletType, supportedChains }) =>
    async function connectBitget(chains: Chain[]) {
      // EVM goes last: the chains asked right after its approval were refused as already pending
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType }).sort(
        (a, b) => Number(isEvmChain(a)) - Number(isEvmChain(b)),
      );

      const failedChains: unknown[] = [];
      pendingRetriesExhausted = false;

      // One chain at a time, so a cancelled approval stops the rest and a missing chain does not drop the others
      for (const [index, chain] of filteredChains.entries()) {
        // Bitget needs a moment between requests, except between EVM chains that share one account
        const previous = filteredChains[index - 1];
        if (previous && !(isEvmChain(previous) && isEvmChain(chain))) {
          await new Promise((resolve) => setTimeout(resolve, CHAIN_PAUSE_MS));
        }

        try {
          const walletMethods = await connectWhenIdle(chain);
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
    // Left out for now: Bitget refuses Cosmos and Starknet ("ChainIds not supported") and does not inject NEAR
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

function isUserRejection(error: unknown) {
  if (error instanceof SwapKitError) return error.errorKey === "wallet_connection_rejected_by_user";

  // ethers wraps the EIP-1193 4001 rejection of the EVM provider as ACTION_REJECTED
  const code = (error as { code?: unknown } | null)?.code;
  return code === 4001 || code === "ACTION_REJECTED";
}

function isEvmChain(chain: Chain) {
  return (EVMChains as readonly Chain[]).includes(chain);
}

const CHAIN_PAUSE_MS = 1000;
const PENDING_RETRY_MS = 300;
const PENDING_RETRIES = 10;
let pendingRetriesExhausted = false;

// Bitget refuses a request made right after an approval instead of queueing it, so it is asked again shortly after
async function connectWhenIdle(chain: Chain) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getWalletMethods(chain);
    } catch (error) {
      if (!isPendingApproval(error) || pendingRetriesExhausted) throw error;
      if (attempt >= PENDING_RETRIES) {
        pendingRetriesExhausted = true;
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, PENDING_RETRY_MS));
    }
  }
}

function isPendingApproval(error: unknown) {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  return code === -32002 || (typeof message === "string" && message.includes("already pending"));
}
