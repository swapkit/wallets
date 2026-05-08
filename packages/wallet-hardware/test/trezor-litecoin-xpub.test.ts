import { describe, expect, it } from "bun:test";
import { HDKey } from "@scure/bip32";
import { Chain } from "@swapkit/helpers";
import { deriveAddressesFromXpub } from "@swapkit/toolboxes/utxo";

import { normalizeTrezorExtendedPublicKey, normalizeTrezorSignature, trezorWallet } from "../src/trezor";

describe("Trezor Litecoin xpub handling", () => {
  it("normalizes Bitcoin-version account xpubs to Litecoin before address derivation", () => {
    const seed = new Uint8Array(32).fill(1);
    const bitcoinVersionAccountXpub = HDKey.fromMasterSeed(seed).derive("m/84'/2'/0'").publicExtendedKey;

    expect(() =>
      deriveAddressesFromXpub({ accountIndex: 0, chain: Chain.Litecoin, count: 1, xpub: bitcoinVersionAccountXpub }),
    ).toThrow("Version mismatch");

    const litecoinVersionAccountXpub = normalizeTrezorExtendedPublicKey(bitcoinVersionAccountXpub, Chain.Litecoin);
    const [address] = deriveAddressesFromXpub({
      accountIndex: 0,
      chain: Chain.Litecoin,
      count: 1,
      xpub: litecoinVersionAccountXpub,
    });

    expect(address?.address).toStartWith("ltc1");
  });

  it("uses the BCH sighash byte when Trezor returns a bare DER signature", () => {
    const derSignature = "3006020101020102";

    expect(normalizeTrezorSignature(derSignature, Chain.Bitcoin)).toEqual(
      new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02, 0x01]),
    );
    expect(normalizeTrezorSignature(derSignature, Chain.BitcoinCash)).toEqual(
      new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02, 0x41]),
    );
  });

  it("marks BCH and DOGE direct signing as available for testing", () => {
    expect(trezorWallet.connectTrezor.directSigningSupport[Chain.BitcoinCash]).toBe(true);
    expect(trezorWallet.connectTrezor.directSigningSupport[Chain.Dogecoin]).toBe(true);
  });
});
