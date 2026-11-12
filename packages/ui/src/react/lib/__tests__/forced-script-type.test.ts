import { describe, expect, test } from "bun:test";
import { Chain, UTXOScriptType } from "@swapkit/helpers";
import {
  allowsForcedScriptType,
  buildKeystoreDerivation,
  type ChainDerivationConfig,
  derivationBadgeText,
  derivationIssueFor,
  describeDerivation,
  forcedScriptTypeFor,
  invalidOverrideChains,
  isOffStandardScriptType,
  offersForcedScriptType,
  standardsFor,
} from "../derivation-presets";

function customConfig(customPath: string, forceScriptType?: UTXOScriptType): ChainDerivationConfig {
  return { customPath, forceScriptType, index: 0, standard: "custom" };
}

describe("allowsForcedScriptType", () => {
  test("covers the segwit-capable UTXO chains and nothing else", () => {
    expect(allowsForcedScriptType(Chain.Bitcoin)).toBe(true);
    expect(allowsForcedScriptType(Chain.Litecoin)).toBe(true);

    expect(allowsForcedScriptType(Chain.Dogecoin)).toBe(false);
    expect(allowsForcedScriptType(Chain.BitcoinCash)).toBe(false);
    expect(allowsForcedScriptType(Chain.Dash)).toBe(false);
    expect(allowsForcedScriptType(Chain.Zcash)).toBe(false);

    expect(allowsForcedScriptType(Chain.Ethereum)).toBe(false);
    expect(allowsForcedScriptType(Chain.Solana)).toBe(false);
  });
});

describe("offersForcedScriptType", () => {
  test("offers the control on a legacy custom path", () => {
    expect(offersForcedScriptType(Chain.Bitcoin, customConfig("m/44'/0'/0'/0/0"))).toBe(true);
  });

  test("stays off the named standards, however legacy they are", () => {
    expect(
      offersForcedScriptType(Chain.Bitcoin, {
        customPath: "",
        forceScriptType: undefined,
        index: 0,
        standard: "legacy",
      }),
    ).toBe(false);
  });

  test("stays off a path that already implies native segwit", () => {
    expect(offersForcedScriptType(Chain.Bitcoin, customConfig("m/84'/0'/0'/0/0"))).toBe(false);
  });

  test("stays off an unparseable path", () => {
    expect(offersForcedScriptType(Chain.Bitcoin, customConfig("nonsense"))).toBe(false);
  });
});

describe("forcedScriptTypeFor", () => {
  test("sends a deliberate choice through", () => {
    const config = customConfig("m/44'/0'/0'/0/0", UTXOScriptType.P2WPKH);
    expect(forcedScriptTypeFor(Chain.Bitcoin, config)).toBe(UTXOScriptType.P2WPKH);
  });

  test("drops a value the config no longer justifies", () => {
    expect(forcedScriptTypeFor(Chain.Bitcoin, customConfig("m/84'/0'/0'/0/0", UTXOScriptType.P2WPKH))).toBeUndefined();
    expect(
      forcedScriptTypeFor(Chain.Bitcoin, {
        customPath: "m/44'/0'/0'/0/0",
        forceScriptType: UTXOScriptType.P2WPKH,
        index: 0,
        standard: "legacy",
      }),
    ).toBeUndefined();
    expect(forcedScriptTypeFor(Chain.Dogecoin, customConfig("m/44'/3'/0'/0/0", UTXOScriptType.P2WPKH))).toBeUndefined();
  });
});

