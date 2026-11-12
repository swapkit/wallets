import { describe, expect, test } from "bun:test";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { Chain, derivationPathToString, UTXOScriptType, WalletOption } from "@swapkit/helpers";
import { pathForStandard, purposeForStandard, scriptTypeForPurpose, standardsFor } from "../derivation-presets";
import { hardwareStandardsToOffer } from "../hardware-derivation";

const hardwareStandardsFor = (chain: Chain) => hardwareStandardsToOffer(chain, WalletOption.LEDGER, true);

const TEST_PHRASE = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const COIN_TYPES = { [Chain.Bitcoin]: 0, [Chain.Litecoin]: 2 } as const;

const SCRIPT_TYPE_BY_ADDRESS_TYPE: Record<string, UTXOScriptType> = {
  pkh: UTXOScriptType.P2PKH,
  sh: UTXOScriptType.P2SH_P2WPKH,
  tr: UTXOScriptType.P2TR,
  wpkh: UTXOScriptType.P2WPKH,
};

function scriptTypeOfAddress(addressType: string | null) {
  return addressType ? SCRIPT_TYPE_BY_ADDRESS_TYPE[addressType] : undefined;
}

describe("hardware derivation standards", () => {
  test("offers every standard the segwit-capable UTXO chains can encode", () => {
    for (const wallet of [WalletOption.LEDGER, WalletOption.TREZOR]) {
      expect(hardwareStandardsToOffer(Chain.Bitcoin, wallet, true)).toEqual([
        { id: "default", label: "Native SegWit", template: "m/84'/0'/0'/0/{index}" },
        { id: "legacy", label: "Legacy", template: "m/44'/0'/0'/0/{index}" },
        { id: "segwit", label: "SegWit", template: "m/49'/0'/0'/0/{index}" },
        { id: "taproot", label: "Taproot", template: "m/86'/0'/0'/0/{index}" },
      ]);
    }

    expect(hardwareStandardsFor(Chain.Litecoin).map((standard) => standard.template)).toEqual([
      "m/84'/2'/0'/0/{index}",
      "m/44'/2'/0'/0/{index}",
      "m/49'/2'/0'/0/{index}",
    ]);
  });

  test("offers only standards the chain encodes, as the encoding it predicts", async () => {
    const { deriveAddressesFromXpub, getNetworkForChain, getUtxoAddressType } = await import("@swapkit/toolboxes/utxo");

    for (const chain of [Chain.Bitcoin, Chain.Litecoin] as const) {
      const master = HDKey.fromMasterSeed(mnemonicToSeedSync(TEST_PHRASE), getNetworkForChain(chain).bip32);

      for (const standard of hardwareStandardsFor(chain)) {
        const purpose = purposeForStandard(chain, standard.id);
        const scriptType = scriptTypeForPurpose(chain, purpose);
        const xpub = master.derive(`m/${purpose}'/${COIN_TYPES[chain]}'/0'`).publicExtendedKey;

        const [first] = deriveAddressesFromXpub({ chain, count: 1, purpose, scriptType, xpub });

        expect(first?.address).toBeString();
        expect(scriptTypeOfAddress(getUtxoAddressType({ address: first?.address ?? "", chain }))).toBe(scriptType);
      }
    }
  });

  test("offers nothing where a chain has a single shape", () => {
    for (const chain of [Chain.Dogecoin, Chain.BitcoinCash, Chain.Dash, Chain.Zcash, Chain.Cosmos, Chain.THORChain]) {
      expect(hardwareStandardsFor(chain)).toEqual([]);
    }
  });

  test("lands the index on the slot each standard moves", () => {
    expect(derivationPathToString(pathForStandard(Chain.Bitcoin, "default", 3))).toBe("m/84'/0'/0'/0/3");
    expect(derivationPathToString(pathForStandard(Chain.Bitcoin, "segwit", 3))).toBe("m/49'/0'/0'/0/3");
    expect(derivationPathToString(pathForStandard(Chain.Litecoin, "legacy", 3))).toBe("m/44'/2'/0'/0/3");
  });
});

