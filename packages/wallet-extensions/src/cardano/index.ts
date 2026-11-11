import "./register";

import { Chain, SwapKitError, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import {
  CARDANO_MAINNET_NETWORK_ID,
  type Cip30Provider,
  getCip30PaymentAddress,
  getCip30Toolbox,
} from "../helpers/cip30";
import type { ExtensionWallet } from "../walletTypes";

export type CardanoWalletInfo = { apiVersion: string; icon: string; key: string; name: string };

const CIP30_REFUSED = -3;

function isCip30Provider(provider: unknown): provider is Cip30Provider {
  if (typeof provider !== "object" || provider === null) return false;
  const { apiVersion, enable, name } = provider as Partial<Cip30Provider>;

  return typeof enable === "function" && typeof apiVersion === "string" && typeof name === "string";
}

// CIP-30 has no announcement event: wallets only show up as keys of `window.cardano`, so read it when the list is needed
export function getCardanoWallets(): CardanoWalletInfo[] {
  if (typeof window === "undefined" || !window.cardano) return [];

  const injected = window.cardano;

  // Some wallets define their key as non-enumerable, so Object.entries would skip them
  return Object.getOwnPropertyNames(injected).flatMap((key) => {
    const provider = injected[key];

    return isCip30Provider(provider)
      ? [{ apiVersion: provider.apiVersion, icon: provider.icon, key, name: provider.name }]
      : [];
  });
}

function isRefused(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === CIP30_REFUSED;
}

export const cardanoWallet: ExtensionWallet<"connectCardano", Chain[], [chains: Chain[], walletKey: string]> =
  createWallet({
    connect: ({ addChain, walletType }) =>
      async function connectCardano(_chains: Chain[], walletKey: string) {
        const provider = typeof window === "undefined" ? undefined : window.cardano?.[walletKey];
        if (!isCip30Provider(provider)) throw new SwapKitError("wallet_cip30_not_found", { walletKey });

        const api = await provider.enable().catch((error: unknown) => {
          if (!isRefused(error)) throw error;
          throw new SwapKitError("wallet_connection_rejected_by_user", { chain: Chain.Cardano, wallet: walletKey });
        });

        if ((await api.getNetworkId()) !== CARDANO_MAINNET_NETWORK_ID) {
          throw new SwapKitError("wallet_cip30_network_not_supported", { message: "Mainnet only", walletKey });
        }

        const toolbox = await getCip30Toolbox(api, await getCip30PaymentAddress(api));

        addChain({
          ...toolbox,
          chain: Chain.Cardano,
          signMessage: () =>
            Promise.reject(
              new SwapKitError("core_wallet_sign_message_not_supported", { chain: Chain.Cardano, wallet: walletKey }),
            ),
          walletType,
        });

        return true;
      },
    name: "connectCardano",
    signingSupport: { [Chain.Cardano]: { direct: true } },
    supportedChains: [Chain.Cardano],
    walletType: WalletOption.CIP30,
  });

export const CARDANO_SUPPORTED_CHAINS = getWalletSupportedChains(cardanoWallet);
