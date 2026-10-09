import "./register";

import { Chain, type EVMChain, filterSupportedChains, SwapKitError, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import { getWeb3WalletMethods } from "@swapkit/wallet-extensions/evm-extensions";

import { createLedgerEip1193Adapter, resolveLedgerWalletProvider } from "./helpers";
import { connectLedgerSolana } from "./solana";
import type { ConnectLedgerWalletProviderOptions } from "./types";

export { initializeLedgerWalletProvider, resolveLedgerWalletProvider, teardownLedgerWalletProvider } from "./helpers";
export type {
  ConnectLedgerWalletProviderOptions,
  InitializeLedgerWalletProviderOptions,
  LedgerFloatingButtonPosition,
  LedgerWalletProviderEip1193,
} from "./types";

const LEDGER_WALLET_PROVIDER_EVM_CHAINS = [
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

const LEDGER_WALLET_PROVIDER_CHAINS = [...LEDGER_WALLET_PROVIDER_EVM_CHAINS, Chain.Solana];

export const ledgerWalletProviderWallet = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectLedgerWalletProvider(chains: Chain[], options: ConnectLedgerWalletProviderOptions = {}) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });
      const evmChains = filteredChains.filter((chain): chain is EVMChain => chain !== Chain.Solana);
      const { provider: _evmProvider, ...solanaOptions } = options;
      const disconnectSolana = filteredChains.includes(Chain.Solana)
        ? await connectLedgerSolana({
            onAccount: ({ address, toolbox }) =>
              addChain({
                ...toolbox,
                address,
                chain: Chain.Solana,
                disconnect: () => disconnectSolana?.(),
                walletType,
              }),
            options: solanaOptions,
          })
        : undefined;

      if (evmChains.length === 0) return true;

      const provider = await resolveLedgerWalletProvider(options);
      const { BrowserProvider } = await import("ethers");

      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[] | undefined;
      const [address] = accounts ?? [];

      if (!address) throw new SwapKitError("wallet_ledger_wallet_provider_no_accounts");

      let connectedAddress = address;
      let accountChangeVersion = 0;
      let disconnected = false;
      let providerClosed = false;
      let adaptersReady = false;
      const adapters: Array<{ chain: EVMChain } & Awaited<ReturnType<typeof createLedgerEip1193Adapter>>> = [];

      function releaseConnection() {
        if (disconnected) return;

        disconnected = true;
        accountChangeVersion += 1;
        provider.removeListener?.("accountsChanged", handleAccountsChanged);
        provider.removeListener?.("disconnect", handleDisconnect);
        for (const adapter of adapters) adapter?.destroy();
      }

      async function addConnectedChains(nextAddress: string) {
        const version = accountChangeVersion;
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
        if (disconnected) return;

        const [nextAddress] = nextAccounts;
        if (!nextAddress) {
          releaseConnection();
          return;
        }
        if (nextAddress.toLowerCase() === connectedAddress.toLowerCase()) return;

        connectedAddress = nextAddress;
        accountChangeVersion += 1;
        if (adaptersReady) addConnectedChains(nextAddress).catch(releaseConnection);
      }

      function handleDisconnect() {
        providerClosed = true;
        releaseConnection();
      }

      async function disconnect() {
        releaseConnection();
        await disconnectSolana?.();
        if (!providerClosed) await provider.disconnect?.();
      }

      provider.on?.("accountsChanged", handleAccountsChanged);
      provider.on?.("disconnect", handleDisconnect);

      try {
        await Promise.all(
          evmChains.map(async (chain, index) => {
            const adapter = await createLedgerEip1193Adapter({
              chain,
              getAddress: () => (disconnected ? undefined : connectedAddress),
              provider,
            });
            if (disconnected) adapter.destroy();
            else adapters[index] = { chain, ...adapter };
          }),
        );
        adaptersReady = true;
        await addConnectedChains(connectedAddress);
      } catch (error) {
        releaseConnection();
        throw error;
      }

      return true;
    },
  directSigningSupport: Object.fromEntries(LEDGER_WALLET_PROVIDER_CHAINS.map((chain) => [chain, true])),
  name: "connectLedgerWalletProvider",
  supportedChains: LEDGER_WALLET_PROVIDER_CHAINS,
  walletType: WalletOption.LEDGER_WALLET_PROVIDER,
});

export const LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS = getWalletSupportedChains(ledgerWalletProviderWallet);
export type LedgerWalletProviderSupportedChain = (typeof LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS)[number];
