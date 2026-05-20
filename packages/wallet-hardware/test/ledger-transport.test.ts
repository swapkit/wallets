import { beforeEach, describe, expect, it, mock } from "bun:test";
import type Transport from "@ledgerhq/hw-transport";
import { Chain } from "@swapkit/helpers";
import { Transaction } from "ethers";

// Registries that capture constructor invocations on the mocked Ledger apps.
// Tests assert that each inner-factory call wires through its own transport
// rather than cross-contaminating via a shared outer closure.
const bitcoinAppInvocations: Array<{ currency: string; transport: unknown }> = [];
const bitcoinAppXpubInvocations: Array<{ path: string; xpubVersion?: number }> = [];
const psbtAppClientInvocations: Array<unknown> = [];
const psbtExtendedPubkeyInvocations: string[] = [];
const psbtWalletAddressInvocations: Array<{ addressIndex: number; change: number }> = [];
const ethereumAppInvocations: Array<unknown> = [];
const ethereumSignTransactionInvocations: string[] = [];
let ethereumSignatureV = "014985";

mock.module("@ledgerhq/hw-app-btc", () => ({
  default: class MockBitcoinApp {
    constructor(opts: { currency: string; transport: unknown }) {
      bitcoinAppInvocations.push(opts);
    }
    getWalletPublicKey = async () => ({ bitcoinAddress: "ltc1qtestaddress" });
    getWalletXpub = ({ path, xpubVersion }: { path: string; xpubVersion?: number }) => {
      bitcoinAppXpubInvocations.push({ path, xpubVersion });
      return "Ltub2SSUS19CirucV6jZg6pTzmtZtxhX1JZJYK7Uq16czQkfFb5m1zf6KV24enP679G9gYHDBYSjbgHn6CJK7VTqDEEnRSsUgJGQWhhmLQV5foV";
    };
  },
}));

mock.module("ledger-bitcoin", () => ({
  AppClient: class MockAppClient {
    constructor(transport: unknown) {
      psbtAppClientInvocations.push(transport);
    }
    getMasterFingerprint = async () => "deadbeef";
    getExtendedPubkey = (path: string) => {
      psbtExtendedPubkeyInvocations.push(path);
      return "xpub661MyMwAqRbcF8SxkT6wT9y6rL4n9wBEmc6kAMPxQ4vYXvyfZ87Z84qxdjQbaAWkj2rW6zGyFNR7fsRG3Gzdhvj1io8GZF1dgNpTiFqouBZ";
    };
    getWalletAddress = (_policy: unknown, _hmac: unknown, change: number, addressIndex: number) => {
      psbtWalletAddressInvocations.push({ addressIndex, change });
      return "bc1qtestaddress";
    };
  },
  DefaultWalletPolicy: class MockDefaultWalletPolicy {
    // biome-ignore lint/complexity/noUselessConstructor: skip for tests
    constructor(_template: string, _key: string) {}
  },
}));

mock.module("@ledgerhq/hw-app-eth", () => ({
  default: class MockEthereumApp {
    constructor(transport: unknown) {
      ethereumAppInvocations.push(transport);
    }
    getAddress = async () => ({ address: "0x0000000000000000000000000000000000000001" });
    signTransaction = (_path: string, unsignedTx: string) => {
      ethereumSignTransactionInvocations.push(unsignedTx);
      return { r: "1".padStart(64, "0"), s: "2".padStart(64, "0"), v: ethereumSignatureV };
    };
  },
  ledgerService: { resolveTransaction: async () => null },
}));

import { ArbitrumLedger, BinanceSmartChainLedger } from "../src/ledger/clients/evm";
import { BitcoinLedger } from "../src/ledger/clients/utxo";
import { BitcoinPsbtLedger } from "../src/ledger/clients/utxo-psbt";
import { ledgerWallet } from "../src/ledger/index";

