import { Chain, ChainToChainId, filterSupportedChains, SwapKitError, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import { extractUtxoTransferIntent, unsupportedUtxoSignTransaction } from "../helpers/utxoTransferIntent";
import type { ExtensionWallet } from "../walletTypes";
import { getCtrlAddress, getCtrlProvider, signCtrlThorchainTransaction, walletTransfer } from "./walletHelpers";

export const ctrlWallet: ExtensionWallet<"connectCtrl"> = createWallet({
  connect: ({ addChain, walletType, supportedChains }) =>
    async function connectCtrl(chains: Chain[]) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });

      const promises = filteredChains.map(async (chain) => {
        const address = await getCtrlAddress(chain);
        const walletMethods = await getWalletMethods(chain);

        addChain({ ...walletMethods, address, chain, walletType });
      });

      await Promise.all(promises);

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
    [Chain.BitcoinCash]: true,
    [Chain.Cosmos]: true,
    [Chain.Dogecoin]: true,
    [Chain.Ethereum]: true,
    [Chain.Gnosis]: true,
    [Chain.Kujira]: true,
    [Chain.Litecoin]: true,
    [Chain.Maya]: true,
    [Chain.Monad]: true,
    [Chain.Near]: true,
    [Chain.Noble]: true,
    [Chain.Optimism]: true,
    [Chain.Polygon]: true,
    [Chain.Solana]: true,
    [Chain.THORChain]: true,
    [Chain.XLayer]: true,
  },
  name: "connectCtrl",
  supportedChains: [
    Chain.Arbitrum,
    Chain.Aurora,
    Chain.Avalanche,
    Chain.Base,
    Chain.Berachain,
    Chain.BinanceSmartChain,
    Chain.Bitcoin,
    Chain.BitcoinCash,
    Chain.Cosmos,
    Chain.Dogecoin,
    Chain.Ethereum,
    Chain.Gnosis,
    Chain.Kujira,
    Chain.Litecoin,
    Chain.Maya,
    Chain.Monad,
    Chain.Noble,
    Chain.Optimism,
    Chain.Polygon,
    Chain.Solana,
    Chain.THORChain,
    Chain.XLayer,
  ],
  walletType: WalletOption.CTRL,
});

export const CTRL_SUPPORTED_CHAINS = getWalletSupportedChains(ctrlWallet);

