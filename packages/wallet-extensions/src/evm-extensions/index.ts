import {
  type Chain,
  type EVMChain,
  EVMChains,
  filterSupportedChains,
  prepareNetworkSwitch,
  SwapKitError,
  WalletOption,
} from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { BrowserProvider, Eip1193Provider } from "ethers";
import type { ExtensionWallet } from "../walletTypes";

export type EVMWalletOptions =
  | WalletOption.BRAVE
  | WalletOption.OKX_MOBILE
  | WalletOption.METAMASK
  | WalletOption.COINBASE_WEB
  | WalletOption.EIP6963;

const getWalletForType = (
  walletType:
    | WalletOption.BRAVE
    | WalletOption.OKX_MOBILE
    | WalletOption.METAMASK
    | WalletOption.COINBASE_WEB
    | WalletOption.EIP6963,
) => {
  switch (walletType) {
    case WalletOption.COINBASE_WEB:
      return window.coinbaseWalletExtension;
    default:
      return window.ethereum;
  }
};

export const getWeb3WalletMethods = async ({
  address,
  walletProvider,
  chain,
  provider,
}: {
  address: string;
  walletProvider?: Eip1193Provider;
  chain: EVMChain;
  provider: BrowserProvider;
}) => {
  if (!walletProvider) throw new SwapKitError("wallet_evm_extensions_not_found");
  const { getEvmToolboxAsync } = await import("@swapkit/toolboxes/evm");

  const signer = await provider.getSigner();
  const toolbox = await getEvmToolboxAsync(chain, { provider, signer });

  return prepareNetworkSwitch({
    chain,
    provider,
    toolbox: { ...toolbox, getBalance: () => toolbox.getBalance(address) },
  });
};

export const evmWallet: ExtensionWallet<
  "connectEVMWallet",
  EVMChain[],
  [chains: Chain[], walletType?: EVMWalletOptions, eip1193Provider?: Eip1193Provider]
> = createWallet({
  connect: ({ addChain, supportedChains }) =>
    async function connectEVMWallet(
      chains: Chain[],
      walletType: EVMWalletOptions = WalletOption.METAMASK,
      eip1193Provider?: Eip1193Provider,
    ) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });
      const { BrowserProvider } = await import("ethers");

      await Promise.all(
        filteredChains.map(async (chain) => {
          if (walletType === WalletOption.EIP6963 && !eip1193Provider)
            throw new SwapKitError("wallet_evm_extensions_no_provider");

          const windowProvider = eip1193Provider || getWalletForType(walletType);
          const browserProvider = new BrowserProvider(windowProvider, "any");

          await browserProvider.send("eth_requestAccounts", []);
          const signer = await browserProvider.getSigner();
          const address = await signer.getAddress();

          const walletMethods = await getWeb3WalletMethods({
            address,
            chain,
            provider: browserProvider,
            walletProvider: windowProvider,
          });

          const disconnect = () => browserProvider.send("wallet_revokePermissions", [{ eth_accounts: {} }]);
          addChain({ ...walletMethods, address, chain, disconnect, walletType });
          return;
        }),
      );

      return true;
    },
  directSigningSupport: Object.fromEntries(EVMChains.map((chain) => [chain, true])),
  name: "connectEVMWallet",
  supportedChains: [...EVMChains] as EVMChain[],
});

export const EVM_EXTENSIONS_SUPPORTED_CHAINS = getWalletSupportedChains(evmWallet);
