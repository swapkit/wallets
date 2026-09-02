// Registers WalletOption.LEDGER_WALLET_PROVIDER and the
// wallet_ledger_wallet_provider_* error codes before anything below reads them.
import "./register";

import { Chain, type EVMChain, filterSupportedChains, SwapKitError, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import { getWeb3WalletMethods } from "@swapkit/wallet-extensions/evm-extensions";

import { createLedgerEip1193Adapter, resolveLedgerWalletProvider } from "./helpers";
import type { ConnectLedgerWalletProviderOptions } from "./types";

export * from "./helpers";
export * from "./types";

/**
 * Ledger Wallet's own network list, intersected with SwapKit's EVM chains.
 * Ledger additionally supports zkSync (324), which SwapKit has no chain for.
 * `wallet_switchEthereumChain` rejects everything outside this list, so a chain
 * missing here cannot be signed for.
 */
const LEDGER_WALLET_PROVIDER_CHAINS = [
  Chain.Arbitrum,
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

/**
 * Ledger Wallet connector built on the Ledger Wallet Provider SDK
 * (https://developers.ledger.com/docs/ledger-wallet-provider/overview).
 *
 * Unlike `@swapkit/wallets/ledger`, this connector never talks to the device
 * directly: the SDK owns device discovery, account selection and the signing
 * UI, and exposes it all through one EIP-1193 provider. That makes it the
 * connector to use where SwapKit cannot own the WebHID/WebUSB transport — the
 * widget above all — at the cost of being EVM-only.
 */
export const ledgerWalletProviderWallet = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectLedgerWalletProvider(chains: Chain[], options: ConnectLedgerWalletProviderOptions = {}) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });
      const provider = await resolveLedgerWalletProvider(options);

      // Opens the SDK's connect flow: device pairing, then account selection.
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[] | undefined;
      const [address] = accounts ?? [];

      if (!address) throw new SwapKitError("wallet_ledger_wallet_provider_no_accounts");

      const { BrowserProvider } = await import("ethers");

      let connectedAddress = address;
      let accountChangeVersion = 0;
      // The read RPC of an adapter does not depend on the account, so the
      // adapters outlive account switches and are only torn down on disconnect.
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

        // A newer account change started while the toolboxes were building.
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
