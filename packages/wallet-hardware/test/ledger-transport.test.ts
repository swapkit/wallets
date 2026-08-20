import { beforeEach, describe, expect, it, mock } from "bun:test";
import { DeviceActionStatus, type DeviceManagementKit } from "@ledgerhq/device-management-kit";
import type Transport from "@ledgerhq/hw-transport";
import { Chain } from "@swapkit/helpers";
import { hexlify, Signature, Transaction } from "ethers";
import { of } from "rxjs";

// Registries that capture constructor invocations on the mocked Ledger apps.
// Tests assert that each inner-factory call wires through its own transport
// rather than cross-contaminating via a shared outer closure.
const bitcoinAppInvocations: Array<{ currency: string; transport: unknown }> = [];
const bitcoinAppXpubInvocations: Array<{ path: string; xpubVersion?: number }> = [];
const ethereumBuilderInvocations: Array<{ dmk: unknown; originToken?: string; sessionId: string }> = [];
const ethereumGetAddressInvocations: Array<{ options?: { chainId?: number; checkOnDevice?: boolean }; path: string }> =
  [];
const ethereumSignMessageInvocations: Array<{ message: string | Uint8Array; path: string }> = [];
const ethereumSignTransactionInvocations: Array<{ path: string; transaction: Uint8Array }> = [];
const ethereumSignTypedDataInvocations: Array<{
  path: string;
  typedData: {
    domain: Record<string, unknown>;
    message: Record<string, unknown>;
    primaryType: string;
    types: Record<string, Array<{ name: string; type: string }>>;
  };
}> = [];
let ethereumTransactionSignatureV = 84357;

function deviceAction<Output>(output: Output) {
  return {
    cancel: mock(() => {}),
    observable: of(
      { intermediateValue: { requiredUserInteraction: "confirm-on-device" }, status: DeviceActionStatus.Pending },
      { output, status: DeviceActionStatus.Completed },
    ),
  };
}

mock.module("@ledgerhq/hw-app-btc", () => ({
  default: class MockBitcoinApp {
    private readonly currency: string;
    private readonly transport: { send?: (...params: unknown[]) => Promise<unknown> };

    constructor(opts: { currency: string; transport: unknown }) {
      bitcoinAppInvocations.push(opts);
      this.currency = opts.currency;
      this.transport = opts.transport as { send?: (...params: unknown[]) => Promise<unknown> };
    }
    getWalletPublicKey = async () => {
      await this.transport.send?.(0xe0, 0x40, 0, 0, Buffer.alloc(0));
      return { bitcoinAddress: `${this.currency.toLowerCase().replace(" ", "-")}-ledger-address` };
    };
    getWalletXpub = ({ path, xpubVersion }: { path: string; xpubVersion?: number }) => {
      bitcoinAppXpubInvocations.push({ path, xpubVersion });
      return "Ltub2SSUS19CirucV6jZg6pTzmtZtxhX1JZJYK7Uq16czQkfFb5m1zf6KV24enP679G9gYHDBYSjbgHn6CJK7VTqDEEnRSsUgJGQWhhmLQV5foV";
    };
  },
}));

mock.module("@ledgerhq/device-signer-kit-ethereum", () => ({
  SignerEthBuilder: class MockSignerEthBuilder {
    constructor(params: { dmk: unknown; originToken?: string; sessionId: string }) {
      ethereumBuilderInvocations.push(params);
    }
    build = () => ({
      getAddress: (path: string, options?: { chainId?: number; checkOnDevice?: boolean }) => {
        ethereumGetAddressInvocations.push({ options, path });
        return deviceAction({
          address: "0x0000000000000000000000000000000000000001",
          publicKey: "0xledger-public-key",
        });
      },
      signMessage: (path: string, message: string | Uint8Array) => {
        ethereumSignMessageInvocations.push({ message, path });
        return deviceAction({ r: `0x${"1".padStart(64, "0")}`, s: `0x${"2".padStart(64, "0")}`, v: 27 });
      },
      signTransaction: (path: string, transaction: Uint8Array) => {
        ethereumSignTransactionInvocations.push({ path, transaction });
        return deviceAction({
          r: `0x${"1".padStart(64, "0")}`,
          s: `0x${"2".padStart(64, "0")}`,
          v: ethereumTransactionSignatureV,
        });
      },
      signTypedData: (
        path: string,
        typedData: {
          domain: Record<string, unknown>;
          message: Record<string, unknown>;
          primaryType: string;
          types: Record<string, Array<{ name: string; type: string }>>;
        },
      ) => {
        ethereumSignTypedDataInvocations.push({ path, typedData });
        return deviceAction({ r: `0x${"1".padStart(64, "0")}`, s: `0x${"2".padStart(64, "0")}`, v: 27 });
      },
    });
  },
}));

