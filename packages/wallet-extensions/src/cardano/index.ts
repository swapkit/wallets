import "./register";

import { Chain, SwapKitError, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import {
  CARDANO_MAINNET_NETWORK_ID,
  CIP30_REFUSED,
  type Cip30Provider,
  getCip30ErrorCode,
  getCip30PaymentAddress,
  getCip30Toolbox,
  toCip30SwapKitError,
} from "../helpers/cip30";
import type { ExtensionWallet } from "../walletTypes";

export type CardanoWalletInfo = { apiVersion: string; icon: string; key: string; name: string };

function isCip30Provider(provider: unknown): provider is Cip30Provider {
  if (typeof provider !== "object" || provider === null) return false;
  const { apiVersion, enable, name } = provider as Partial<Cip30Provider>;

  return typeof enable === "function" && typeof apiVersion === "string" && typeof name === "string";
}

export function getCardanoWallets(): CardanoWalletInfo[] {
  if (typeof window === "undefined" || !window.cardano) return [];

  return Object.entries(window.cardano).flatMap(([key, provider]) =>
    isCip30Provider(provider)
      ? [{ apiVersion: provider.apiVersion, icon: provider.icon, key, name: provider.name }]
      : [],
  );
}

export const cardanoWallet: ExtensionWallet<"connectCardano", Chain[], [chains: Chain[], walletKey: string]> =
  createWallet({
    connect: ({ addChain, walletType }) =>
      async function connectCardano(_chains: Chain[], walletKey: string) {
        const provider = typeof window === "undefined" ? undefined : window.cardano?.[walletKey];
        if (!isCip30Provider(provider)) throw new SwapKitError("wallet_cip30_not_found", { walletKey });

        const api = await provider.enable().catch((error: unknown) => {
          const info = { chain: Chain.Cardano, wallet: walletKey };
          throw getCip30ErrorCode(error) === CIP30_REFUSED
            ? new SwapKitError("wallet_connection_rejected_by_user", info)
            : toCip30SwapKitError(error, "core_wallet_connection_failed", info);
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
