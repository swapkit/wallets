import { type EVMChain, SwapKitError } from "@swapkit/helpers";
import { getWeb3WalletMethods } from "@swapkit/wallet-extensions/evm-extensions";

import { createLedgerEip1193Adapter, resolveLedgerWalletProvider } from "./helpers";
import type { ConnectLedgerWalletProviderOptions } from "./types";

type EvmWalletMethods = Awaited<ReturnType<typeof getWeb3WalletMethods>>;

export async function connectLedgerEvm({
  chains,
  onChain,
  options,
}: {
  chains: EVMChain[];
  onChain: (wallet: {
    address: string;
    chain: EVMChain;
    disconnect: () => Promise<void>;
    walletMethods: EvmWalletMethods;
  }) => void;
  options: ConnectLedgerWalletProviderOptions;
}) {
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

    for (const { chain, walletMethods } of connectedChains)
      onChain({ address: nextAddress, chain, disconnect: disconnectLedgerEvm, walletMethods });
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

  provider.on?.("accountsChanged", handleAccountsChanged);
  provider.on?.("disconnect", handleDisconnect);

  try {
    await Promise.all(
      chains.map(async (chain, index) => {
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

  async function disconnectLedgerEvm() {
    releaseConnection();
    if (!providerClosed) await provider.disconnect?.();
  }

  return disconnectLedgerEvm;
}
