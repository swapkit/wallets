// The Ledger UI mounts as a light-DOM `<ledger-button-app class="ledger-wallet-provider">`
// host element that the SDK's global stylesheet styles.
import "@ledgerhq/ledger-wallet-provider/styles.css";

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
/**
 * The SDK re-announces synchronously on every `eip6963:requestProvider`, so a
 * provider the host app already mounted resolves within a tick. Anything longer
 * only delays the `initializeLedgerProvider` fallback.
 */
const ANNOUNCED_PROVIDER_PROBE_TIMEOUT = 250;

/**
 * Requests EIP-6963 announcements and resolves the Ledger Wallet Provider's
 * EIP-1193 provider, or `undefined` when none announces within `timeout`.
 */
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
    // Announcements are dispatched synchronously from this event, so an
    // already-mounted provider settles before `dispatchEvent` returns.
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  });
}

let initialization: Promise<() => void> | undefined;

/**
 * Loads and initializes the Ledger Wallet Provider SDK, mounting its UI and
 * announcing its EIP-1193 provider over EIP-6963. Idempotent — repeat calls
 * return the same teardown function and never mount a second UI.
 *
 * Host apps that want the Ledger UI inside their own layout can call this with
 * a `target` up front and pass the discovered provider to
 * `connectLedgerWalletProvider` via `options.provider`.
 */
export function initializeLedgerWalletProvider(
  options: InitializeLedgerWalletProviderOptions = {},
): Promise<() => void> {
  initialization ||= mountLedgerWalletProvider(options).catch((error) => {
    // Don't cache a failure — the next connect attempt gets to try again.
    initialization = undefined;
    throw error;
  });

  return initialization;
}

/** Removes the Ledger UI and lets the next `initializeLedgerWalletProvider` mount again. */
export async function teardownLedgerWalletProvider() {
  const cleanup = await initialization;
  initialization = undefined;
  cleanup?.();
}

async function mountLedgerWalletProvider(options: InitializeLedgerWalletProviderOptions) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new SwapKitError("wallet_ledger_wallet_provider_unsupported_platform", {
      message: "The Ledger Wallet Provider needs a browser environment (WebHID / Web Bluetooth).",
    });
  }

  // The SDK touches window/document at module scope — keep it out of SSR bundles.
  const { initializeLedgerProvider } = await import("@ledgerhq/ledger-wallet-provider");

  return initializeLedgerProvider(options);
}

/**
 * Resolves the provider to connect with: an injected one, one the page already
 * announced, or one from a fresh `initializeLedgerProvider` call.
 */
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
      message: "No Ledger Wallet Provider was announced. Initialize the SDK first or pass `options.provider`.",
    });
  }

  await initializeLedgerWalletProvider(initializeOptions);

  // The provider announces from the mounted web component's first render, so it
  // arrives a few ticks after `initializeLedgerProvider` returns.
  const initialized = await discoverLedgerWalletProvider({ timeout: discoveryTimeout });

  if (!initialized) {
    // `initializeLedgerProvider` bails out silently on platforms without
    // WebHID/Web Bluetooth (mobile browsers), leaving nothing to announce.
    throw new SwapKitError("wallet_ledger_wallet_provider_not_announced", {
      message:
        "The Ledger Wallet Provider did not announce itself. Ledger Wallet needs a desktop browser with WebHID or Web Bluetooth support.",
    });
  }

  return initialized;
}

/**
 * Methods the Ledger provider owns. Everything else goes to the chain's SwapKit
 * RPC: the provider rejects most read methods outright (EIP-1193 4200), and the
 * handful it does proxy (`eth_call`, `eth_getBalance`, `eth_estimateGas`, …) it
 * proxies against its own selected chain — which is the wrong chain for every
 * adapter but the one currently being signed on.
 */
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

/**
 * Fans an EIP-1193 surface out over the Ledger provider (accounts, chain
 * selection and signing) and the chain's SwapKit RPC (reads), so the standard
 * `getWeb3WalletMethods` → `getEvmToolboxAsync` path works unchanged.
 *
 * `eth_chainId` and `wallet_switchEthereumChain` deliberately go to Ledger:
 * the provider signs against a single selected chain, and `prepareNetworkSwitch`
 * (applied by `getWeb3WalletMethods`) uses those two methods to pin it to the
 * chain being used before every write.
 */
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
        // Answered locally: the Ledger provider serializes account requests and
        // rejects concurrent ones with "Ledger Provider is busy", and
        // `eth_requestAccounts` would re-open its account-selection modal.
        case "eth_accounts":
        case "eth_requestAccounts":
          return Promise.resolve([getAddress()]);
        // Ledger Wallet exposes a fixed network list, so there is nothing to add.
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
