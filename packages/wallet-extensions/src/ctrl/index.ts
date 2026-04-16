import {
  Chain,
  ChainToChainId,
  filterSupportedChains,
  type GenericTransferParams,
  SwapKitError,
  WalletOption,
} from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "../core";
import { getCtrlAddress, getCtrlProvider, walletTransfer } from "./walletHelpers";

export const ctrlWallet = createWallet({
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
    Chain.Near,
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
      const { getCosmosToolbox, THORCHAIN_GAS_VALUE, MAYA_GAS_VALUE } = await import("@swapkit/toolboxes/cosmos");

      const gasLimit = chain === Chain.Maya ? MAYA_GAS_VALUE : THORCHAIN_GAS_VALUE;
      const toolbox = await getCosmosToolbox(chain);

      return {
        ...toolbox,
        deposit: (tx: GenericTransferParams) => walletTransfer({ ...tx, recipient: "" }, "deposit"),
        transfer: (tx: GenericTransferParams) => walletTransfer({ ...tx, gasLimit }, "transfer"),
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

      const signer = {
        getAddress: async () => address,
        signTransaction: async (tx: InstanceType<typeof Transaction>) => {
          const psbtB64 = Buffer.from(tx.toPSBT()).toString("base64");
          const signingIndexes = Array.from({ length: tx.inputsLength }, (_, i) => i);

          const response = await ctrlRequest<{ status: string; result: { psbt: string } }>({
            method: "sign_psbt",
            params: { allowedSignHash: 1, broadcast: false, psbt: psbtB64, signInputs: { [address]: signingIndexes } },
          });

          if (response?.status !== "success" || !response.result?.psbt) {
            throw new SwapKitError("plugin_swapkit_invalid_transaction", { chain: Chain.Bitcoin });
          }

          return Transaction.fromPSBT(new Uint8Array(Buffer.from(response.result.psbt, "base64")));
        },
      };

      const toolbox = await getUtxoToolbox(Chain.Bitcoin, { signer });

      return { ...toolbox, address };
    }

    case Chain.BitcoinCash:
    case Chain.Dogecoin:
    case Chain.Litecoin: {
      const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");
      const toolbox = await getUtxoToolbox(chain);

      return { ...toolbox, transfer: walletTransfer };
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
      const { prepareNetworkSwitch, switchEVMWalletNetwork } = await import("@swapkit/helpers");
      const { getEvmToolboxAsync } = await import("@swapkit/toolboxes/evm");
      const { BrowserProvider } = await import("ethers");
      const ethereumWindowProvider = getCtrlProvider(chain);

      if (!ethereumWindowProvider) {
        throw new SwapKitError("wallet_ctrl_not_found");
      }

      const provider = new BrowserProvider(ethereumWindowProvider, "any");
      const signer = await provider.getSigner();
      const toolbox = await getEvmToolboxAsync(chain, { provider, signer });

      try {
        if (chain !== Chain.Ethereum) {
          const networkParams = toolbox.getNetworkParams();
          await switchEVMWalletNetwork(provider, chain, networkParams);
        }
      } catch {
        throw new SwapKitError({
          errorKey: "wallet_failed_to_add_or_switch_network",
          info: { chain, wallet: WalletOption.CTRL },
        });
      }

      return prepareNetworkSwitch({ chain, provider, toolbox });
    }

    case Chain.Near: {
      const provider = getCtrlProvider(chain);

      if (!provider) {
        throw new SwapKitError("wallet_ctrl_not_found", { chain: Chain.Near });
      }

      const { createNearSignerFromProvider } = await import("../helpers/near");
      const { getNearToolbox } = await import("@swapkit/toolboxes/near");

      const signer = await createNearSignerFromProvider(provider, "CTRL");
      const accountId = await signer.getAddress();
      const toolbox = await getNearToolbox({ signer });

      const transfer = async (params: GenericTransferParams) => {
        const { actionCreators } = await import("@near-js/transactions");

        const amountInYocto = params.assetValue.getBaseValue("string");
        const action = actionCreators.transfer(BigInt(amountInYocto));

        const transaction = { actions: [action], receiverId: params.recipient, signerId: accountId };

        const txHash: string = await provider.request({ method: "signAndSendTransaction", params: { transaction } });

        return txHash;
      };

      return { ...toolbox, transfer };
    }

    default:
      return null;
  }
}