describe("derivationIssueFor", () => {
  test("reports a malformed path", () => {
    expect(derivationIssueFor(Chain.Bitcoin, customConfig("m/44"))).toBe("format");
  });

  test("accepts nested segwit and taproot, which now derive and spend", () => {
    expect(derivationIssueFor(Chain.Bitcoin, customConfig("m/49'/0'/0'/0/0"))).toBeNull();
    expect(derivationIssueFor(Chain.Bitcoin, customConfig("m/86'/0'/0'/0/0"))).toBeNull();
  });

  test("leaves those purposes alone on chains with no script type at all", () => {
    expect(derivationIssueFor(Chain.Solana, customConfig("m/49'/501'/0'/0'"))).toBeNull();
    expect(derivationIssueFor(Chain.Ethereum, customConfig("m/49'/60'/0'/0/0"))).toBeNull();
  });

  test("passes a plain legacy path", () => {
    expect(derivationIssueFor(Chain.Bitcoin, customConfig("m/44'/0'/0'/0/0"))).toBeNull();
  });

  test("drives the connect gate", () => {
    const settings = { accountIndex: 0 as const, overrides: { [Chain.Bitcoin]: customConfig("m/44") } };
    expect(invalidOverrideChains(settings)).toEqual([Chain.Bitcoin]);

    const parseable = { accountIndex: 0 as const, overrides: { [Chain.Bitcoin]: customConfig("m/49'/0'/0'/0/0") } };
    expect(invalidOverrideChains(parseable)).toEqual([]);
  });
});

describe("buildKeystoreDerivation", () => {
  test("states the encoding a UTXO path implies even when nothing is forced", () => {
    const payload = buildKeystoreDerivation([Chain.Bitcoin], {
      accountIndex: 0,
      overrides: { [Chain.Bitcoin]: customConfig("m/44'/0'/0'/0/0") },
    });

    expect(payload).toEqual({
      [Chain.Bitcoin]: { derivationPath: [44, 0, 0, 0, 0], scriptType: UTXOScriptType.P2PKH },
    });
  });

  test("carries a forced encoding on the chain it was set for, and the standard one elsewhere", () => {
    const payload = buildKeystoreDerivation([Chain.Bitcoin, Chain.Litecoin], {
      accountIndex: 0,
      overrides: { [Chain.Bitcoin]: customConfig("m/44'/0'/0'/0/0", UTXOScriptType.P2WPKH) },
    });

    expect(payload).toEqual({
      [Chain.Bitcoin]: { derivationPath: [44, 0, 0, 0, 0], scriptType: UTXOScriptType.P2WPKH },
      [Chain.Litecoin]: { derivationPath: [84, 2, 0, 0, 0], scriptType: UTXOScriptType.P2WPKH },
    });
  });

  test("reads a nested segwit path as nested segwit", () => {
    const payload = buildKeystoreDerivation([Chain.Bitcoin], {
      accountIndex: 0,
      overrides: { [Chain.Bitcoin]: customConfig("m/49'/0'/0'/0/0") },
    });

    expect(payload).toEqual({
      [Chain.Bitcoin]: { derivationPath: [49, 0, 0, 0, 0], scriptType: UTXOScriptType.P2SH_P2WPKH },
    });
  });

  test("falls back to the chain's own encoding on an off-standard purpose", () => {
    const payload = buildKeystoreDerivation([Chain.Bitcoin], {
      accountIndex: 0,
      overrides: { [Chain.Bitcoin]: customConfig("m/1234'/0'/0'/0/0") },
    });

    expect(payload).toEqual({
      [Chain.Bitcoin]: { derivationPath: [1234, 0, 0, 0, 0], scriptType: UTXOScriptType.P2WPKH },
    });
  });

  test("leaves a chain with no script type on the bare array", () => {
    const payload = buildKeystoreDerivation([Chain.Ethereum], {
      accountIndex: 0,
      overrides: { [Chain.Ethereum]: customConfig("m/44'/60'/0'/0/3") },
    });

    expect(payload).toEqual({ [Chain.Ethereum]: [44, 60, 0, 0, 3] });
  });

  test("keeps the bare-index form when nothing is overridden at all", () => {
    expect(buildKeystoreDerivation([Chain.Bitcoin], { accountIndex: 3, overrides: {} })).toBe(3);
  });
});

