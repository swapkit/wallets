import { beforeEach, describe, expect, it, mock } from "bun:test";
import type Transport from "@ledgerhq/hw-transport";

// Registries that capture constructor invocations on the mocked Ledger apps.
// Tests assert that each inner-factory call wires through its own transport
// rather than cross-contaminating via a shared outer closure.
const bitcoinAppInvocations: Array<{ currency: string; transport: unknown }> = [];
const psbtAppClientInvocations: Array<unknown> = [];

mock.module("@ledgerhq/hw-app-btc", () => ({
  default: class MockBitcoinApp {
    constructor(opts: { currency: string; transport: unknown }) {
      bitcoinAppInvocations.push(opts);
    }
  },
}));

mock.module("ledger-bitcoin", () => ({
  AppClient: class MockAppClient {
    constructor(transport: unknown) {
      psbtAppClientInvocations.push(transport);
    }
    getMasterFingerprint = async () => "deadbeef";
  },
  DefaultWalletPolicy: class MockDefaultWalletPolicy {
    constructor(_template: string, _key: string) {}
  },
}));

import { BitcoinLedger } from "../src/ledger/clients/utxo";
import { BitcoinPsbtLedger } from "../src/ledger/clients/utxo-psbt";

describe("wallet-hardware/ledger — closure isolation with injected transport", () => {
  beforeEach(() => {
    bitcoinAppInvocations.length = 0;
    psbtAppClientInvocations.length = 0;
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
});
