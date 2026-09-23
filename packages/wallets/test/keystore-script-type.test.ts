import { describe, expect, test } from "bun:test";
import { Chain, UTXOScriptType } from "@swapkit/helpers";

import { createKeystoreWallet, type KeystoreDerivationPathMap } from "../src/keystore";

// Well-known BIP39 test vector — never holds funds.
const TEST_PHRASE = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("keystore UTXO script types", () => {
  test("the default path derives native segwit on Bitcoin and legacy on Dogecoin", async () => {
    const wallets = await createKeystoreWallet({ chains: [Chain.Bitcoin, Chain.Dogecoin], phrase: TEST_PHRASE });

    // BIP84 test vector for m/84'/0'/0'/0/0.
    expect(wallets[Chain.Bitcoin]?.address).toBe("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
    expect(wallets[Chain.Bitcoin]?.scriptType).toBe(UTXOScriptType.P2WPKH);
    expect(wallets[Chain.Dogecoin]?.scriptType).toBe(UTXOScriptType.P2PKH);
  });

  test("a wallet index keeps the type the default path implies", async () => {
    const wallets = await createKeystoreWallet({
      chains: [Chain.Bitcoin],
      derivationPathMapOrIndex: 1,
      phrase: TEST_PHRASE,
    });

    expect(wallets[Chain.Bitcoin]?.scriptType).toBe(UTXOScriptType.P2WPKH);
    expect(wallets[Chain.Bitcoin]?.address).toStartWith("bc1q");
  });

  test("a map entry derives the stated type", async () => {
    const wallets = await createKeystoreWallet({
      chains: [Chain.Bitcoin],
      derivationPathMapOrIndex: {
        [Chain.Bitcoin]: { derivationPath: [86, 0, 0, 0, 0], scriptType: UTXOScriptType.P2TR },
      },
      phrase: TEST_PHRASE,
    });

    // BIP86 test vector for m/86'/0'/0'/0/0.
    expect(wallets[Chain.Bitcoin]?.address).toBe("bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr");
    expect(wallets[Chain.Bitcoin]?.scriptType).toBe(UTXOScriptType.P2TR);
  });

  test("a bare UTXO path fails the whole connect", async () => {
    const bareMap = { [Chain.Bitcoin]: [84, 0, 0, 0, 0] } as unknown as KeystoreDerivationPathMap;

    await expect(
      createKeystoreWallet({
        chains: [Chain.Bitcoin, Chain.Ethereum],
        derivationPathMapOrIndex: bareMap,
        phrase: TEST_PHRASE,
      }),
    ).rejects.toMatchObject({ errorKey: "toolbox_utxo_invalid_params" });
  });

  test("a type the chain cannot encode fails the whole connect", async () => {
    await expect(
      createKeystoreWallet({
        chains: [Chain.Dogecoin, Chain.Ethereum],
        derivationPathMapOrIndex: {
          [Chain.Dogecoin]: { derivationPath: [84, 3, 0, 0, 0], scriptType: UTXOScriptType.P2WPKH },
        },
        phrase: TEST_PHRASE,
      }),
    ).rejects.toMatchObject({ errorKey: "toolbox_utxo_unsupported_script_type" });
  });
});