describe("the taproot standard", () => {
  test("is offered on the segwit-capable chains, at BIP86's shape", () => {
    expect(standardsFor(Chain.Bitcoin)).toContainEqual({
      id: "taproot",
      label: "Taproot",
      template: "m/86'/0'/0'/0/{index}",
    });

    expect(standardsFor(Chain.Litecoin)).toContainEqual({
      id: "taproot",
      label: "Taproot",
      template: "m/86'/2'/0'/0/{index}",
    });
  });

  test("is not offered where the chain cannot encode it", () => {
    expect(standardsFor(Chain.Dogecoin).map((option) => option.id)).not.toContain("taproot");
    expect(standardsFor(Chain.Ethereum).map((option) => option.id)).not.toContain("taproot");
  });

  test("sends the path with P2TR", () => {
    const payload = buildKeystoreDerivation([Chain.Bitcoin], {
      accountIndex: 0,
      overrides: { [Chain.Bitcoin]: { customPath: "", index: 0, standard: "taproot" } },
    });

    expect(payload).toEqual({ [Chain.Bitcoin]: { derivationPath: [86, 0, 0, 0, 0], scriptType: UTXOScriptType.P2TR } });
  });

  test("reaches BIP86's published address through the connector", async () => {
    const { createKeystoreWallet } = await import("@swapkit/wallet-keystore");

    const payload = buildKeystoreDerivation([Chain.Bitcoin], {
      accountIndex: 0,
      overrides: { [Chain.Bitcoin]: { customPath: "", index: 0, standard: "taproot" } },
    });

    const wallets = await createKeystoreWallet({
      chains: [Chain.Bitcoin],
      derivationPathMapOrIndex: payload as never,
      phrase: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    });

    expect(wallets[Chain.Bitcoin]?.address).toBe("bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr");
  });

  test("names itself on the drawer badge", () => {
    expect(describeDerivation(Chain.Bitcoin, "m/86'/0'/0'/0/0")).toEqual({
      format: null,
      index: null,
      label: "Taproot",
    });
  });
});

describe("the Ledger Live standard", () => {
  test("is not among the standards offered on the UTXO chains", () => {
    expect(standardsFor(Chain.Bitcoin).map((option) => option.id)).toEqual([
      "default",
      "legacy",
      "segwit",
      "taproot",
      "custom",
    ]);

    expect(standardsFor(Chain.Litecoin).map((option) => option.id)).toEqual([
      "default",
      "legacy",
      "segwit",
      "taproot",
      "custom",
    ]);

    expect(standardsFor(Chain.Bitcoin).map((option) => option.label)).not.toContain("Ledger Live");
    expect(standardsFor(Chain.Litecoin).map((option) => option.label)).not.toContain("Ledger Live");
  });

  test("stays on the EVM chains, walking the account slot", () => {
    for (const chain of [Chain.Ethereum, Chain.BinanceSmartChain, Chain.Avalanche]) {
      expect(standardsFor(chain)).toContainEqual({
        id: "ledgerLive",
        label: "Ledger Live",
        template: "m/44'/60'/{index}'/0/0",
      });
    }
  });

  test("still describes a UTXO path connected on it before, as a custom one", () => {
    const described = describeDerivation(Chain.Bitcoin, "m/84'/0'/1'/0/0");

    expect(described).toEqual({ format: null, index: null, label: "Custom" });
    expect(described && derivationBadgeText(described)).toBe("Custom");
    expect(describeDerivation(Chain.Litecoin, "m/84'/2'/3'/0/0")).toEqual({
      format: null,
      index: null,
      label: "Custom",
    });
  });

  test("leaves the chain default at index 0 unbadged", () => {
    expect(describeDerivation(Chain.Bitcoin, "m/84'/0'/0'/0/0")).toBeNull();
  });
});

