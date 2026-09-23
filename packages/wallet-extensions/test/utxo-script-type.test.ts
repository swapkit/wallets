import { describe, expect, test } from "bun:test";
import { Chain, UTXOScriptType } from "@swapkit/helpers";
import { getUtxoToolbox } from "@swapkit/toolboxes/utxo";

import { getUtxoScriptTypeParams } from "../src/helpers/utxoScriptType";

// BIP84 / BIP86 / BIP49 / BIP44 vectors for the "abandon … about" phrase.
const NATIVE_SEGWIT = "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";
const TAPROOT = "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr";
const NESTED_SEGWIT = "37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf";
const LEGACY = "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA";

describe("getUtxoScriptTypeParams", () => {
  test.each([
    [NATIVE_SEGWIT, UTXOScriptType.P2WPKH],
    [TAPROOT, UTXOScriptType.P2TR],
    [NESTED_SEGWIT, UTXOScriptType.P2SH_P2WPKH],
    [LEGACY, UTXOScriptType.P2PKH],
  ])("reads the account type off %s", async (address, scriptType) => {
    expect(await getUtxoScriptTypeParams({ address, chain: Chain.Bitcoin })).toEqual({ scriptType });
  });

  test("leaves the toolbox default without an address", async () => {
    expect(await getUtxoScriptTypeParams({ address: undefined, chain: Chain.Bitcoin })).toEqual({});
    expect(await getUtxoScriptTypeParams({ address: "", chain: Chain.Litecoin })).toEqual({});
  });

  test("refuses an address of another chain", async () => {
    await expect(getUtxoScriptTypeParams({ address: TAPROOT, chain: Chain.Litecoin })).rejects.toMatchObject({
      errorKey: "toolbox_utxo_invalid_address",
    });
  });

  test("a taproot extension account is not reported as native segwit", async () => {
    const signer = { getAddress: () => Promise.resolve(TAPROOT), signTransaction: <T>(tx: T) => Promise.resolve(tx) };
    const params = await getUtxoScriptTypeParams({ address: TAPROOT, chain: Chain.Bitcoin });
    const toolbox = getUtxoToolbox(Chain.Bitcoin, { ...params, signer });

    expect(toolbox.scriptType).toBe(UTXOScriptType.P2TR);
  });
});
