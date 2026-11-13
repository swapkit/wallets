import { describe, expect, test } from "bun:test";
import { Chain } from "@swapkit/helpers";
import {
  buildKeystoreDerivation,
  type ChainDerivationConfig,
  type DerivationSettings,
  derivationIssueFor,
  hasDerivationIssue,
  invalidOverrideChains,
  singleWalletChainsOffDefaultPath,
} from "../derivation-presets";

const MAX_INDEX = 2 ** 31 - 1;

function customConfig(customPath: string): ChainDerivationConfig {
  return { customPath, index: 0, standard: "custom" };
}

function overrideSettings(chain: Chain, config: ChainDerivationConfig): DerivationSettings {
  return { accountIndex: 0, overrides: { [chain]: config } };
}

describe("a custom path the SDK would re-harden", () => {
  test("is refused instead of derived under hardening the user did not type", () => {
    expect(derivationIssueFor(Chain.Ethereum, customConfig("m/44/60/0/0/0"))).toBe("hardening");
    expect(derivationIssueFor(Chain.Bitcoin, customConfig("m/44/0/0/0/0"))).toBe("hardening");
  });

  test("still catches a half-hardened path on the curves where hardening decides the key", () => {
    expect(derivationIssueFor(Chain.Ethereum, customConfig("m/44'/60'/0/0/0"))).toBe("hardening");
    expect(derivationIssueFor(Chain.Bitcoin, customConfig("m/84'/0'/0'/0'/0"))).toBe("hardening");
    expect(derivationIssueFor(Chain.Avalanche, customConfig("m/44'/60'/0'/0/0'"))).toBe("hardening");
  });

  test("never reaches the connector", () => {
    expect(
      buildKeystoreDerivation([Chain.Ethereum], overrideSettings(Chain.Ethereum, customConfig("m/44/60/0/0/0"))),
    ).toEqual({});
  });

  test("blocks the connect button", () => {
    expect(invalidOverrideChains(overrideSettings(Chain.Ethereum, customConfig("m/44/60/0/0/0")))).toEqual([
      Chain.Ethereum,
    ]);
  });

  test("names the path that would have been derived instead", async () => {
    const { resolvedCustomPath } = await import("../derivation-presets");

    expect(resolvedCustomPath(Chain.Ethereum, "m/44/60/0/0/0")).toBe("m/44'/60'/0'/0/0");
  });

  test("leaves a correctly hardened path alone", () => {
    expect(derivationIssueFor(Chain.Ethereum, customConfig("m/44'/60'/0'/0/0"))).toBeNull();
    expect(derivationIssueFor(Chain.Bitcoin, customConfig("m/44'/0'/0'/0/0"))).toBeNull();

    expect(
      buildKeystoreDerivation([Chain.Ethereum], overrideSettings(Chain.Ethereum, customConfig("m/44'/60'/0'/0/0"))),
    ).toEqual({ [Chain.Ethereum]: [44, 60, 0, 0, 0] });
  });
});

describe("a chain whose curve derives every level hardened", () => {
  test("takes the path the ed25519 wallets print", () => {
    expect(derivationIssueFor(Chain.Solana, customConfig("m/44'/501'/0'/0'"))).toBeNull();

    expect(
      buildKeystoreDerivation([Chain.Solana], overrideSettings(Chain.Solana, customConfig("m/44'/501'/0'/0'"))),
    ).toEqual({ [Chain.Solana]: [44, 501, 0, 0] });

    expect(invalidOverrideChains(overrideSettings(Chain.Solana, customConfig("m/44'/501'/0'/0'")))).toEqual([]);
  });

  test("takes the unhardened spelling of the same path too", () => {
    expect(derivationIssueFor(Chain.Solana, customConfig("m/44'/501'/0'/0"))).toBeNull();

    expect(
      buildKeystoreDerivation([Chain.Solana], overrideSettings(Chain.Solana, customConfig("m/44'/501'/0'/0"))),
    ).toEqual({ [Chain.Solana]: [44, 501, 0, 0] });
  });

  test("derives one key from either spelling", async () => {
    const { createKeystoreWallet } = await import("@swapkit/wallet-keystore");
    const phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

    const addresses = await Promise.all(
      ["m/44'/501'/0'/0'", "m/44'/501'/0'/0"].map(async (path) => {
        const wallets = await createKeystoreWallet({
          chains: [Chain.Solana],
          derivationPathMapOrIndex: buildKeystoreDerivation(
            [Chain.Solana],
            overrideSettings(Chain.Solana, customConfig(path)),
          ) as never,
          phrase,
        });

        return wallets[Chain.Solana]?.address;
      }),
    );

    expect(addresses[0]).toBeTruthy();
    expect(addresses[0]).toBe(addresses[1] as string);
  });

  test("prints its own path the way it is derived", async () => {
    const { describeDerivation, resolvedCustomPath, resolvedPathFor } = await import("../derivation-presets");

    expect(resolvedCustomPath(Chain.Solana, "m/44'/501'/0'/0")).toBe("m/44'/501'/0'/0'");
    expect(resolvedPathFor(Chain.Solana, { accountIndex: 0, overrides: {} })).toBe("m/44'/501'/0'/0'");
    expect(describeDerivation(Chain.Solana, "m/44'/501'/0'/0'")).toBeNull();
    expect(describeDerivation(Chain.Solana, "m/44'/501'/0'/3")).toEqual({ format: null, index: 3, label: null });
  });
});

