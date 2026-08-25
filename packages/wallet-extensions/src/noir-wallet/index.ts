import { AssetValue, Chain, type GenericTransferParams, SwapKitError, type WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { NoirWalletZcashProvider } from "../types";
import type { ExtensionWallet } from "../walletTypes";
import { NOIR_WALLET } from "./option";

export function getNoirWalletZcashProvider(): NoirWalletZcashProvider {
  const provider = window.noirwallet?.zcash;

  if (!provider) {
    throw new SwapKitError("wallet_provider_not_found", { wallet: NOIR_WALLET });
  }

  return provider;
}

export const noirWallet: ExtensionWallet<"connectNoirWallet"> = createWallet({
  connect: ({ addChain, walletType }) =>
    async function connectNoirWallet(_chains: Chain[]) {
      const provider = getNoirWalletZcashProvider();

      // Opens the extension's connect-approval popup and returns the primary
      // account's addresses.
      const account = await provider.request({ method: "zcash_requestAccounts" });

      if (!account?.transparent) {
        throw new SwapKitError("core_wallet_connection_failed", { wallet: NOIR_WALLET });
      }

      const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");
      const toolbox = await getUtxoToolbox(Chain.Zcash);

      addChain({
        ...toolbox,
        address: account.transparent,
        chain: Chain.Zcash,
        /**
         * Noir Wallet spends from the shielded pool, so the spendable balance
         * comes from the wallet itself rather than the transparent address'
         * UTXO set.
         */
        getBalance: async () => {
          const balance = await provider.request({ method: "zcash_getBalance" });
          const value = balance?.available ?? balance?.spendable ?? balance?.total ?? "0";

          return [AssetValue.from({ chain: Chain.Zcash, value })];
        },
        signMessage: async (message: string) => {
          const { signature } = await provider.request({ method: "zcash_signMessage", params: [message, {}] });

          return signature;
        },
        /**
         * Transaction building, fee selection and signing happen inside the
         * extension. Memos are only supported towards shielded recipients,
         * which rules out OP_RETURN-based routes (e.g. Maya/THORChain) —
         * deposit-address routes such as NEAR Intents work.
         */
        transfer: ({ recipient, assetValue, memo }: GenericTransferParams) => {
          if (memo) {
            throw new SwapKitError("wallet_walletconnect_method_not_supported", {
              method: "transfer",
              reason: "Noir Wallet cannot attach OP_RETURN memos to transparent recipients",
              wallet: NOIR_WALLET,
            });
          }

          if (!(recipient && assetValue)) {
            throw new SwapKitError("wallet_missing_params", { params: { assetValue, recipient } });
          }

          return provider.request({
            method: "zcash_sendTransaction",
            params: [{ amount: assetValue.getValue("string"), to: recipient }],
          });
        },
        walletType,
      });

      return true;
    },
  // Raw-sign RPC is not exposed by the extension; transactions are built and
  // signed inside the wallet.
  directSigningSupport: {},
  name: "connectNoirWallet",
  supportedChains: [Chain.Zcash],
  // createWallet constrains walletType to the WalletOption enum, which has no
  // NOIR_WALLET member until the registry lands upstream (swapkit/sdk#346) —
  // see ./option.ts.
  walletType: NOIR_WALLET as unknown as WalletOption,
});

export const NOIR_WALLET_SUPPORTED_CHAINS = getWalletSupportedChains(noirWallet);
export type NoirWalletSupportedChain = (typeof NOIR_WALLET_SUPPORTED_CHAINS)[number];
