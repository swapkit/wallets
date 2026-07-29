import { describe, expect, test } from "bun:test";
import { Chain } from "@swapkit/helpers";

import { createKeystoreWallet, KEYSTORE_SUPPORTED_CHAINS } from "../src/keystore";

// Well-known BIP39 test vector — never holds funds.
const TEST_PHRASE = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("keystore supported chains", () => {
  test("includes Hypercore (HYPE) and HyperEVM", () => {
    expect(KEYSTORE_SUPPORTED_CHAINS).toContain(Chain.Hype);
    expect(KEYSTORE_SUPPORTED_CHAINS).toContain(Chain.Hyperevm);
  });

  test("derives EVM-format addresses for Hypercore and HyperEVM from a phrase", async () => {
    const wallets = await createKeystoreWallet({
      chains: [Chain.Hype, Chain.Hyperevm, Chain.Ethereum],
      phrase: TEST_PHRASE,
    });

    expect(wallets[Chain.Hype]?.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(wallets[Chain.Hyperevm]?.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // HyperEVM shares the standard eth path, so it must match the Ethereum address.
    expect(wallets[Chain.Hyperevm]?.address).toBe(wallets[Chain.Ethereum]?.address ?? "");
  });
});