import { BitcoinLedger } from "../src/ledger/clients/bitcoin";
import { ArbitrumLedger, BinanceSmartChainLedger } from "../src/ledger/clients/evm";
import { getLedgerClient } from "../src/ledger/helpers";
import { ledgerWallet } from "../src/ledger/index";

const dmkSession = { dmk: { id: "test-dmk" } as unknown as DeviceManagementKit, sessionId: "test-session" };

describe("wallet-hardware/ledger", () => {
  beforeEach(() => {
    bitcoinAppInvocations.length = 0;
    bitcoinAppXpubInvocations.length = 0;
    ethereumBuilderInvocations.length = 0;
    ethereumGetAddressInvocations.length = 0;
    ethereumSignMessageInvocations.length = 0;
    ethereumSignTransactionInvocations.length = 0;
    ethereumSignTypedDataInvocations.length = 0;
    ethereumTransactionSignatureV = 84357;
  });

  it("BitcoinLedger: two invocations with different transports get their own BitcoinApp each", async () => {
    const transportA = { id: "A" } as unknown as Transport;
    const transportB = { id: "B" } as unknown as Transport;

    const clientA = BitcoinLedger({ derivationPath: "84'/0'/0'/0/0", transport: transportA });
    const clientB = BitcoinLedger({ derivationPath: "84'/0'/0'/0/1", transport: transportB });

    await clientA.connect();
    await clientB.connect();

    expect(bitcoinAppInvocations).toHaveLength(2);
    expect(bitcoinAppInvocations[0]?.transport).toBe(transportA);
    expect(bitcoinAppInvocations[1]?.transport).toBe(transportB);
  });

  it("BitcoinLedger: reusing the same transport across calls does not deduplicate state", async () => {
    // Same transport instance passed twice should still produce two distinct
    // BitcoinApp instances — each call's inner closure owns its btcApp.
    const transport = { id: "shared" } as unknown as Transport;

    const clientA = BitcoinLedger({ derivationPath: "84'/0'/0'/0/0", transport });
    const clientB = BitcoinLedger({ derivationPath: "84'/0'/0'/0/1", transport });

    await clientA.connect();
    await clientB.connect();

    expect(bitcoinAppInvocations).toHaveLength(2);
    expect(bitcoinAppInvocations[0]?.transport).toBe(transport);
    expect(bitcoinAppInvocations[1]?.transport).toBe(transport);
  });

  it("BitcoinLedger: getExtendedPublicKey initializes the Bitcoin app before connect", async () => {
    const transport = { id: "xpub" } as unknown as Transport;
    const client = BitcoinLedger({ derivationPath: "84'/0'/0'/0/0", transport });

    const xpub = await client.getExtendedPublicKey({ path: "84'/0'/0'" });

    expect(xpub).toBe(
      "Ltub2SSUS19CirucV6jZg6pTzmtZtxhX1JZJYK7Uq16czQkfFb5m1zf6KV24enP679G9gYHDBYSjbgHn6CJK7VTqDEEnRSsUgJGQWhhmLQV5foV",
    );
    expect(bitcoinAppInvocations).toHaveLength(1);
    expect(bitcoinAppInvocations[0]?.transport).toBe(transport);
    expect(bitcoinAppXpubInvocations).toEqual([{ path: "84'/0'/0'", xpubVersion: 76067358 }]);
  });

  it("ArbitrumLedger: reuses one DSK signer and passes transaction bytes", async () => {
    const provider = {} as Parameters<typeof ArbitrumLedger>[0]["provider"];
    const actionStatuses: string[] = [];
    const client = ArbitrumLedger({
      dmkSession,
      onDeviceActionState: ({ status }) => actionStatuses.push(status),
      originToken: "ledger-origin-token",
      provider,
    });

    await client.getAddress();
    const signedTx = await client.signTransaction({
      data: "0x",
      gasLimit: 21000n,
      gasPrice: 1n,
      nonce: 0,
      to: "0x0000000000000000000000000000000000000002",
      type: 0,
      value: 0n,
    });

    expect(ethereumBuilderInvocations).toEqual([
      { dmk: dmkSession.dmk, originToken: "ledger-origin-token", sessionId: "test-session" },
    ]);
    expect(ethereumGetAddressInvocations).toEqual([{ options: { chainId: 42161 }, path: "44'/60'/0'/0/0" }]);
    expect(ethereumSignTransactionInvocations).toHaveLength(1);
    expect(hexlify(ethereumSignTransactionInvocations[0]?.transaction ?? new Uint8Array())).toBe(
      Transaction.from({
        chainId: 42161,
        data: "0x",
        gasLimit: 21000n,
        gasPrice: 1n,
        nonce: 0,
        to: "0x0000000000000000000000000000000000000002",
        type: 0,
        value: 0n,
      }).unsignedSerialized,
    );
    expect(Transaction.from(signedTx)).toMatchObject({ chainId: 42161n, type: 0 });
    expect(actionStatuses).toEqual(["pending", "completed", "pending", "completed"]);
  });

  it("BinanceSmartChainLedger: accepts the EIP-155 v returned by DSK", async () => {
    ethereumTransactionSignatureV = 147;
    const provider = {} as Parameters<typeof BinanceSmartChainLedger>[0]["provider"];
    const client = BinanceSmartChainLedger({ dmkSession, provider });

    const signedTx = await client.signTransaction({
      data: "0x",
      gasLimit: 21000n,
      gasPrice: 1n,
      nonce: 0,
      to: "0x0000000000000000000000000000000000000002",
      type: 0,
      value: 0n,
    });

    expect(Transaction.from(signedTx).chainId).toBe(56n);
    expect(Transaction.from(signedTx).signature?.networkV).toBe(147n);
  });

  it("ArbitrumLedger: UTF-8 encodes personal messages for DSK", async () => {
    const provider = {} as Parameters<typeof ArbitrumLedger>[0]["provider"];
    const client = ArbitrumLedger({ dmkSession, provider });

    const signature = await client.signMessage("Zażółć 💩");

    expect(ethereumSignMessageInvocations).toHaveLength(1);
    expect(hexlify(ethereumSignMessageInvocations[0]?.message as Uint8Array)).toBe(
      hexlify(new TextEncoder().encode("Zażółć 💩")),
    );
    expect(ethereumSignMessageInvocations[0]?.path).toBe("44'/60'/0'/0/0");
    expect(Signature.from(signature).toJSON()).toMatchObject({
      r: `0x${"1".padStart(64, "0")}`,
      s: `0x${"2".padStart(64, "0")}`,
      v: 27,
    });
  });

  it("ArbitrumLedger: sends complete typed data to DSK", async () => {
    const provider = {} as Parameters<typeof ArbitrumLedger>[0]["provider"];
    const client = ArbitrumLedger({ dmkSession, provider });

    await client.signTypedData(
      {
        chainId: 42161n,
        name: "SwapKit",
        verifyingContract: "0x0000000000000000000000000000000000000002",
        version: "1",
      },
      { Message: [{ name: "contents", type: "string" }] },
      { contents: "full typed data" },
      "Message",
    );

    expect(ethereumSignTypedDataInvocations).toEqual([
      {
        path: "44'/60'/0'/0/0",
        typedData: {
          domain: {
            chainId: 42161,
            name: "SwapKit",
            verifyingContract: "0x0000000000000000000000000000000000000002",
            version: "1",
          },
          message: { contents: "full typed data" },
          primaryType: "Message",
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            Message: [{ name: "contents", type: "string" }],
          },
        },
      },
    ]);
  });

  it("ArbitrumLedger: preserves EIP-2930 access lists", async () => {
    const provider = {} as Parameters<typeof ArbitrumLedger>[0]["provider"];
    const client = ArbitrumLedger({ dmkSession, provider });
    const request = {
      accessList: [{ address: "0x0000000000000000000000000000000000000003", storageKeys: [`0x${"4".repeat(64)}`] }],
      data: "0x",
      gasLimit: 25000n,
      gasPrice: 1n,
      nonce: 1,
      to: "0x0000000000000000000000000000000000000002",
      type: 1,
      value: 0n,
    };

    await client.signTransaction(request);

    expect(hexlify(ethereumSignTransactionInvocations[0]?.transaction ?? new Uint8Array())).toBe(
      Transaction.from({ ...request, chainId: 42161 }).unsignedSerialized,
    );
  });

  it("ArbitrumLedger: preserves EIP-4844 transaction fields", async () => {
    const provider = {} as Parameters<typeof ArbitrumLedger>[0]["provider"];
    const client = ArbitrumLedger({ dmkSession, provider });
    const request = {
      accessList: [],
      blobVersionedHashes: [`0x01${"1".repeat(62)}`],
      data: "0x",
      gasLimit: 25000n,
      maxFeePerBlobGas: 2n,
      maxFeePerGas: 3n,
      maxPriorityFeePerGas: 1n,
      nonce: 2,
      to: "0x0000000000000000000000000000000000000002",
      type: 3,
      value: 0n,
    };

    await client.signTransaction(request);

    expect(hexlify(ethereumSignTransactionInvocations[0]?.transaction ?? new Uint8Array())).toBe(
      Transaction.from({ ...request, chainId: 42161 }).unsignedSerialized,
    );
  });

  it("ArbitrumLedger: resolves typed-data address names", async () => {
    const resolveName = mock((name: string) =>
      Promise.resolve(name === "vault.eth" ? "0x0000000000000000000000000000000000000004" : null),
    );
    const provider = { resolveName } as unknown as Parameters<typeof ArbitrumLedger>[0]["provider"];
    const client = ArbitrumLedger({ dmkSession, provider });

    await client.signTypedData(
      { chainId: 42161n, verifyingContract: "vault.eth" },
      { Message: [{ name: "recipient", type: "address" }] },
      { recipient: "vault.eth" },
    );

    expect(resolveName.mock.calls).toEqual([["vault.eth"]]);
    expect(ethereumSignTypedDataInvocations[0]?.typedData).toMatchObject({
      domain: { verifyingContract: "0x0000000000000000000000000000000000000004" },
      message: { recipient: "0x0000000000000000000000000000000000000004" },
    });
  });

  it("ArbitrumLedger: rejects a transaction from another account", async () => {
    const provider = {} as Parameters<typeof ArbitrumLedger>[0]["provider"];
    const client = ArbitrumLedger({ dmkSession, provider });

    await expect(
      client.signTransaction({
        from: "0x0000000000000000000000000000000000000002",
        gasLimit: 21000n,
        gasPrice: 1n,
        nonce: 0,
        to: "0x0000000000000000000000000000000000000003",
        type: 0,
      }),
    ).rejects.toThrow("wallet_ledger_invalid_params");
    expect(ethereumSignTransactionInvocations).toHaveLength(0);
  });

  it("getLedgerClient: rejects LedgerJS transport injection for EVM", async () => {
    const transport = { id: "legacy-evm" } as unknown as Transport;

    await expect(getLedgerClient({ chain: Chain.Arbitrum, transport })).rejects.toThrow("wallet_ledger_invalid_params");
  });

  it("BitcoinLedger: explicit transport creates a fresh app for each complete operation", async () => {
    const transport = { id: "reused-xpub" } as unknown as Transport;
    const client = BitcoinLedger({ derivationPath: "84'/0'/0'/0/0", transport });

    await client.getExtendedPublicKey({ path: "84'/0'/0'" });
    await client.connect();

    expect(bitcoinAppInvocations).toHaveLength(2);
    expect(bitcoinAppInvocations.map(({ transport: invokedTransport }) => invokedTransport)).toEqual([
      transport,
      transport,
    ]);
  });

  it("connectLedger: requests Litecoin account xpubs with the Litecoin version byte", async () => {
    const addChain = mock(() => {});
    const connectLedger = ledgerWallet.connectLedger.connectWallet({ addChain });
    const transport = { id: "LTC" } as unknown as Transport;

    await connectLedger([Chain.Litecoin], undefined, { transport });
    const walletMethods = addChain.mock.calls[0]?.[0] as
      | { getExtendedPublicKey?: (params?: { accountIndex?: number }) => Promise<{ xpub: string }> }
      | undefined;
    await walletMethods?.getExtendedPublicKey?.({ accountIndex: 0 });

    expect(bitcoinAppXpubInvocations).toEqual([{ path: "m/84'/2'/0'", xpubVersion: 27108450 }]);
  });
});
