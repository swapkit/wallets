import "./register";

import { Chain, type EVMChain, filterSupportedChains, SwapKitError, WalletOption } from "@swapkit/helpers";
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

      if (filteredChains.includes(Chain.Solana)) {
        if (evmChains.length > 0) {
          throw new SwapKitError("wallet_ledger_wallet_provider_mixed_families", {
            message: "Connect EVM networks and Solana in separate calls.",
          });
        }

        const { provider: _evmProvider, ...solanaOptions } = options;
        await connectLedgerSolana({
          onAccount: ({ address, disconnect, toolbox }) =>
            addChain({ ...toolbox, address, chain: Chain.Solana, disconnect, walletType }),
          options: solanaOptions,
        });

        return true;
      }

      await connectLedgerEvm({
        chains: evmChains,
        onChain: ({ address, chain, disconnect, walletMethods }) =>
          addChain({ ...walletMethods, address, chain, disconnect, walletType }),
        options,
      });

      return true;
    },
  name: "connectLedgerWalletProvider",
  signingSupport: {
    ...Object.fromEntries(LEDGER_WALLET_PROVIDER_EVM_CHAINS.map((chain) => [chain, { direct: true, typedData: true }])),
    [Chain.Solana]: { direct: true },
  },
  supportedChains: LEDGER_WALLET_PROVIDER_CHAINS,
  walletType: WalletOption.LEDGER_WALLET_PROVIDER,
});

export const LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS = getWalletSupportedChains(ledgerWalletProviderWallet);
export type LedgerWalletProviderSupportedChain = (typeof LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS)[number];