describe("hardware derivation standards on EVM chains", () => {
  test("offers the account-slot shapes the traditional EVM chains share", () => {
    for (const chain of [Chain.Ethereum, Chain.Avalanche, Chain.BinanceSmartChain] as const) {
      expect(hardwareStandardsFor(chain)).toEqual([
        { id: "default", label: "MetaMask · BIP44", template: "m/44'/60'/0'/0/{index}" },
        { id: "legacy", label: "Legacy", template: "m/44'/60'/0'/{index}" },
        { id: "ledgerLive", label: "Ledger Live", template: "m/44'/60'/{index}'/0/0" },
      ]);
    }
  });

  test("puts the index in a different slot for each EVM standard", () => {
    expect(derivationPathToString(pathForStandard(Chain.Ethereum, "default", 3))).toBe("m/44'/60'/0'/0/3");
    expect(derivationPathToString(pathForStandard(Chain.Ethereum, "legacy", 3))).toBe("m/44'/60'/0'/3");
    expect(derivationPathToString(pathForStandard(Chain.Ethereum, "ledgerLive", 3))).toBe("m/44'/60'/3'/0/0");

    expect(derivationPathToString(pathForStandard(Chain.Avalanche, "ledgerLive", 1))).not.toBe(
      derivationPathToString(pathForStandard(Chain.Avalanche, "default", 1)),
    );
  });

  test("offers nothing on the EVM chains the keystore picker leaves alone", () => {
    for (const chain of [Chain.Arbitrum, Chain.Base, Chain.Optimism, Chain.Polygon]) {
      expect(hardwareStandardsFor(chain)).toEqual([]);
    }
  });
});

describe("hardware derivation standards agree with the keystore picker", () => {
  test("names purpose 49 as the keystore picker names it", () => {
    const hardware = hardwareStandardsFor(Chain.Bitcoin).find(
      (standard) => purposeForStandard(Chain.Bitcoin, standard.id) === 49,
    );

    expect(hardware?.label).toBe("SegWit");
    expect(hardware?.label).toBe(standardsFor(Chain.Bitcoin).find((standard) => standard.id === "segwit")?.label);
  });

  test("keeps the keystore picker's labels and order", () => {
    for (const chain of [Chain.Bitcoin, Chain.Litecoin, Chain.Ethereum, Chain.BinanceSmartChain] as const) {
      const labelsAndOrder = (standards: { id: string; label: string }[]) =>
        standards.filter(({ id }) => id !== "custom" && id !== "taproot").map(({ id, label }) => `${id}:${label}`);

      expect(labelsAndOrder(hardwareStandardsFor(chain))).toEqual(labelsAndOrder(standardsFor(chain)));
    }
  });
});

describe("hardware derivation standards stay behind allowDerivationSelection", () => {
  test("offers nothing while the integrator has not opted in", () => {
    for (const wallet of [WalletOption.LEDGER, WalletOption.TREZOR]) {
      for (const chain of [Chain.Bitcoin, Chain.Litecoin, Chain.Ethereum]) {
        expect(hardwareStandardsToOffer(chain, wallet, false)).toEqual([]);
      }
    }
  });

  test("offers the chain's standards once the integrator opts in", () => {
    expect(hardwareStandardsToOffer(Chain.Bitcoin, WalletOption.LEDGER, true)).toEqual(
      hardwareStandardsFor(Chain.Bitcoin),
    );
    expect(hardwareStandardsToOffer(Chain.Litecoin, WalletOption.TREZOR, true)).toEqual(
      hardwareStandardsFor(Chain.Litecoin),
    );
    expect(hardwareStandardsToOffer(Chain.Ethereum, WalletOption.LEDGER, true)).toEqual(
      hardwareStandardsFor(Chain.Ethereum),
    );

    expect(hardwareStandardsToOffer(Chain.Dogecoin, WalletOption.LEDGER, true)).toEqual([]);
  });

  test("offers nothing for a wallet that does not honour the standards, opted in or not", () => {
    for (const allowed of [false, true]) {
      for (const chain of [Chain.Bitcoin, Chain.Ethereum]) {
        expect(hardwareStandardsToOffer(chain, WalletOption.KEEPKEY, allowed)).toEqual([]);
        expect(hardwareStandardsToOffer(chain, WalletOption.KEYSTORE, allowed)).toEqual([]);
      }
    }
  });
});
