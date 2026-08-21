import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Chain, WalletOption } from "@swapkit/helpers";
import * as ethersModule from "ethers";

let balanceAddressCalls: string[] = [];

class MockEip1193Provider {
  accounts: string[];
  listeners = new Set<(accounts: string[]) => void>();
  requestAccountsCalls = 0;
  revokedPermissions = false;

  constructor(accounts: string[]) {
    this.accounts = accounts;
  }

  request({ method }: { method: string; params?: unknown[] }) {
    if (method === "eth_requestAccounts") {
      this.requestAccountsCalls += 1;
      return Promise.resolve(this.accounts);
    }
    if (method === "wallet_revokePermissions") {
      this.revokedPermissions = true;
      return Promise.resolve(null);
    }

    return Promise.resolve(null);
  }

  on(event: string, listener: (accounts: string[]) => void) {
    if (event === "accountsChanged") this.listeners.add(listener);
  }

  removeListener(event: string, listener: (accounts: string[]) => void) {
    if (event === "accountsChanged") this.listeners.delete(listener);
  }

  emitAccountsChanged(accounts: string[]) {
    this.accounts = accounts;
    for (const listener of this.listeners) listener(accounts);
  }
}

class MockBrowserProvider {
  constructor(readonly provider: MockEip1193Provider) {}

  send(method: string, params: unknown[]) {
    return this.provider.request({ method, params });
  }

  getSigner() {
    return Promise.resolve({ getAddress: () => Promise.resolve(this.provider.accounts[0]) });
  }

  getNetwork() {
    return Promise.resolve({ chainId: 1n });
  }
}

mock.module("ethers", () => ({ ...ethersModule, BrowserProvider: MockBrowserProvider }));

mock.module("@swapkit/toolboxes/evm", () => ({
  getEvmToolboxAsync: async () => ({
    getBalance: (address: string) => {
      balanceAddressCalls.push(address);
      return Promise.resolve([]);
    },
    validateAddress: () => true,
  }),
}));

describe("evm extensions wallet", () => {
  beforeEach(() => {
    balanceAddressCalls = [];
  });

  test("re-adds connected chains when the extension account changes", async () => {
    const firstAddress = "0x1111111111111111111111111111111111111111";
    const secondAddress = "0x2222222222222222222222222222222222222222";
    const provider = new MockEip1193Provider([firstAddress]);
    const addChainCalls: Record<string, unknown>[] = [];
    const chains = [Chain.Ethereum, Chain.Arbitrum];

    const { evmWallet } = await import("../src/evm-extensions");

    await evmWallet.connectEVMWallet.connectWallet({
      addChain: (chainWallet) => {
        addChainCalls.push(chainWallet as Record<string, unknown>);
      },
    })(chains, WalletOption.METAMASK, provider as never);

    expect(provider.requestAccountsCalls).toBe(1);
    expect(addChainCalls).toHaveLength(chains.length);
    expect(addChainCalls.map(({ address }) => address)).toEqual(chains.map(() => firstAddress));
    expect(addChainCalls.map(({ chain }) => chain)).toEqual(chains);
    expect(provider.listeners.size).toBe(1);

    provider.emitAccountsChanged([secondAddress]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(addChainCalls).toHaveLength(chains.length * 2);
    expect(addChainCalls.slice(chains.length).map(({ address }) => address)).toEqual(chains.map(() => secondAddress));
    expect(addChainCalls.slice(chains.length).map(({ chain }) => chain)).toEqual(chains);

    await (addChainCalls[2]?.getBalance as () => Promise<unknown[]>)();
    expect(balanceAddressCalls).toEqual([secondAddress]);

    await (addChainCalls[2]?.disconnect as () => Promise<unknown>)();
    expect(provider.revokedPermissions).toBe(true);
    expect(provider.listeners.size).toBe(0);
  });
});
