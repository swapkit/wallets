import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Keypair, type PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import * as realHelpers from "@swapkit/helpers";
import { Chain, SwapKitError, WalletOption } from "@swapkit/helpers";
import * as realSolanaToolbox from "@swapkit/toolboxes/solana";
import * as realEvmExtensions from "@swapkit/wallet-extensions/evm-extensions";
import { getWallets } from "@wallet-standard/app";
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
let registersSolanaOnInit = false;
let rpcProviderCount = 0;

type StandardWallet = Parameters<ReturnType<typeof getWallets>["register"]>[0];
type SolanaSignInput = { account: { address: string }; transaction: Uint8Array; chain?: string };

const solanaKeypair = Keypair.generate();
const NEXT_SOLANA_KEYPAIR = Keypair.generate();
const solanaConnectCalls: number[] = [];
const solanaDisconnectCalls: number[] = [];
const solanaSignInputs: SolanaSignInput[] = [];
const solanaChangeListeners = new Set<(properties: { accounts?: readonly unknown[] }) => void>();
const solanaToolboxSigners: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> }[] = [];
const unregisterSolanaWallets: (() => void)[] = [];

let signSolanaTransaction: (transaction: Uint8Array) => Uint8Array = (transaction) => transaction;

function createSolanaAccount(keypair: Keypair) {
  return {
    address: keypair.publicKey.toBase58(),
    chains: ["solana:mainnet"] as const,
    features: ["solana:signMessage"] as const,
    publicKey: keypair.publicKey.toBytes(),
  };
}

const ledgerSolanaWallet: StandardWallet = {
  accounts: [],
  chains: ["solana:mainnet", "solana:devnet", "solana:testnet"],
  features: {
    "solana:signTransaction": {
      signTransaction: (...inputs: SolanaSignInput[]) => {
        solanaSignInputs.push(...inputs);
        return Promise.resolve(
          inputs.map(({ transaction }) => ({ signedTransaction: signSolanaTransaction(transaction) })),
        );
      },
      supportedTransactionVersions: ["legacy", 0],
      version: "1.0.0",
    },
    "standard:connect": {
      connect: () => {
        solanaConnectCalls.push(1);
        return Promise.resolve({ accounts: [createSolanaAccount(solanaKeypair)] });
      },
      version: "1.0.0",
    },
    "standard:disconnect": {
      disconnect: () => {
        solanaDisconnectCalls.push(1);
        return Promise.resolve();
      },
      version: "1.0.0",
    },
    "standard:events": {
      on: (_event: string, listener: (properties: { accounts?: readonly unknown[] }) => void) => {
        solanaChangeListeners.add(listener);
        return () => solanaChangeListeners.delete(listener);
      },
      version: "1.0.0",
    },
  },
  icon: "data:image/svg+xml;base64,PHN2Zy8+",
  name: "Ledger",
  version: "1.0.0",
};

function registerLedgerSolanaWallet() {
  unregisterSolanaWallets.push(getWallets().register(ledgerSolanaWallet));
}

function buildSolanaTransaction() {
  return new Transaction({
    blockhash: "11111111111111111111111111111111",
    feePayer: solanaKeypair.publicKey,
    lastValidBlockHeight: 1,
  }).add(
    SystemProgram.transfer({
      fromPubkey: solanaKeypair.publicKey,
      lamports: 1,
      toPubkey: NEXT_SOLANA_KEYPAIR.publicKey,
    }),
  );
}

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
const realSolanaToolboxSnapshot = { ...realSolanaToolbox };

mock.module("@swapkit/helpers", () => ({ ...realHelpers, getRPCUrl: () => Promise.resolve(RPC_URL) }));

mock.module("ethers", () => ({ BrowserProvider: MockBrowserProvider, JsonRpcProvider: MockJsonRpcProvider }));

mock.module("@swapkit/wallet-extensions/evm-extensions", () => ({
  getWeb3WalletMethods: (options: Record<string, unknown>) => {
    web3WalletMethodCalls.push(options);
    return Promise.resolve({ getBalance: () => Promise.resolve([]) });
  },
}));