describe("wallet-hardware/ledger — closure isolation with injected transport", () => {
  beforeEach(() => {
    bitcoinAppInvocations.length = 0;
    bitcoinAppXpubInvocations.length = 0;
    psbtAppClientInvocations.length = 0;
    psbtExtendedPubkeyInvocations.length = 0;
    psbtWalletAddressInvocations.length = 0;
    ethereumAppInvocations.length = 0;
    ethereumSignTransactionInvocations.length = 0;
    ethereumSignatureV = "014985";
  });

  it("BitcoinLedger: two invocations with different transports get their own BitcoinApp each", async () => {
    const transportA = { id: "A" } as unknown as Transport;
    const transportB = { id: "B" } as unknown as Transport;

    const clientA = BitcoinLedger("84'/0'/0'/0/0", transportA);
    const clientB = BitcoinLedger("84'/0'/0'/0/1", transportB);

    await clientA.connect();
    await clientB.connect();

    expect(bitcoinAppInvocations).toHaveLength(2);
    expect(bitcoinAppInvocations[0]?.transport).toBe(transportA);
    expect(bitcoinAppInvocations[1]?.transport).toBe(transportB);
  });

  it("BitcoinPsbtLedger: two invocations with different transports get their own AppClient each", async () => {
    const transportA = { id: "A" } as unknown as Transport;
    const transportB = { id: "B" } as unknown as Transport;

    const clientA = BitcoinPsbtLedger("84'/0'/0'/0/0", transportA);
    const clientB = BitcoinPsbtLedger("84'/0'/0'/0/1", transportB);

    await clientA.connect();
    await clientB.connect();

    expect(psbtAppClientInvocations).toHaveLength(2);
    expect(psbtAppClientInvocations[0]).toBe(transportA);
    expect(psbtAppClientInvocations[1]).toBe(transportB);
  });

  it("BitcoinPsbtLedger: normalizes m/ derivation paths before requesting account xpubs", async () => {
    const transport = { id: "A" } as unknown as Transport;
    const client = BitcoinPsbtLedger("m/84'/0'/0'/0/0", transport);

    await client.getAddress();

    expect(psbtExtendedPubkeyInvocations).toEqual(["m/84'/0'/0'"]);
    expect(psbtWalletAddressInvocations).toEqual([{ addressIndex: 0, change: 0 }]);
  });

  it("BitcoinLedger: reusing the same transport across calls does not deduplicate state", async () => {
    // Same transport instance passed twice should still produce two distinct
    // BitcoinApp instances — each call's inner closure owns its btcApp.
    const transport = { id: "shared" } as unknown as Transport;

    const clientA = BitcoinLedger("84'/0'/0'/0/0", transport);
    const clientB = BitcoinLedger("84'/0'/0'/0/1", transport);

    await clientA.connect();
    await clientB.connect();

    expect(bitcoinAppInvocations).toHaveLength(2);
    expect(bitcoinAppInvocations[0]?.transport).toBe(transport);
    expect(bitcoinAppInvocations[1]?.transport).toBe(transport);
  });

  it("BitcoinLedger: getExtendedPublicKey initializes the Bitcoin app before connect", async () => {
    const transport = { id: "xpub" } as unknown as Transport;
    const client = BitcoinLedger("84'/0'/0'/0/0", transport);

    const xpub = await client.getExtendedPublicKey("84'/0'/0'", 76067358);

    expect(xpub).toBe(
      "Ltub2SSUS19CirucV6jZg6pTzmtZtxhX1JZJYK7Uq16czQkfFb5m1zf6KV24enP679G9gYHDBYSjbgHn6CJK7VTqDEEnRSsUgJGQWhhmLQV5foV",
    );
    expect(bitcoinAppInvocations).toHaveLength(1);
    expect(bitcoinAppInvocations[0]?.transport).toBe(transport);
    expect(bitcoinAppXpubInvocations).toEqual([{ path: "84'/0'/0'", xpubVersion: 76067358 }]);
  });

  it("ArbitrumLedger: reuses the Ethereum app initialized during connect for later transaction signing", async () => {
    const provider = {} as Parameters<typeof ArbitrumLedger>[0]["provider"];
    const transport = { id: "ARB" } as unknown as Transport;
    const client = ArbitrumLedger({ provider, transport });

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

    expect(ethereumAppInvocations).toEqual([transport]);
    expect(ethereumSignTransactionInvocations).toHaveLength(1);
    expect(Transaction.from(signedTx).chainId).toBe(42161n);
  });

  it("BinanceSmartChainLedger: parses single-byte legacy Ledger v as hex", async () => {
    ethereumSignatureV = "93";
    const provider = {} as Parameters<typeof BinanceSmartChainLedger>[0]["provider"];
    const transport = { id: "BSC" } as unknown as Transport;
    const client = BinanceSmartChainLedger({ provider, transport });

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
  });

  it("BitcoinLedger: connect reuses the app initialized by getExtendedPublicKey", async () => {
    const transport = { id: "reused-xpub" } as unknown as Transport;
    const client = BitcoinLedger("84'/0'/0'/0/0", transport);

    await client.getExtendedPublicKey("84'/0'/0'", 76067358);
    await client.connect();

    expect(bitcoinAppInvocations).toHaveLength(1);
    expect(bitcoinAppInvocations[0]?.transport).toBe(transport);
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
    expect(psbtAppClientInvocations).toHaveLength(0);
  });
});
