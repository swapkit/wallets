import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realConnectMultichain from "@metamask/connect-multichain";
import { Chain, SwapKitError, WalletOption } from "@swapkit/helpers";
import * as realSolanaToolbox from "@swapkit/toolboxes/solana";
import * as realEvmExtensions from "@swapkit/wallet-extensions/evm-extensions";
import * as realEthers from "ethers";

const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const ETHEREUM_ADDRESS = "0x1111111111111111111111111111111111111111";
const SOLANA_ADDRESS = "11111111111111111111111111111111";

type InvokeOptions = { request: { method: string; params?: unknown }; scope: string };
type SessionData = { sessionScopes: Record<string, { accounts?: string[] }> };

const createClientOptions: unknown[] = [];
const connectCalls: Array<{ caipAccountIds: string[]; scopes: string[] }> = [];
const disconnectCalls: Array<string[] | undefined> = [];
const invokeCalls: InvokeOptions[] = [];
const web3WalletMethodCalls: Record<string, unknown>[] = [];
const solanaSigners: Record<string, unknown>[] = [];
const browserProviders: MockBrowserProvider[] = [];

let connectError: unknown;
let sessionData: SessionData | undefined;

class MockBrowserProvider {
  constructor(
    readonly walletProvider: { request: (request: { method: string; params?: unknown[] }) => Promise<unknown> },
    readonly network: unknown,
  ) {
    browserProviders.push(this);
  }
}

const mockClient = {
  connect: (scopes: string[], caipAccountIds: string[]) => {
    connectCalls.push({ caipAccountIds, scopes });
    if (connectError) return Promise.reject(connectError);
    return Promise.resolve();
  },
  disconnect: (scopes?: string[]) => {
    disconnectCalls.push(scopes);
    return Promise.resolve();
  },
  invokeMethod: (options: InvokeOptions) => {
    invokeCalls.push(options);
    return Promise.resolve("0x123");
  },
  provider: { getSession: async () => sessionData },
};

const realConnectMultichainSnapshot = { ...realConnectMultichain };
const realEthersSnapshot = { ...realEthers };
const realEvmExtensionsSnapshot = { ...realEvmExtensions };
const realSolanaToolboxSnapshot = { ...realSolanaToolbox };

mock.module("@metamask/connect-multichain", () => ({
  createMultichainClient: (options: unknown) => {
    createClientOptions.push(options);
    return Promise.resolve(mockClient);
  },
}));

mock.module("ethers", () => ({ BrowserProvider: MockBrowserProvider }));

mock.module("@swapkit/wallet-extensions/evm-extensions", () => ({
  getWeb3WalletMethods: (options: Record<string, unknown>) => {
    web3WalletMethodCalls.push(options);
    return Promise.resolve({ getBalance: () => Promise.resolve([]) });
  },
}));

mock.module("@swapkit/toolboxes/solana", () => ({
  getSolanaToolbox: ({ signer }: { signer: Record<string, unknown> }) => {
    solanaSigners.push(signer);
    return { getBalance: () => Promise.resolve([]), validateAddress: () => true };
  },
}));

