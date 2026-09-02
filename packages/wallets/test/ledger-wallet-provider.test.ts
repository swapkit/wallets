import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realHelpers from "@swapkit/helpers";
import { Chain, SwapKitError, WalletOption } from "@swapkit/helpers";
import * as realEvmExtensions from "@swapkit/wallet-extensions/evm-extensions";
import * as realEthers from "ethers";

const LEDGER_RDNS = "com.ledger.wallet.provider";
const ADDRESS = "0x1111111111111111111111111111111111111111";
const NEXT_ADDRESS = "0x2222222222222222222222222222222222222222";
const RPC_URL = "https://rpc.example/evm";

type ProviderRequest = { method: string; params?: unknown };
type Eip1193 = { request: (args: ProviderRequest) => Promise<unknown> };

const ledgerRequests: ProviderRequest[] = [];
const rpcRequests: ProviderRequest[] = [];
const destroyedRpcProviders: number[] = [];
const web3WalletMethodCalls: Record<string, unknown>[] = [];
const browserProviders: MockBrowserProvider[] = [];
const initializeCalls: unknown[] = [];
const teardownCalls: number[] = [];
const providerDisconnectCalls: number[] = [];
const accountsChangedListeners = new Set<(accounts: string[]) => void>();

let ledgerAccounts: string[] = [ADDRESS];
let announcesProvider = true;
let rpcProviderCount = 0;

class MockBrowserProvider {
  constructor(
    readonly walletProvider: Eip1193,
    readonly network: unknown,
  ) {
    browserProviders.push(this);
  }
}

class MockJsonRpcProvider {
  readonly id = rpcProviderCount++;

  constructor(
    readonly url: string,
    readonly network: unknown,
    readonly options: unknown,
  ) {}

  send(method: string, params: unknown[]) {
    rpcRequests.push({ method, params });
    return Promise.resolve(`rpc:${method}`);
  }

  destroy() {
    destroyedRpcProviders.push(this.id);
  }
}

const ledgerProvider = {
  disconnect: () => {
    providerDisconnectCalls.push(1);
    return Promise.resolve();
  },
  isConnected: () => true,
  on: (event: string, listener: (accounts: string[]) => void) => {
    if (event === "accountsChanged") accountsChangedListeners.add(listener);
  },
  removeListener: (event: string, listener: (accounts: string[]) => void) => {
    if (event === "accountsChanged") accountsChangedListeners.delete(listener);
  },
  request: ({ method, params }: ProviderRequest) => {
    ledgerRequests.push({ method, params });

    switch (method) {
      case "eth_requestAccounts":
        return Promise.resolve(ledgerAccounts);
      case "eth_chainId":
        return Promise.resolve("0x1");
      default:
        return Promise.resolve(`ledger:${method}`);
    }
  },
};

// Mirrors the SDK's announcer: it re-announces on every requestProvider event.
function announceLedgerProvider() {
  window.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail: {
        info: { icon: "data:,", name: "Ledger Wallet", rdns: LEDGER_RDNS, uuid: "ledger-uuid" },
        provider: ledgerProvider,
      },
    }),
  );
}

const realHelpersSnapshot = { ...realHelpers };
const realEthersSnapshot = { ...realEthers };
const realEvmExtensionsSnapshot = { ...realEvmExtensions };

// getRPCUrl probes the network for a live node — the adapter only needs a URL.
mock.module("@swapkit/helpers", () => ({ ...realHelpers, getRPCUrl: () => Promise.resolve(RPC_URL) }));

mock.module("ethers", () => ({ BrowserProvider: MockBrowserProvider, JsonRpcProvider: MockJsonRpcProvider }));

mock.module("@swapkit/wallet-extensions/evm-extensions", () => ({
  getWeb3WalletMethods: (options: Record<string, unknown>) => {
    web3WalletMethodCalls.push(options);
    return Promise.resolve({ getBalance: () => Promise.resolve([]) });
  },
}));

mock.module("@ledgerhq/ledger-wallet-provider", () => ({
  initializeLedgerProvider: (options: unknown) => {
    initializeCalls.push(options);
    announcesProvider = true;

    return () => teardownCalls.push(1);
  },
}));

mock.module("@ledgerhq/ledger-wallet-provider/styles.css", () => ({}));

