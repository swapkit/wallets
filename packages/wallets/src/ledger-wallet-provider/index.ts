import "./register";

import { Chain, type EVMChain, filterSupportedChains, SwapKitError, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import { getWeb3WalletMethods } from "@swapkit/wallet-extensions/evm-extensions";

import { createLedgerEip1193Adapter, resolveLedgerWalletProvider } from "./helpers";
import { createLedgerSolanaSigner, getLedgerSolanaAccount, resolveLedgerSolanaWallet } from "./solana";
import type { ConnectLedgerWalletProviderOptions, LedgerSolanaWalletAccount } from "./types";

export * from "./helpers";
export * from "./solana";
export * from "./types";

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
      const teardowns: (() => Promise<void> | void)[] = [];

      async function disconnect() {
        for (const teardown of teardowns.splice(0).reverse()) await teardown();
      }

      async function connectEvmChains() {
        const provider = await resolveLedgerWalletProvider(options);

        const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[] | undefined;
        const [address] = accounts ?? [];

        if (!address) throw new SwapKitError("wallet_ledger_wallet_provider_no_accounts");

        const { BrowserProvider } = await import("ethers");

        let connectedAddress = address;
        let accountChangeVersion = 0;
        const adapters = await Promise.all(
          evmChains.map(async (chain) => ({
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

        await addConnectedChains(address);
        provider.on?.("accountsChanged", handleAccountsChanged);

        teardowns.push(async () => {
          provider.removeListener?.("accountsChanged", handleAccountsChanged);
          for (const { destroy } of adapters) destroy();
          await provider.disconnect?.();
        });
      }

      async function connectSolanaChain() {
        const { provider: _evmProvider, ...solanaOptions } = options;
        const wallet = await resolveLedgerSolanaWallet(solanaOptions);
        const { accounts } = await wallet.features["standard:connect"].connect();
        const account = getLedgerSolanaAccount(accounts);

        if (!account) throw new SwapKitError("wallet_ledger_wallet_provider_no_accounts");

        const { getSolanaToolbox } = await import("@swapkit/toolboxes/solana");
        let connectedAddress = account.address;

        async function addSolanaChain(nextAccount: LedgerSolanaWalletAccount) {
          const signer = await createLedgerSolanaSigner({ account: nextAccount, features: wallet.features });
          if (nextAccount.address !== connectedAddress) return;

          const toolbox = getSolanaToolbox({ signer });
          addChain({ ...toolbox, address: nextAccount.address, chain: Chain.Solana, disconnect, walletType });
        }

        await addSolanaChain(account);

        const offChange = wallet.features["standard:events"]?.on("change", ({ accounts: nextAccounts }) => {
          const nextAccount = nextAccounts && getLedgerSolanaAccount(nextAccounts);
          if (!nextAccount || nextAccount.address === connectedAddress) return;

          connectedAddress = nextAccount.address;
          void addSolanaChain(nextAccount);
        });

        teardowns.push(async () => {
          offChange?.();
          await wallet.features["standard:disconnect"]?.disconnect();
        });
      }

      if (evmChains.length > 0) await connectEvmChains();
      if (filteredChains.includes(Chain.Solana)) await connectSolanaChain();

      return true;
    },
  directSigningSupport: Object.fromEntries(LEDGER_WALLET_PROVIDER_CHAINS.map((chain) => [chain, true])),
  name: "connectLedgerWalletProvider",
  supportedChains: LEDGER_WALLET_PROVIDER_CHAINS,
  walletType: WalletOption.LEDGER_WALLET_PROVIDER,
});

export const LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS = getWalletSupportedChains(ledgerWalletProviderWallet);
export type LedgerWalletProviderSupportedChain = (typeof LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS)[number];