describe("metamask multichain wallet", () => {
  beforeEach(() => {
    createClientOptions.length = 0;
    connectCalls.length = 0;
    disconnectCalls.length = 0;
    invokeCalls.length = 0;
    web3WalletMethodCalls.length = 0;
    solanaSigners.length = 0;
    browserProviders.length = 0;
    connectError = undefined;
    sessionData = {
      sessionScopes: {
        eip155: { accounts: [`eip155:1:${ETHEREUM_ADDRESS}`] },
        solana: { accounts: [`${SOLANA_MAINNET_CAIP2}:${SOLANA_ADDRESS}`] },
      },
    };
  });

  test("connects EVM and Solana through one CAIP-25 session", async () => {
    const { metamaskWallet } = await import("../src/metamask");
    const addChainCalls: Record<string, unknown>[] = [];
    const supportedNetworks = {
      "eip155:1": "https://ethereum.example/rpc",
      [SOLANA_MAINNET_CAIP2]: "https://solana.example/rpc",
    };

    await metamaskWallet.connectMetamask.connectWallet({
      addChain: (chainWallet) => addChainCalls.push(chainWallet as Record<string, unknown>),
    })([Chain.Ethereum, Chain.Solana], { dapp: { name: "SwapKit Test" }, supportedNetworks });

    expect(createClientOptions).toEqual([{ api: { supportedNetworks }, dapp: { name: "SwapKit Test" } }]);
    expect(connectCalls).toEqual([{ caipAccountIds: [], scopes: ["eip155:1", SOLANA_MAINNET_CAIP2] }]);
    expect(addChainCalls.map(({ chain }) => chain)).toEqual([Chain.Ethereum, Chain.Solana]);
    expect(addChainCalls.map(({ walletType }) => walletType)).toEqual([WalletOption.METAMASK, WalletOption.METAMASK]);
    expect(addChainCalls.map(({ address }) => address)).toEqual([ETHEREUM_ADDRESS, SOLANA_ADDRESS]);
    expect(web3WalletMethodCalls[0]?.chain).toBe(Chain.Ethereum);
    expect(web3WalletMethodCalls[0]?.address).toBe(ETHEREUM_ADDRESS);
    expect(solanaSigners[0]?.publicKey).toBeDefined();

    const eip1193Provider = browserProviders[0]?.walletProvider;
    expect(await eip1193Provider?.request({ method: "eth_accounts" })).toEqual([ETHEREUM_ADDRESS]);
    expect(await eip1193Provider?.request({ method: "eth_chainId" })).toBe("0x1");
    expect(await eip1193Provider?.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] })).toBe(
      null,
    );
    expect(await eip1193Provider?.request({ method: "eth_blockNumber", params: [] })).toBe("0x123");
    expect(invokeCalls).toEqual([{ request: { method: "eth_blockNumber", params: [] }, scope: "eip155:1" }]);

    await (addChainCalls[0]?.disconnect as () => Promise<void>)();
    expect(disconnectCalls).toEqual([["eip155:1"]]);
  });

  test("throws a SwapKitError when no multichain session exists", async () => {
    const { metamaskWallet } = await import("../src/metamask");
    sessionData = undefined;

    let connectionError: unknown;
    try {
      await metamaskWallet.connectMetamask.connectWallet({ addChain: () => {} })([Chain.Ethereum], {
        dapp: { name: "SwapKit Test" },
        supportedNetworks: { "eip155:1": "https://ethereum.example/rpc" },
      });
    } catch (error) {
      connectionError = error;
    }

    expect(connectionError).toBeInstanceOf(SwapKitError);
    expect(connectionError).not.toBeInstanceOf(TypeError);
    expect(connectionError).toHaveProperty("errorKey", "core_wallet_connection_not_found");
  });

  test("connects the granted subset when the wallet approves only some scopes", async () => {
    const { metamaskWallet } = await import("../src/metamask");
    const addChainCalls: Record<string, unknown>[] = [];
    sessionData = { sessionScopes: { eip155: { accounts: [`eip155:1:${ETHEREUM_ADDRESS}`] } } };

    await metamaskWallet.connectMetamask.connectWallet({
      addChain: (chainWallet) => addChainCalls.push(chainWallet as Record<string, unknown>),
    })([Chain.Ethereum, Chain.Solana], {
      dapp: { name: "SwapKit Test" },
      supportedNetworks: {
        "eip155:1": "https://ethereum.example/rpc",
        [SOLANA_MAINNET_CAIP2]: "https://solana.example/rpc",
      },
    });

    expect(addChainCalls.map(({ chain }) => chain)).toEqual([Chain.Ethereum]);
  });

  test("throws only when the wallet grants none of the requested scopes", async () => {
    const { metamaskWallet } = await import("../src/metamask");
    const addChainCalls: Record<string, unknown>[] = [];
    sessionData = { sessionScopes: {} };

    await expect(
      metamaskWallet.connectMetamask.connectWallet({
        addChain: (chainWallet) => addChainCalls.push(chainWallet as Record<string, unknown>),
      })([Chain.Ethereum, Chain.Solana], {
        dapp: { name: "SwapKit Test" },
        supportedNetworks: {
          "eip155:1": "https://ethereum.example/rpc",
          [SOLANA_MAINNET_CAIP2]: "https://solana.example/rpc",
        },
      }),
    ).rejects.toThrow("wallet_chain_not_supported");

    expect(addChainCalls).toEqual([]);
  });

  test("disconnects only the selected chain scope", async () => {
    const { metamaskWallet } = await import("../src/metamask");
    const addChainCalls: Record<string, unknown>[] = [];

    await metamaskWallet.connectMetamask.connectWallet({
      addChain: (chainWallet) => addChainCalls.push(chainWallet as Record<string, unknown>),
    })([Chain.Ethereum, Chain.Solana], {
      dapp: { name: "SwapKit Test" },
      supportedNetworks: {
        "eip155:1": "https://ethereum.example/rpc",
        [SOLANA_MAINNET_CAIP2]: "https://solana.example/rpc",
      },
    });

    const solanaWallet = addChainCalls.find(({ chain }) => chain === Chain.Solana);
    expect(solanaWallet).toBeDefined();
    await (solanaWallet?.disconnect as () => Promise<void>)();

    expect(disconnectCalls).toEqual([[SOLANA_MAINNET_CAIP2]]);
  });

  test("loadWallet returns the multichain MetaMask connector", async () => {
    const { loadWallet } = await import("../src/utils");

    const wallet = await loadWallet(WalletOption.METAMASK);

    expect(wallet).toHaveProperty("connectMetamask");
  });

  test("normalizes user rejection errors", async () => {
    const { metamaskWallet } = await import("../src/metamask");
    connectError = { code: 4001 };

    await expect(
      metamaskWallet.connectMetamask.connectWallet({ addChain: () => {} })([Chain.Ethereum], {
        dapp: { name: "SwapKit Test" },
        supportedNetworks: { "eip155:1": "https://ethereum.example/rpc" },
      }),
    ).rejects.toThrow("wallet_connection_rejected_by_user");
  });
});

afterAll(() => {
  mock.module("@metamask/connect-multichain", () => realConnectMultichainSnapshot);
  mock.module("ethers", () => realEthersSnapshot);
  mock.module("@swapkit/wallet-extensions/evm-extensions", () => realEvmExtensionsSnapshot);
  mock.module("@swapkit/toolboxes/solana", () => realSolanaToolboxSnapshot);
});