describe("the level count a chain actually derives on", () => {
  test("refuses a four-level path where the chain uses five", () => {
    expect(derivationIssueFor(Chain.Bitcoin, customConfig("m/84'/0'/0'/0"))).toBe("format");
    expect(derivationIssueFor(Chain.Litecoin, customConfig("m/84'/2'/0'/0"))).toBe("format");
  });

  test("refuses a five-level path on the four-level chains", () => {
    expect(derivationIssueFor(Chain.Solana, customConfig("m/44'/501'/0'/0/0"))).toBe("format");
  });

  test("keeps the four-level shape the EVM legacy standard hands out", () => {
    expect(derivationIssueFor(Chain.Ethereum, customConfig("m/44'/60'/0'/3"))).toBeNull();
  });

  test("keeps Solana's own four-level shape", () => {
    expect(derivationIssueFor(Chain.Solana, customConfig("m/44'/501'/0'/3"))).toBeNull();
  });
});

describe("the wallet index ceiling", () => {
  const overIndex: ChainDerivationConfig = { customPath: "", index: MAX_INDEX + 1, standard: "default" };

  test("refuses an index past the slot the SDK can encode", () => {
    expect(derivationIssueFor(Chain.Bitcoin, overIndex)).toBe("index");
    expect(derivationIssueFor(Chain.Bitcoin, { ...overIndex, index: MAX_INDEX })).toBeNull();
  });

  test("counts towards the chains that block the connect button", () => {
    expect(invalidOverrideChains(overrideSettings(Chain.Bitcoin, overIndex))).toEqual([Chain.Bitcoin]);
  });

  test("applies to the index that covers every chain too", () => {
    expect(hasDerivationIssue({ accountIndex: 99999999999, overrides: {} }, [])).toBe(true);
    expect(hasDerivationIssue({ accountIndex: MAX_INDEX, overrides: {} }, [])).toBe(false);
  });
});

describe("a chain that can only ever derive its default wallet", () => {
  const chains = [Chain.Ton, Chain.Ethereum];

  function defaultConfig(index: number): ChainDerivationConfig {
    return { customPath: "", index, standard: "default" };
  }

  test("is flagged when the wallet index covering every chain is not 0", () => {
    expect(singleWalletChainsOffDefaultPath(chains, { accountIndex: 1, overrides: {} })).toEqual([Chain.Ton]);
    expect(hasDerivationIssue({ accountIndex: 1, overrides: {} }, chains)).toBe(true);
  });

  test("is flagged when its own override sits at a non-zero index", () => {
    const settings = overrideSettings(Chain.Ton, defaultConfig(2));

    expect(singleWalletChainsOffDefaultPath(chains, settings)).toEqual([Chain.Ton]);
    expect(hasDerivationIssue(settings, chains)).toBe(true);
  });

  test("is flagged while another chain's override turns the wallet index into an explicit path", () => {
    const settings: DerivationSettings = { accountIndex: 4, overrides: { [Chain.Ethereum]: defaultConfig(4) } };

    expect(buildKeystoreDerivation(chains, settings)).toEqual({
      [Chain.Ethereum]: [44, 60, 0, 0, 4],
      [Chain.Ton]: [44, 607, 0, 0, 4],
    });
    expect(singleWalletChainsOffDefaultPath(chains, settings)).toEqual([Chain.Ton]);
    expect(hasDerivationIssue(settings, chains)).toBe(true);
  });

  test("takes a per-chain override at index 0 while every other chain keeps the higher index", () => {
    const settings: DerivationSettings = { accountIndex: 4, overrides: { [Chain.Ton]: defaultConfig(0) } };

    expect(singleWalletChainsOffDefaultPath(chains, settings)).toEqual([]);
    expect(hasDerivationIssue(settings, chains)).toBe(false);
    expect(buildKeystoreDerivation(chains, settings)).toEqual({
      [Chain.Ethereum]: [44, 60, 0, 0, 4],
      [Chain.Ton]: [44, 607, 0, 0, 0],
    });
  });

  test("leaves the chains that derive more than one wallet alone", () => {
    expect(
      singleWalletChainsOffDefaultPath([Chain.Ethereum, Chain.Bitcoin], { accountIndex: 5, overrides: {} }),
    ).toEqual([]);
  });

  test("is only weighed for the chains being connected", () => {
    expect(hasDerivationIssue({ accountIndex: 1, overrides: {} }, [Chain.Ethereum])).toBe(false);
  });
});
