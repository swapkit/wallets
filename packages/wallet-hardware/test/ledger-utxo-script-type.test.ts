import { beforeEach, describe, expect, it, mock } from "bun:test";
import type Transport from "@ledgerhq/hw-transport";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { Chain, UTXOScriptType } from "@swapkit/helpers";
import * as realUtxoToolbox from "@swapkit/toolboxes/utxo";
import { Address, NETWORK, OutScript, p2sh, p2wpkh, Transaction } from "@swapkit/utxo-signer";

const realUtxoToolboxSnapshot = { ...realUtxoToolbox };

// Well-known BIP39 test vector — never holds funds.
const TEST_PHRASE = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const master = HDKey.fromMasterSeed(mnemonicToSeedSync(TEST_PHRASE));
const accountKey = (purpose: number) => master.derive(`m/${purpose}'/0'/0'`);
const leafPublicKey = (purpose: number) => accountKey(purpose).derive("m/0/0").publicKey as Uint8Array;

const nestedAddress = p2sh(p2wpkh(leafPublicKey(49), NETWORK), NETWORK).address as string;
const nativeAddress = p2wpkh(leafPublicKey(84), NETWORK).address as string;

const xpubRequests: string[] = [];
let deviceAddress = nativeAddress;

mock.module("@ledgerhq/hw-app-btc", () => ({
  default: class MockBitcoinApp {
    getWalletPublicKey = async () => ({ bitcoinAddress: deviceAddress });
  },
}));

mock.module("ledger-bitcoin", () => ({
  AppClient: class MockAppClient {
    getMasterFingerprint = async () => "deadbeef";
    getExtendedPubkey = (path: string) => {
      xpubRequests.push(path);
      return accountKey(Number(path.split("/")[1]?.replace("'", ""))).publicExtendedKey;
    };
    getWalletAddress = () => deviceAddress;
  },
  DefaultWalletPolicy: class MockDefaultWalletPolicy {
    // biome-ignore lint/complexity/noUselessConstructor: skip for tests
    constructor(_template: string, _key: string) {}
  },
}));

mock.module("@swapkit/toolboxes/utxo", () => realUtxoToolboxSnapshot);

import { BitcoinPsbtLedger } from "../src/ledger/clients/utxo-psbt";
import { ledgerWallet } from "../src/ledger/index";

const transport = { id: "ledger" } as unknown as Transport;

async function connect(chain: Chain, derivationPath: number[], address: string) {
  deviceAddress = address;
  const addChain = mock((_wallet: { scriptType?: UTXOScriptType }) => undefined);
  await ledgerWallet.connectLedger.connectWallet({ addChain: addChain as never })([chain], derivationPath as never, {
    transport,
  });
  return addChain.mock.calls[0]?.[0];
}

describe("Ledger UTXO script types", () => {
  beforeEach(() => {
    xpubRequests.length = 0;
  });

  it("derives the configured address's public key from the cached account xpub", async () => {
    const client = BitcoinPsbtLedger("m/49'/0'/0'/0/0", transport);

    expect(await client.getPublicKey()).toEqual(leafPublicKey(49));
    expect(await client.getPublicKey()).toEqual(leafPublicKey(49));
    expect(xpubRequests).toEqual(["m/49'/0'/0'"]);
  });

  it("gives a nested SegWit input the redeemScript of the Ledger key", async () => {
    const publicKey = await BitcoinPsbtLedger("m/49'/0'/0'/0/0", transport).getPublicKey();
    const script = OutScript.encode(Address(NETWORK).decode(nestedAddress));
    const tx = new Transaction({ allowLegacyWitnessUtxo: true, version: 1 });

    realUtxoToolboxSnapshot.addInputsAndOutputs({
      chain: Chain.Bitcoin,
      compiledMemo: null,
      inputs: [{ hash: "00".repeat(32), index: 0, publicKey, value: 10_000, witnessUtxo: { script, value: 10_000 } }],
      outputs: [{ address: nativeAddress, value: 9_000 }],
      sender: nestedAddress,
      tx,
    } as never);

    expect(tx.getInput(0).redeemScript).toEqual(p2wpkh(publicKey, NETWORK).script);
  });

  it.each([
    [[44, 0, 0, 0, 0], "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA", UTXOScriptType.P2PKH],
    [[49, 0, 0, 0, 0], nestedAddress, UTXOScriptType.P2SH_P2WPKH],
    [[84, 0, 0, 0, 0], nativeAddress, UTXOScriptType.P2WPKH],
  ] as const)("reports the script type of the %p account", async (derivationPath, address, scriptType) => {
    const wallet = await connect(Chain.Bitcoin, [...derivationPath], address);

    expect(wallet?.scriptType).toBe(scriptType);
  });

  it("only reads the account xpub when the account is nested SegWit", async () => {
    await connect(Chain.Bitcoin, [84, 0, 0, 0, 0], nativeAddress);
    expect(xpubRequests).toEqual([]);

    await connect(Chain.Bitcoin, [49, 0, 0, 0, 0], nestedAddress);
    expect(xpubRequests).toEqual(["m/49'/0'/0'"]);
  });

  it("follows the address the device returns, which is native SegWit on a BIP86 path", async () => {
    const wallet = await connect(Chain.Bitcoin, [86, 0, 0, 0, 0], nativeAddress);

    expect(wallet?.scriptType).toBe(UTXOScriptType.P2WPKH);
  });
});