mock.module("@swapkit/toolboxes/solana", () => ({
  getSolanaToolbox: ({ signer }: { signer: (typeof solanaToolboxSigners)[number] }) => {
    solanaToolboxSigners.push(signer);
    return { signTransaction: signer.signTransaction };
  },
}));

mock.module("@ledgerhq/ledger-wallet-provider", () => ({
  initializeLedgerProvider: (options: unknown) => {
    initializeCalls.push(options);
    announcesProvider = true;
    if (registersSolanaOnInit) registerLedgerSolanaWallet();

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
    registersSolanaOnInit = false;
    solanaConnectCalls.length = 0;
    solanaDisconnectCalls.length = 0;
    solanaSignInputs.length = 0;
    solanaToolboxSigners.length = 0;
    solanaChangeListeners.clear();
    signSolanaTransaction = (transaction) => transaction;

    const eventTarget = new EventTarget();
    eventTarget.addEventListener("eip6963:requestProvider", () => {
      if (announcesProvider) announceLedgerProvider();
    });

    Object.assign(globalThis, { document: { body: {} }, window: eventTarget });
  });

  afterEach(async () => {
    const { teardownLedgerWalletProvider } = await import("../src/ledger-wallet-provider");
    await teardownLedgerWalletProvider();
    for (const unregister of unregisterSolanaWallets.splice(0)) unregister();
  });

  afterAll(() => {
    mock.module("@swapkit/helpers", () => realHelpersSnapshot);
    mock.module("ethers", () => realEthersSnapshot);
    mock.module("@swapkit/wallet-extensions/evm-extensions", () => realEvmExtensionsSnapshot);
    mock.module("@swapkit/toolboxes/solana", () => realSolanaToolboxSnapshot);
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
    handleAccountsChanged?.([NEXT_ADDRESS]);
    while (addChainCalls.length < 2) await Bun.sleep(0);

    expect(addChainCalls.map(({ address }) => address)).toEqual([ADDRESS, NEXT_ADDRESS]);
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

  test("connects every supported chain from a single approval per chain family", async () => {
    const { ledgerWalletProviderWallet, LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS } = await import(
      "../src/ledger-wallet-provider"
    );
    const addChainCalls: Record<string, unknown>[] = [];
    registerLedgerSolanaWallet();

    await ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({
      addChain: (chainWallet) => addChainCalls.push(chainWallet as Record<string, unknown>),
    })([...LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS]);

    expect(addChainCalls.map(({ chain }) => chain)).toEqual([...LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS]);
    expect(ledgerRequests).toEqual([{ method: "eth_requestAccounts", params: undefined }]);
    expect(solanaConnectCalls).toEqual([1]);
  });

  test("supports exactly the SwapKit chains on Ledger Wallet's network list", async () => {
    const { LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS } = await import("../src/ledger-wallet-provider");
    const ledgerChainIds = ["1", "10", "56", "137", "146", "324", "4663", "5042", "8453", "42161", "43114", "59144"];

    const connectorChainIds = LEDGER_WALLET_PROVIDER_SUPPORTED_CHAINS.filter((chain) => chain !== Chain.Solana).map(
      (chain) => realHelpers.getChainConfig(chain).chainId as string,
    );

    expect(connectorChainIds.filter((chainId) => !ledgerChainIds.includes(chainId))).toEqual([]);
    expect(connectorChainIds).toHaveLength(ledgerChainIds.length - 1);
  });

  test("connects Solana through the Wallet Standard wallet without touching the EVM provider", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");
    const addChainCalls: Record<string, unknown>[] = [];
    registerLedgerSolanaWallet();

    await ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({
      addChain: (chainWallet) => addChainCalls.push(chainWallet as Record<string, unknown>),
    })([Chain.Solana]);

    expect(initializeCalls).toEqual([]);
    expect(ledgerRequests).toEqual([]);
    expect(solanaConnectCalls).toEqual([1]);
    expect(addChainCalls.map(({ chain }) => chain)).toEqual([Chain.Solana]);
    expect(addChainCalls[0]?.address).toBe(solanaKeypair.publicKey.toBase58());
    expect(addChainCalls[0]?.walletType).toBe(WalletOption.LEDGER_WALLET_PROVIDER);
    expect(solanaToolboxSigners[0]?.publicKey.equals(solanaKeypair.publicKey)).toBe(true);
  });

  test("initializes the SDK when the Solana wallet is not registered yet", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");
    registersSolanaOnInit = true;

    await ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({ addChain: () => {} })([Chain.Solana], {
      apiKey: "test-key",
      dAppIdentifier: "swapkit-test",
    });

    expect(initializeCalls).toEqual([{ apiKey: "test-key", dAppIdentifier: "swapkit-test" }]);
    expect(solanaConnectCalls).toEqual([1]);
  });

  test("throws when the Solana wallet never registers", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");

    await expect(
      ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({ addChain: () => {} })([Chain.Solana], {
        discoveryTimeout: 10,
      }),
    ).rejects.toThrow("wallet_ledger_wallet_provider_not_announced");
  });

  test("signs Solana transactions on the device", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");
    registerLedgerSolanaWallet();
    signSolanaTransaction = (bytes) => {
      const transaction = Transaction.from(bytes);
      transaction.partialSign(solanaKeypair);
      return transaction.serialize();
    };

    await ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({ addChain: () => {} })([Chain.Solana]);

    const signed = await solanaToolboxSigners[0]?.signTransaction(buildSolanaTransaction());

    expect(solanaSignInputs.map(({ account, chain }) => [account.address, chain])).toEqual([
      [solanaKeypair.publicKey.toBase58(), "solana:mainnet"],
    ]);
    expect(signed?.verifySignatures()).toBe(true);
  });

  test("rejects a Solana transaction the SDK returns unsigned", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");
    registerLedgerSolanaWallet();

    await ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({ addChain: () => {} })([Chain.Solana]);

    await expect(solanaToolboxSigners[0]?.signTransaction(buildSolanaTransaction())).rejects.toThrow(
      "wallet_ledger_wallet_provider_signing_unsupported",
    );
  });

  test("re-adds Solana when the Ledger account changes", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");
    const addChainCalls: Record<string, unknown>[] = [];
    registerLedgerSolanaWallet();

    await ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({
      addChain: (chainWallet) => addChainCalls.push(chainWallet as Record<string, unknown>),
    })([Chain.Solana]);

    const [handleChange] = [...solanaChangeListeners];
    handleChange?.({ accounts: [] });
    handleChange?.({ accounts: [createSolanaAccount(NEXT_SOLANA_KEYPAIR)] });
    while (addChainCalls.length < 2) await Bun.sleep(0);

    expect(addChainCalls.map(({ address }) => address)).toEqual([
      solanaKeypair.publicKey.toBase58(),
      NEXT_SOLANA_KEYPAIR.publicKey.toBase58(),
    ]);
  });

  test("disconnect tears down both the EVM provider and the Solana wallet", async () => {
    const { ledgerWalletProviderWallet } = await import("../src/ledger-wallet-provider");
    const addChainCalls: Record<string, unknown>[] = [];
    registerLedgerSolanaWallet();

    await ledgerWalletProviderWallet.connectLedgerWalletProvider.connectWallet({
      addChain: (chainWallet) => addChainCalls.push(chainWallet as Record<string, unknown>),
    })([Chain.Ethereum, Chain.Solana]);

    await (addChainCalls[1]?.disconnect as () => Promise<void>)();

    expect(solanaChangeListeners.size).toBe(0);
    expect(solanaDisconnectCalls).toEqual([1]);
    expect(accountsChangedListeners.size).toBe(0);
    expect(providerDisconnectCalls).toEqual([1]);
  });

  test("loadWallet returns the Ledger Wallet Provider connector", async () => {
    const { loadWallet } = await import("../src/utils");

    const wallet = await loadWallet(WalletOption.LEDGER_WALLET_PROVIDER);

    expect(wallet).toHaveProperty("connectLedgerWalletProvider");
  });
});
