import {
  Chain,
  type EVMChain,
  EVMChains,
  filterSupportedChains,
  type GenericTransferParams,
  getChainConfig,
  prepareNetworkSwitch,
  SwapKitError,
  switchEVMWalletNetwork,
  WalletOption,
} from "@swapkit-dev/helpers";
import type { TONTransactionMessage } from "@swapkit-dev/toolboxes/ton";
import { createWallet, getWalletSupportedChains } from "@swapkit-dev/wallet-core";
import type { Eip1193Provider } from "ethers";

export type TrustWalletTonProvider = {
  adapter: { handler: (request: { method: string; params?: unknown }) => Promise<unknown>; strategy: string };
  version: string;
  send(method: string, params?: unknown): Promise<unknown>;
  disconnect(): void;
  isConnected(): boolean;
};

export const trustwalletWallet = createWallet({
  connect: ({ addChain, walletType, supportedChains }) =>
    async function connectTrustWallet(chains: Chain[]) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });

      await Promise.all(
        filteredChains.map(async (chain) => {
          if (chain === Chain.Ton) {
            const walletMethods = await connectTon();
            addChain({ ...walletMethods, chain, walletType });
          } else {
            const walletMethods = await connectEvm(chain as EVMChain);
            addChain({ ...walletMethods, chain, walletType });
          }
        }),
      );

      return true;
    },
  name: "connectTrustWallet",
  supportedChains: [...EVMChains, Chain.Ton],
  walletType: WalletOption.TRUSTWALLET_WEB,
});

async function connectTon() {
  const tonProvider = (window.trustwallet as any)?.ton as TrustWalletTonProvider;
  if (!tonProvider?.adapter?.handler) {
    throw new SwapKitError("wallet_evm_extensions_not_found");
  }

  const result = (await tonProvider.send("ton_requestAccounts", {})) as string[];
  const address = result?.[0];

  if (!address) {
    throw new SwapKitError("core_wallet_connection_not_found");
  }

  const { getTONToolbox } = await import("@swapkit-dev/toolboxes/ton");
  const toolbox = getTONToolbox();

  async function sendTonTransaction(messages: TONTransactionMessage[]) {
    const validUntil = Math.floor(Date.now() / 1000) + 300;

    const txResult = (await tonProvider.send("ton_sendTransaction", [
      { from: address, messages, network: "-239", valid_until: validUntil },
    ])) as string;

    if (!txResult) throw new SwapKitError("core_transaction_failed");

    return txResult;
  }

  async function transfer(params: GenericTransferParams) {
    const messages = await toolbox.createTransaction({ ...params, sender: address });
    return sendTonTransaction(messages);
  }

  function signAndBroadcastTransaction(messages: TONTransactionMessage[]) {
    return sendTonTransaction(messages);
  }

  return { ...toolbox, address, getBalance: () => toolbox.getBalance(address), signAndBroadcastTransaction, transfer };
}

async function connectEvm(chain: EVMChain) {
  const walletProvider = window.trustwallet as Eip1193Provider | undefined;
  if (!walletProvider) throw new SwapKitError("wallet_evm_extensions_not_found");

  const { BrowserProvider } = await import("ethers");
  const { getEvmToolboxAsync } = await import("@swapkit-dev/toolboxes/evm");

  const provider = new BrowserProvider(walletProvider, "any");
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  const toolbox = await getEvmToolboxAsync(chain, { provider, signer });
  const { chainIdHex } = getChainConfig(chain);

  const currentNetwork = await provider.getNetwork();
  if (currentNetwork.chainId.toString() !== chainIdHex) {
    try {
      const networkParams = toolbox.getNetworkParams();
      await switchEVMWalletNetwork(provider, chain, networkParams);
    } catch {
      throw new SwapKitError("wallet_evm_extensions_failed_to_switch_network", { chain });
    }
  }

  const disconnect = () => provider.send("wallet_revokePermissions", [{ eth_accounts: {} }]);

  return {
    ...prepareNetworkSwitch({
      chain,
      provider,
      toolbox: { ...toolbox, getBalance: () => toolbox.getBalance(address) },
    }),
    address,
    disconnect,
  };
}

export const TRUSTWALLET_SUPPORTED_CHAINS = getWalletSupportedChains(trustwalletWallet);