describe("ledger wallet provider connector", () => {
  beforeEach(() => {
    ledgerRequests.length = 0;
    rpcRequests.length = 0;
    destroyedRpcProviders.length = 0;
    web3WalletMethodCalls.length = 0;
    browserProviders.length = 0;
    initializeCalls.length = 0;
    teardownCalls.length = 0;
    providerDisconnectCalls.length = 0;
    accountsChangedListeners.clear();
    ledgerAccounts = [ADDRESS];
    announcesProvider = true;

    const eventTarget = new EventTarget();
    eventTarget.addEventListener("eip6963:requestProvider", () => {
      if (announcesProvider) announceLedgerProvider();
    });

    // The SDK is browser-only; bun's test runtime has no DOM.
    Object.assign(globalThis, { document: { body: {} }, window: eventTarget });
  });

  afterEach(async () => {
    const { teardownLedgerWalletProvider } = await import("../src/ledger-wallet-provider");
    await teardownLedgerWalletProvider();
  });

  afterAll(() => {
    mock.module("@swapkit/helpers", () => realHelpersSnapshot);
    mock.module("ethers", () => realEthersSnapshot);
    mock.module("@swapkit/wallet-extensions/evm-extensions", () => realEvmExtensionsSnapshot);
  });

  test("registers LEDGER_WALLET_PROVIDER in the extensible WalletOption registry", async () => {
    await import("../src/ledger-wallet-provider");

    expect(WalletOption.LEDGER_WALLET_PROVIDER).toBe("LEDGER_WALLET_PROVIDER");
  });

  test("connects every requested chain through the announced provider", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");
    const addChainCalls: Record<string, unknown>[] = [];

    await ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({
      addChain: (chainWallet) => addChainCalls.push(chainWallet as Record<string, unknown>),
    })([Chain.Ethereum, Chain.Polygon]);

    // No initializeLedgerProvider call — the page had already announced one.
    expect(initializeCalls).toEqual([]);
    expect(ledgerRequests).toEqual([{ method: "eth_requestAccounts", params: undefined }]);
    expect(addChainCalls.map(({ chain }) => chain)).toEqual([Chain.Ethereum, Chain.Polygon]);
    expect(addChainCalls.map(({ address }) => address)).toEqual([ADDRESS, ADDRESS]);
    expect(addChainCalls.map(({ walletType }) => walletType)).toEqual([
      WalletOption.LEDGER_WALLET_PROVIDER,
      WalletOption.LEDGER_WALLET_PROVIDER,
    ]);
    expect(web3WalletMethodCalls.map(({ chain }) => chain)).toEqual([Chain.Ethereum, Chain.Polygon]);
    expect(accountsChangedListeners.size).toBe(1);
  });

  test("initializes the SDK when no provider is announced yet", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");
    announcesProvider = false;

    await ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({ addChain: () => {} })(
      [Chain.Ethereum],
      { apiKey: "test-key", dAppIdentifier: "swapkit-test", hideButton: true },
    );

    expect(initializeCalls).toEqual([{ apiKey: "test-key", dAppIdentifier: "swapkit-test", hideButton: true }]);
    expect(ledgerRequests).toEqual([{ method: "eth_requestAccounts", params: undefined }]);
  });

  test("routes signing to the device and reads to the chain RPC", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");

    await ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({ addChain: () => {} })([
      Chain.Ethereum,
    ]);
    ledgerRequests.length = 0;

    const adapter = browserProviders[0]?.walletProvider;

    // Answered locally: the device provider rejects concurrent account requests
    // and eth_requestAccounts would re-open its account picker.
    expect(await adapter?.request({ method: "eth_accounts" })).toEqual([ADDRESS]);
    expect(await adapter?.request({ method: "eth_requestAccounts" })).toEqual([ADDRESS]);
    expect(ledgerRequests).toEqual([]);

    expect(await adapter?.request({ method: "eth_chainId" })).toBe("0x1");
    expect(await adapter?.request({ method: "personal_sign", params: ["0xdead", ADDRESS] })).toBe(
      "ledger:personal_sign",
    );
    expect(await adapter?.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x89" }] })).toBe(
      "ledger:wallet_switchEthereumChain",
    );
    expect(ledgerRequests).toEqual([
      { method: "eth_chainId", params: [] },
      { method: "personal_sign", params: ["0xdead", ADDRESS] },
      { method: "wallet_switchEthereumChain", params: [{ chainId: "0x89" }] },
    ]);

    // Ledger Wallet exposes a fixed network list, so there is nothing to add.
    expect(await adapter?.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x89" }] })).toBe(null);

    expect(await adapter?.request({ method: "eth_getTransactionCount", params: [ADDRESS, "pending"] })).toBe(
      "rpc:eth_getTransactionCount",
    );
    expect(rpcRequests).toEqual([{ method: "eth_getTransactionCount", params: [ADDRESS, "pending"] }]);
  });

  test("re-adds the connected chains when the device switches account", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");
    const addChainCalls: Record<string, unknown>[] = [];

    await ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({
      addChain: (chainWallet) => addChainCalls.push(chainWallet as Record<string, unknown>),
    })([Chain.Ethereum]);

    const [handleAccountsChanged] = [...accountsChangedListeners];
    // The connector re-adds the chains in the background, off the event handler.
    handleAccountsChanged?.([NEXT_ADDRESS]);
    while (addChainCalls.length < 2) await Bun.sleep(0);

    expect(addChainCalls.map(({ address }) => address)).toEqual([ADDRESS, NEXT_ADDRESS]);
    // The read RPC does not depend on the account, so adapters are reused.
    expect(rpcProviderCount).toBeGreaterThan(0);
    expect(await browserProviders[0]?.walletProvider.request({ method: "eth_accounts" })).toEqual([NEXT_ADDRESS]);
  });

  test("ignores an accountsChanged event that repeats the connected address", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");
    const addChainCalls: Record<string, unknown>[] = [];

    await ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({
      addChain: (chainWallet) => addChainCalls.push(chainWallet as Record<string, unknown>),
    })([Chain.Ethereum]);

    const [handleAccountsChanged] = [...accountsChangedListeners];
    handleAccountsChanged?.([ADDRESS.toUpperCase()]);
    await Bun.sleep(5);

    expect(addChainCalls).toHaveLength(1);
  });

  test("disconnect drops the listener, the read providers and the device session", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");
    const addChainCalls: Record<string, unknown>[] = [];

    await ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({
      addChain: (chainWallet) => addChainCalls.push(chainWallet as Record<string, unknown>),
    })([Chain.Ethereum, Chain.Base]);

    await (addChainCalls[0]?.disconnect as () => Promise<void>)();

    expect(accountsChangedListeners.size).toBe(0);
    expect(destroyedRpcProviders).toHaveLength(2);
    expect(providerDisconnectCalls).toEqual([1]);
  });

  test("throws when the device returns no account", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");
    ledgerAccounts = [];

    let connectionError: unknown;
    try {
      await ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({ addChain: () => {} })([
        Chain.Ethereum,
      ]);
    } catch (error) {
      connectionError = error;
    }

    expect(connectionError).toBeInstanceOf(SwapKitError);
    expect(connectionError).toHaveProperty("errorKey", "wallet_ledger_wallet_provider_no_accounts");
  });

  test("throws instead of initializing when initialize is false", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");
    announcesProvider = false;

    let connectionError: unknown;
    try {
      await ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({ addChain: () => {} })(
        [Chain.Ethereum],
        { discoveryTimeout: 10, initialize: false },
      );
    } catch (error) {
      connectionError = error;
    }

    expect(connectionError).toHaveProperty("errorKey", "wallet_ledger_wallet_provider_not_announced");
    expect(initializeCalls).toEqual([]);
  });

  test("rejects chains outside Ledger Wallet's network list", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");

    await expect(
      ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({ addChain: () => {} })([Chain.Bitcoin]),
    ).rejects.toThrow("wallet_chain_not_supported");
  });

  test("supports exactly the SwapKit chains on Ledger Wallet's network list", async () => {
    const { LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS } = await import("../src/ledger-wallet-provider");
    // Ledger Wallet's own network list. zkSync (324) has no SwapKit chain, so
    // the connector covers the other ten.
    const ledgerChainIds = ["1", "10", "56", "137", "146", "324", "4663", "8453", "42161", "43114", "59144"];

    const connectorChainIds = LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS.map(
      (chain) => realHelpers.getChainConfig(chain).chainId as string,
    );

    expect(connectorChainIds.filter((chainId) => !ledgerChainIds.includes(chainId))).toEqual([]);
    expect(connectorChainIds).toHaveLength(ledgerChainIds.length - 1);
  });

  test("loadWallet returns the Ledger Wallet Provider connector", async () => {
    const { loadWallet } = await import("../src/utils");

    const wallet = await loadWallet(WalletOption.LEDGER_WALLET_PROVIDER);

    expect(wallet).toHaveProperty("connectLedgerWalletProvider");
  });
});
