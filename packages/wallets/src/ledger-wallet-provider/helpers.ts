import { type EVMChain, getChainConfig, getRPCUrl, SwapKitError } from "@swapkit/helpers";
import type { Eip1193Provider } from "ethers";

import type {
  ConnectLedgerWalletProviderOptions,
  InitializeLedgerWalletProviderOptions,
  LedgerWalletProviderDetail,
  LedgerWalletProviderEip1193,
} from "./types";

const LEDGER_WALLET_PROVIDER_RDNS = "com.ledger.wallet.provider";
const DEFAULT_DISCOVERY_TIMEOUT = 10_000;
const ANNOUNCED_PROVIDER_PROBE_TIMEOUT = 250;

export function discoverLedgerWalletProvider({
  timeout = DEFAULT_DISCOVERY_TIMEOUT,
}: {
  timeout?: number;
} = {}): Promise<LedgerWalletProviderEip1193 | undefined> {
  if (typeof window === "undefined") return Promise.resolve(undefined);

  return new Promise((resolve) => {
    let settled = false;

    function settle(provider: LedgerWalletProviderEip1193 | undefined) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve(provider);
    }

    function onAnnounce(event: Event) {
      const { detail } = event as CustomEvent<LedgerWalletProviderDetail>;
      if (detail?.info?.rdns !== LEDGER_WALLET_PROVIDER_RDNS) return;

      settle(detail.provider);
    }

    const timer = setTimeout(() => settle(undefined), timeout);

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  });
}

let initialization: Promise<() => void> | undefined;

export function initializeLedgerWalletProvider(
  options: InitializeLedgerWalletProviderOptions = {},
): Promise<() => void> {
  if (initialization) return initialization;

  initialization = mountLedgerWalletProvider(options).catch((error) => {
    initialization = undefined;
    throw error;
  });

  return initialization;
}

export async function teardownLedgerWalletProvider() {
  const cleanup = await initialization;
  initialization = undefined;
  cleanup?.();
}

async function mountLedgerWalletProvider(options: InitializeLedgerWalletProviderOptions) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new SwapKitError("wallet_ledger_wallet_provider_unsupported_platform", {
      message: "Requires a browser environment.",
    });
  }

  const [{ initializeLedgerProvider }] = await Promise.all([
    import("@ledgerhq/ledger-wallet-provider"),
    import("@ledgerhq/ledger-wallet-provider/styles.css"),
  ]);

  return initializeLedgerProvider(options);
}

export async function resolveLedgerWalletProvider({
  provider,
  initialize = true,
  discoveryTimeout = DEFAULT_DISCOVERY_TIMEOUT,
  ...initializeOptions
}: ConnectLedgerWalletProviderOptions = {}) {
  if (provider) return provider;

  const announced = await discoverLedgerWalletProvider({
    timeout: initialize ? ANNOUNCED_PROVIDER_PROBE_TIMEOUT : discoveryTimeout,
  });
  if (announced) return announced;

  if (!initialize) {
    throw new SwapKitError("wallet_ledger_wallet_provider_not_announced", {
      message: "No Ledger provider announced; initialize the SDK or pass provider.",
    });
  }

  await initializeLedgerWalletProvider(initializeOptions);

  const initialized = await discoverLedgerWalletProvider({ timeout: discoveryTimeout });

  if (!initialized) {
    throw new SwapKitError("wallet_ledger_wallet_provider_not_announced", {
      message: "Ledger provider did not announce; WebHID or Bluetooth unavailable.",
    });
  }

  return initialized;
}

const LEDGER_HANDLED_METHODS = new Set([
  "eth_chainId",
  "eth_sendRawTransaction",
  "eth_sendTransaction",
  "eth_sign",
  "eth_signRawTransaction",
  "eth_signTransaction",
  "eth_signTypedData",
  "eth_signTypedData_v4",
  "personal_sign",
  "wallet_switchEthereumChain",
]);

export async function createLedgerEip1193Adapter({
  chain,
  getAddress,
  provider,
}: {
  chain: EVMChain;
  getAddress: () => string;
  provider: LedgerWalletProviderEip1193;
}) {
  const { JsonRpcProvider } = await import("ethers");
  const rpcUrl = await getRPCUrl(chain);
  const rpcProvider = new JsonRpcProvider(rpcUrl, Number(getChainConfig(chain).chainId), { staticNetwork: true });

  const eip1193Provider: Eip1193Provider = {
    request: ({ method, params }) => {
      switch (method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return Promise.resolve([getAddress()]);
        case "wallet_addEthereumChain":
          return Promise.resolve(null);
        default:
          if (LEDGER_HANDLED_METHODS.has(method)) return provider.request({ method, params: params ?? [] });

          return rpcProvider.send(method, Array.isArray(params) ? params : params ? [params] : []);
      }
    },
  };

  return { destroy: () => rpcProvider.destroy(), provider: eip1193Provider };
}
