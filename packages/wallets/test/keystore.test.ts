import { describe, expect, test } from "bun:test";
import { Chain, UTXOScriptType, WalletOption } from "@swapkit/helpers";

import {
  createKeystoreWallet,
  decryptFromKeystore,
  generateKeystore,
  generatePhrase,
  type KeystoreDerivationPathMap,
  type PhraseWordCount,
  validatePhrase,
} from "../src/keystore";

// Well-known BIP39 test vector — never holds funds.
const TEST_PHRASE = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("keystore UTXO script types", () => {
  test("the default path derives native segwit on Bitcoin and legacy on Dogecoin", async () => {
    const wallets = await createKeystoreWallet({ chains: [Chain.Bitcoin, Chain.Dogecoin], phrase: TEST_PHRASE });

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

  test("a UTXO entry that states a script type but no path fails the whole connect", async () => {
    await expect(
      createKeystoreWallet({
        chains: [Chain.Bitcoin, Chain.Ethereum],
        derivationPathMapOrIndex: { [Chain.Bitcoin]: { scriptType: UTXOScriptType.P2TR } as never },
        phrase: TEST_PHRASE,
      }),
    ).rejects.toMatchObject({ cause: { chain: Chain.Bitcoin }, errorKey: "toolbox_utxo_invalid_params" });
  });
});

describe("keystore derivation entries", () => {
  test("a string or number entry fails the whole connect, naming its chain", async () => {
    await expect(
      createKeystoreWallet({
        chains: [Chain.Bitcoin, Chain.Solana],
        derivationPathMapOrIndex: { [Chain.Solana]: "m/44'/501'/0'/0'" as never },
        phrase: TEST_PHRASE,
      }),
    ).rejects.toMatchObject({ cause: { chain: Chain.Solana }, errorKey: "wallet_missing_params" });

    await expect(
      createKeystoreWallet({
        chains: [Chain.Ethereum, Chain.Bitcoin],
        derivationPathMapOrIndex: { [Chain.Bitcoin]: 84 as never },
        phrase: TEST_PHRASE,
      }),
    ).rejects.toMatchObject({ cause: { chain: Chain.Bitcoin }, errorKey: "toolbox_utxo_invalid_params" });
  });

  test("a non-UTXO entry without a path array fails the whole connect instead of skipping the chain", async () => {
    for (const entry of [{}, { scriptType: UTXOScriptType.P2WPKH }, { derivationPath: "m/44'/60'/0'/0/0" }]) {
      await expect(
        createKeystoreWallet({
          chains: [Chain.Bitcoin, Chain.Ethereum],
          derivationPathMapOrIndex: { [Chain.Ethereum]: entry as never },
          phrase: TEST_PHRASE,
        }),
      ).rejects.toMatchObject({
        cause: { chain: Chain.Ethereum, param: "derivationPath", wallet: WalletOption.KEYSTORE },
        errorKey: "wallet_missing_params",
      });
    }
  });

  test("the first malformed entry in chain order fails the connect before any chain connects", async () => {
    // TON rejects a non-default path only once its toolbox is built: connecting first would report TON.
    await expect(
      createKeystoreWallet({
        chains: [Chain.Ton, Chain.Ethereum, Chain.Bitcoin],
        derivationPathMapOrIndex: {
          [Chain.Bitcoin]: [84, 0, 0, 0, 0] as never,
          [Chain.Ethereum]: "m/44'/60'/0'/0/0" as never,
          [Chain.Ton]: [44, 607, 1, 0, 0],
        },
        phrase: TEST_PHRASE,
      }),
    ).rejects.toMatchObject({ cause: { chain: Chain.Ethereum }, errorKey: "wallet_missing_params" });
  });
});

describe("keystore phrase", () => {
  // Bitcoin Cash and Solana derive nothing from a missing phrase and connect with an empty address,
  // so the connect has to fail rather than return only those chains.
  test("a missing or blank phrase fails the connect before any chain connects", async () => {
    for (const phrase of ["", "   ", undefined]) {
      await expect(
        createKeystoreWallet({ chains: [Chain.BitcoinCash, Chain.Bitcoin, Chain.Solana], phrase: phrase as never }),
      ).rejects.toMatchObject({
        cause: { param: "phrase", wallet: WalletOption.KEYSTORE },
        errorKey: "wallet_missing_params",
      });
    }
  });
});

describe("keystore phrase generation", () => {
  test("defaults to 24 words and accepts every BIP39 length", () => {
    expect(generatePhrase().split(" ")).toHaveLength(24);

    for (const wordCount of [12, 15, 18, 21, 24] as const) {
      const phrase = generatePhrase(wordCount);
      expect(phrase.split(" ")).toHaveLength(wordCount);
      expect(validatePhrase(phrase)).toBe(true);
    }
  });

  test("rejects an unsupported word count", () => {
    expect(() => generatePhrase(13 as PhraseWordCount)).toThrow();
  });

  test("generateKeystore encrypts the phrase it returns", async () => {
    const { keystore, phrase } = await generateKeystore({ password: "password", wordCount: 12 });

    expect(await decryptFromKeystore(keystore, "password")).toBe(phrase);
  });
});
