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

type AccountsChangedListener = (accounts: string[]) => void;

type Eip1193EventProvider = Eip1193Provider & {
  on?: (event: "accountsChanged", listener: AccountsChangedListener) => void;
  removeListener?: (event: "accountsChanged", listener: AccountsChangedListener) => void;
};

export type EVMWalletOptions =
  | typeof WalletOption.BRAVE
  | typeof WalletOption.OKX_MOBILE
  | typeof WalletOption.METAMASK
  | typeof WalletOption.COINBASE_WEB
  | typeof WalletOption.EIP6963;

const getWalletForType = (
  walletType:
    | typeof WalletOption.BRAVE
    | typeof WalletOption.OKX_MOBILE
    | typeof WalletOption.METAMASK
    | typeof WalletOption.COINBASE_WEB
    | typeof WalletOption.EIP6963,
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
      if (walletType === WalletOption.EIP6963 && !eip1193Provider) {
        throw new SwapKitError("wallet_evm_extensions_no_provider");
      }

      const windowProvider = eip1193Provider || getWalletForType(walletType);
      const browserProvider = new BrowserProvider(windowProvider, "any");

      await browserProvider.send("eth_requestAccounts", []);
      const signer = await browserProvider.getSigner();
      const address = await signer.getAddress();
      const eventProvider = windowProvider as Eip1193EventProvider;
      let connectedAddress = address;
      let accountChangeVersion = 0;

      const addConnectedChains = async (nextAddress: string, version = accountChangeVersion) => {
        const connectedChains = await Promise.all(
          filteredChains.map(async (chain) => {
            const walletMethods = await getWeb3WalletMethods({
              address: nextAddress,
              chain,
              provider: browserProvider,
              walletProvider: windowProvider,
            });

            return { chain, walletMethods };
          }),
        );

        if (version !== accountChangeVersion) return;

        connectedChains.forEach(({ chain, walletMethods }) => {
          addChain({ ...walletMethods, address: nextAddress, chain, disconnect, walletType });
        });
      };

      function handleAccountsChanged(accounts: string[]) {
        const [nextAddress] = accounts;
        if (!nextAddress || nextAddress.toLowerCase() === connectedAddress.toLowerCase()) return;

        connectedAddress = nextAddress;
        accountChangeVersion += 1;
        void addConnectedChains(nextAddress);
      }

      const disconnect = () => {
        eventProvider.removeListener?.("accountsChanged", handleAccountsChanged);
        return browserProvider.send("wallet_revokePermissions", [{ eth_accounts: {} }]);
      };

      await addConnectedChains(address);
      eventProvider.on?.("accountsChanged", handleAccountsChanged);

      return true;
    },
  directSigningSupport: Object.fromEntries(EVMChains.map((chain) => [chain, true])),
  name: "connectEVMWallet",
  supportedChains: [...EVMChains] as EVMChain[],
});

export const EVM_EXTENSIONS_SUPPORTED_CHAINS = getWalletSupportedChains(evmWallet);