describe("isOffStandardScriptType", () => {
  test("says nothing about an encoding that matches its path", () => {
    expect(isOffStandardScriptType([84, 0, 0, 0, 0] as never, UTXOScriptType.P2WPKH)).toBe(false);
    expect(isOffStandardScriptType([44, 0, 0, 0, 0] as never, UTXOScriptType.P2PKH)).toBe(false);
    expect(isOffStandardScriptType([49, 0, 0, 0, 0] as never, UTXOScriptType.P2SH_P2WPKH)).toBe(false);
  });

  test("flags one that does not", () => {
    expect(isOffStandardScriptType([44, 0, 0, 0, 0] as never, UTXOScriptType.P2WPKH)).toBe(true);
    expect(isOffStandardScriptType([86, 0, 0, 0, 0] as never, UTXOScriptType.P2WPKH)).toBe(true);
  });

  test("stays quiet with no encoding, and on a purpose that implies none", () => {
    expect(isOffStandardScriptType([44, 0, 0, 0, 0] as never)).toBe(false);
    expect(isOffStandardScriptType([1234, 0, 0, 0, 0] as never, UTXOScriptType.P2WPKH)).toBe(false);
  });
});

describe("describeDerivation", () => {
  test("names the forced format alongside the standard the path looks like", () => {
    expect(describeDerivation(Chain.Bitcoin, "m/44'/0'/0'/0/0", UTXOScriptType.P2WPKH)).toEqual({
      format: "SegWit",
      index: null,
      label: "Legacy",
    });
  });

  test("still says nothing for an ordinary default path", () => {
    expect(describeDerivation(Chain.Bitcoin, "m/84'/0'/0'/0/0")).toBeNull();
  });

  test("speaks up on the default path when an encoding was forced", () => {
    const described = describeDerivation(Chain.Bitcoin, "m/84'/0'/0'/0/0", UTXOScriptType.P2PKH);
    expect(described?.format).toBe("Legacy");
  });
});

describe("derivationBadgeText", () => {
  test("points the path at the encoding it does not describe", () => {
    const described = describeDerivation(Chain.Bitcoin, "m/44'/0'/0'/0/0", UTXOScriptType.P2WPKH);
    expect(described && derivationBadgeText(described)).toBe("Legacy → SegWit");
  });

  test("names the path itself when it is the default one carrying a forced encoding", () => {
    const described = describeDerivation(Chain.Bitcoin, "m/84'/0'/0'/0/0", UTXOScriptType.P2PKH);
    expect(described && derivationBadgeText(described)).toBe("Default path → Legacy");
  });

  test("stays a plain detail with no encoding forced", () => {
    expect(derivationBadgeText({ format: null, index: 3, label: "Legacy" })).toBe("Legacy #3");
  });
});

describe("the payload the connector actually receives", () => {
  test("recovers the address 0.x handed out for a legacy path", async () => {
    const { createKeystoreWallet } = await import("@swapkit/wallet-keystore");

    const payload = buildKeystoreDerivation([Chain.Bitcoin], {
      accountIndex: 0,
      overrides: { [Chain.Bitcoin]: customConfig("m/44'/0'/0'/0/0", UTXOScriptType.P2WPKH) },
    });

    const wallets = await createKeystoreWallet({
      chains: [Chain.Bitcoin],
      derivationPathMapOrIndex: payload as never,
      phrase: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    });

    expect(wallets[Chain.Bitcoin]?.address).toBe("bc1qmxrw6qdh5g3ztfcwm0et5l8mvws4eva24kmp8m");
  });

  test("leaves an unforced legacy path on the address its purpose implies", async () => {
    const { createKeystoreWallet } = await import("@swapkit/wallet-keystore");

    const payload = buildKeystoreDerivation([Chain.Bitcoin], {
      accountIndex: 0,
      overrides: { [Chain.Bitcoin]: customConfig("m/44'/0'/0'/0/0") },
    });

    const wallets = await createKeystoreWallet({
      chains: [Chain.Bitcoin],
      derivationPathMapOrIndex: payload as never,
      phrase: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    });

    expect(wallets[Chain.Bitcoin]?.address).toBe("1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA");
  });
});
