import "./register";

import { Chain, type EVMChain, filterSupportedChains, SwapKitError, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import { getWeb3WalletMethods } from "@swapkit/wallet-extensions/evm-extensions";

import { createLedgerEip1193Adapter, resolveLedgerWalletProvider } from "./helpers";
import type { ConnectLedgerWalletProviderOptions } from "./types";

export * from "./helpers";
export * from "./types";

const LEDGER_WALLET_PROVIDER_CHAINS = [
  Chain.Arbitrum,
  Chain.Arc,
  Chain.Avalanche,
  Chain.Base,
  Chain.BinanceSmartChain,
  Chain.Ethereum,
  Chain.Linea,
  Chain.Optimism,
  Chain.Polygon,
  Chain.Robinhood,
  Chain.Sonic,
] as EVMChain[];

export const ledgerWalletProviderWallet = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectLedgerWalletProvider(chains: Chain[], options: ConnectLedgerWalletProviderOptions = {}) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });
      const provider = await resolveLedgerWalletProvider(options);

      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[] | undefined;
      const [address] = accounts ?? [];

      if (!address) throw new SwapKitError("wallet_ledger_wallet_provider_no_accounts");

      const { BrowserProvider } = await import("ethers");

      let connectedAddress = address;
      let accountChangeVersion = 0;
      const adapters = await Promise.all(
        filteredChains.map(async (chain) => ({
          chain,
          ...(await createLedgerEip1193Adapter({ chain, getAddress: () => connectedAddress, provider })),
        })),
      );

      async function addConnectedChains(nextAddress: string, version = accountChangeVersion) {
        const connectedChains = await Promise.all(
          adapters.map(async ({ chain, provider: eip1193Provider }) => ({
            chain,
            walletMethods: await getWeb3WalletMethods({
              address: nextAddress,
              chain,
              provider: new BrowserProvider(eip1193Provider, "any"),
              walletProvider: eip1193Provider,
            }),
          })),
        );

        if (version !== accountChangeVersion) return;

        for (const { chain, walletMethods } of connectedChains) {
          addChain({ ...walletMethods, address: nextAddress, chain, disconnect, walletType });
        }
      }

      function handleAccountsChanged(nextAccounts: string[]) {
        const [nextAddress] = nextAccounts;
        if (!nextAddress || nextAddress.toLowerCase() === connectedAddress.toLowerCase()) return;

        connectedAddress = nextAddress;
        accountChangeVersion += 1;
        void addConnectedChains(nextAddress);
      }

      async function disconnect() {
        provider.removeListener?.("accountsChanged", handleAccountsChanged);
        for (const { destroy } of adapters) destroy();
        await provider.disconnect?.();
      }

      await addConnectedChains(address);
      provider.on?.("accountsChanged", handleAccountsChanged);

      return true;
    },
  directSigningSupport: Object.fromEntries(LEDGER_WALLET_PROVIDER_CHAINS.map((chain) => [chain, true])),
  name: "connectLedgerWalletProvider",
  supportedChains: LEDGER_WALLET_PROVIDER_CHAINS,
  walletType: WalletOption.LEDGER_WALLET_PROVIDER,
});

export const LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS = getWalletSupportedChains(ledgerWalletProviderWallet);
export type LedgerWalletProviderSupportedChain = (typeof LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS)[number];
