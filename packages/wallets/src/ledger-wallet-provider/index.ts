import "./register";

import { Chain, type EVMChain, filterSupportedChains, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";

import { connectLedgerEvm } from "./evm";
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
      const pendingChains: Parameters<typeof addChain>[0][] = [];
      let ready = false;
      let disconnectSolana: (() => Promise<void>) | undefined;
      let disconnectEvm: (() => Promise<void>) | undefined;

      // Chains are only published once every requested family connected, so a failure leaves nothing behind
      function publish(chainWallet: Parameters<typeof addChain>[0]) {
        if (ready) addChain(chainWallet);
        else pendingChains.push(chainWallet);
      }

      async function disconnect() {
        const results = await Promise.allSettled([disconnectSolana?.(), disconnectEvm?.()]);
        const failure = results.find((result) => result.status === "rejected");
        if (failure) throw failure.reason;
      }

      if (filteredChains.includes(Chain.Solana)) {
        disconnectSolana = await connectLedgerSolana({
          onAccount: ({ address, toolbox }) =>
            publish({ ...toolbox, address, chain: Chain.Solana, disconnect, walletType }),
          options: solanaOptions,
        });
      }

      if (evmChains.length > 0) {
        try {
          disconnectEvm = await connectLedgerEvm({
            chains: evmChains,
            onChain: ({ address, chain, walletMethods }) =>
              publish({ ...walletMethods, address, chain, disconnect, walletType }),
            options,
          });
        } catch (error) {
          await disconnectSolana?.();
          throw error;
        }
      }

      ready = true;
      for (const chainWallet of pendingChains.splice(0)) addChain(chainWallet);

      return true;
    },
  directSigningSupport: Object.fromEntries(LEDGER_WALLET_PROVIDER_CHAINS.map((chain) => [chain, true])),
  name: "connectLedgerWalletProvider",
  supportedChains: LEDGER_WALLET_PROVIDER_CHAINS,
  walletType: WalletOption.LEDGER_WALLET_PROVIDER,
});

export const LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS = getWalletSupportedChains(ledgerWalletProviderWallet);
export type LedgerWalletProviderSupportedChain = (typeof LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS)[number];
