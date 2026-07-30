import { AssetValue, Chain, type GenericTransferParams, SwapKitError } from "@swapkit/helpers";
import type { TONTransactionInput } from "@swapkit/toolboxes/ton";
import type { TonConnectUI } from "@tonconnect/ui";
import { match } from "ts-pattern";
import type { TonConnectConfig } from "./types";
import { sendTonConnectTransaction } from "./walletMethods";

interface GetWalletForChainParams {
  address: string;
  chain: Chain;
  config: TonConnectConfig;
  tonConnectUI: TonConnectUI;
}

export function getWalletForChain({ address, chain, config, tonConnectUI }: GetWalletForChainParams) {
  return match(chain)
    .with(Chain.Ton, async () => {
      const { getTONToolbox } = await import("@swapkit/toolboxes/ton");
      // Signerless toolbox: message building, balances, and fee estimation happen
      // locally; signing and broadcasting are delegated to the connected wallet.
      const toolbox = getTONToolbox();

      const signAndBroadcastTransaction = (transaction: TONTransactionInput) =>
        sendTonConnectTransaction({ tonConnectUI, transaction, validSeconds: config.requestTimeoutSeconds });

      const transfer = async ({ assetValue, recipient, memo }: GenericTransferParams) => {
        const transaction = await toolbox.createTransaction({ assetValue, memo, recipient, sender: address });
        return signAndBroadcastTransaction(transaction);
      };

      const estimateTransactionFee = ({ assetValue }: GenericTransferParams) => {
        // The signerless toolbox's estimateTransactionFee needs a configured wallet
        // and silently falls back to a flat 0.01 TON when getWallet() throws — badly
        // underestimating jettons. Mirror the toolbox's own transfer budget instead:
        // jettons attach ~0.05 TON gas + 0.01 TON forward, native transfers ~0.01 TON.
        return Promise.resolve(AssetValue.from({ chain: Chain.Ton, value: assetValue.isGasAsset ? "0.01" : "0.06" }));
      };

      return {
        ...toolbox,
        estimateTransactionFee,
        getAddress: () => address,
        // TON Connect signs and broadcasts atomically; a detached external-message
        // signature is not part of the protocol.
        sign: () => {
          throw new SwapKitError("core_wallet_sign_message_not_supported", { wallet: "TON Connect" });
        },
        signAndBroadcastTransaction,
        transfer,
      };
    })
    .otherwise(() => {
      throw new SwapKitError("wallet_chain_not_supported", { chain, wallet: "TON Connect" });
    });
}