async function getWalletMethods(chain: (typeof CTRL_SUPPORTED_CHAINS)[number]) {
  switch (chain) {
    case Chain.Solana: {
      const { getSolanaToolbox } = await import("@swapkit/toolboxes/solana");
      const provider = getCtrlProvider(chain);

      if (!provider) {
        throw new SwapKitError("wallet_ctrl_not_found");
      }
      const toolbox = await getSolanaToolbox({ signer: provider });

      return toolbox;
    }

    case Chain.Maya:
    case Chain.THORChain: {
      const { getCosmosToolbox } = await import("@swapkit/toolboxes/cosmos");

      const toolbox = await getCosmosToolbox(chain);

      return {
        ...toolbox,
        signAndBroadcastTransaction: (tx: Parameters<typeof signCtrlThorchainTransaction>[0]) =>
          signCtrlThorchainTransaction(tx, chain),
        signTransaction: () =>
          Promise.reject(
            new SwapKitError({
              errorKey: "wallet_walletconnect_method_not_supported",
              info: {
                method: "signTransaction",
                reason: "CTRL THORChain provider only supports signAndBroadcastTransaction",
                wallet: WalletOption.CTRL,
              },
            }),
          ),
      };
    }

    case Chain.Cosmos:
    case Chain.Kujira:
    case Chain.Noble: {
      const { getCosmosToolbox } = await import("@swapkit/toolboxes/cosmos");
      const chainId = ChainToChainId[chain];
      const provider = getCtrlProvider(chain);

      await provider?.enable(chainId);
      const signer = await provider?.getOfflineSignerAuto(chainId);

      if (!signer) {
        throw new SwapKitError("wallet_ctrl_not_found");
      }

      const toolbox = await getCosmosToolbox(chain, { signer });

      return toolbox;
    }

    case Chain.Bitcoin: {
      const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");
      const { Transaction } = await import("@swapkit/utxo-signer");
      const provider = getCtrlProvider(Chain.Bitcoin) as
        | { request: (args: { method: string; params: unknown }, cb?: (err: unknown, res: unknown) => void) => unknown }
        | undefined;

      if (!provider) {
        throw new SwapKitError("wallet_ctrl_not_found", { chain: Chain.Bitcoin });
      }

      const address = await getCtrlAddress(Chain.Bitcoin);
      if (!address) {
        throw new SwapKitError({ errorKey: "wallet_provider_not_found", info: { chain, wallet: WalletOption.CTRL } });
      }

      const ctrlRequest = <T>(args: { method: string; params: unknown }): Promise<T> =>
        new Promise<T>((resolve, reject) => {
          const handler = (err: unknown, res: unknown) => (err ? reject(err) : resolve(res as T));
          const maybePromise = provider.request(args, handler);
          if (maybePromise && typeof (maybePromise as { then?: unknown }).then === "function") {
            (maybePromise as Promise<T>).then(
              (res) => handler(null, res),
              (err) => handler(err, null),
            );
          }
        });

      type SignPsbtResponse = {
        error?: unknown;
        hash?: string;
        psbt?: string;
        result?: SignPsbtResponse | string;
        status?: string;
        transactionHash?: string;
        txid?: string;
        txId?: string;
      };

      const getSignPsbtResult = (response: SignPsbtResponse): SignPsbtResponse =>
        typeof response.result === "object" && response.result ? response.result : response;

      const getSignedPsbt = (response: SignPsbtResponse) => {
        const result = getSignPsbtResult(response);
        return result.psbt || response.psbt || (typeof response.result === "string" ? response.result : undefined);
      };

      const getBroadcastTxId = (response: SignPsbtResponse) => {
        const result = getSignPsbtResult(response);
        return (
          result.txid ||
          result.txId ||
          result.hash ||
          result.transactionHash ||
          response.txid ||
          response.txId ||
          response.hash ||
          response.transactionHash ||
          (typeof response.result === "string" ? response.result : undefined)
        );
      };

      const getSignPsbtResponseShape = (response: SignPsbtResponse) => {
        const result = getSignPsbtResult(response);
        return {
          nestedStatus: result.status,
          resultKeys: typeof response.result === "object" && response.result ? Object.keys(response.result) : undefined,
          rootKeys: Object.keys(response),
          status: response.status,
        };
      };

      const signPsbt = (tx: InstanceType<typeof Transaction>, broadcast: boolean) => {
        const psbt = Buffer.from(tx.toPSBT()).toString("base64");
        const signingIndexes = Array.from({ length: tx.inputsLength }, (_, i) => i);

        return ctrlRequest<SignPsbtResponse>({
          method: "sign_psbt",
          params: [{ allowedSignHash: 1, broadcast, psbt, signInputs: { [address]: signingIndexes } }],
        });
      };

      const signer = {
        getAddress: async () => address,
        signTransaction: async (tx: InstanceType<typeof Transaction>) => {
          const response = await signPsbt(tx, false);
          const signedPsbt = getSignedPsbt(response);

          if (!signedPsbt) {
            throw new SwapKitError("plugin_swapkit_invalid_transaction", {
              chain: Chain.Bitcoin,
              response: getSignPsbtResponseShape(response),
            });
          }

          return Transaction.fromPSBT(new Uint8Array(Buffer.from(signedPsbt, "base64")));
        },
      };

      const toolbox = await getUtxoToolbox(Chain.Bitcoin, { signer });

      return {
        ...toolbox,
        address,
        signAndBroadcastTransaction: async (tx: InstanceType<typeof Transaction>) => {
          const response = await signPsbt(tx, true);
          const txid = getBroadcastTxId(response);

          if (!txid) {
            throw new SwapKitError("plugin_swapkit_invalid_transaction", {
              chain: Chain.Bitcoin,
              response: getSignPsbtResponseShape(response),
            });
          }

          return txid;
        },
      };
    }

    case Chain.BitcoinCash:
    case Chain.Dogecoin:
    case Chain.Litecoin: {
      const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");
      const toolbox = await getUtxoToolbox(chain);
      const address = await getCtrlAddress(chain);

      return {
        ...toolbox,
        signAndBroadcastTransaction: (tx: Parameters<typeof extractUtxoTransferIntent>[0]["tx"]) => {
          const intent = extractUtxoTransferIntent({ chain, senderAddress: address, tx });
          return walletTransfer({
            assetValue: intent.assetValue,
            from: intent.from,
            memo: intent.memo,
            recipient: intent.recipient,
          });
        },
        signTransaction: () => unsupportedUtxoSignTransaction(WalletOption.CTRL),
        transfer: walletTransfer,
      };
    }

    case Chain.Arbitrum:
    case Chain.Aurora:
    case Chain.Avalanche:
    case Chain.Base:
    case Chain.Berachain:
    case Chain.BinanceSmartChain:
    case Chain.Ethereum:
    case Chain.Gnosis:
    case Chain.Monad:
    case Chain.Optimism:
    case Chain.Polygon:
    case Chain.XLayer: {
      const { prepareNetworkSwitch } = await import("@swapkit/helpers");
      const { getEvmToolboxAsync } = await import("@swapkit/toolboxes/evm");
      const { BrowserProvider } = await import("ethers");
      const ethereumWindowProvider = getCtrlProvider(chain);

      if (!ethereumWindowProvider) {
        throw new SwapKitError("wallet_ctrl_not_found");
      }

      const provider = new BrowserProvider(ethereumWindowProvider, "any");
      const signer = await provider.getSigner();
      const toolbox = await getEvmToolboxAsync(chain, { provider, signer });

      return prepareNetworkSwitch({ chain, provider, toolbox });
    }

    default:
      return null;
  }
}
