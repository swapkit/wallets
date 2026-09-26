import { describe, expect, it, mock } from "bun:test";
import { HDKey } from "@scure/bip32";
import { Chain, type DerivationPathArray, type UTXOChain } from "@swapkit/helpers";
import { getNetworkForChain } from "@swapkit/toolboxes/utxo";
import { OutScript, p2sh, p2wpkh, Transaction } from "@swapkit/utxo-signer";

const master = HDKey.fromMasterSeed(new Uint8Array(64).fill(5));
const accountKey = (coinType: number) => master.derive(`m/49'/${coinType}'/0'`);
const leafKey = (coinType: number) => accountKey(coinType).derive("m/0/0");

mock.module("@trezor/connect-web", () => ({
  default: {
    dispose: mock(() => Promise.resolve(undefined)),
    getAddress: mock(() => Promise.resolve({ payload: { address: "unused" }, success: true })),
    getPublicKey: mock(({ path }: { path: string }) =>
      Promise.resolve({
        payload: {
          depth: 3,
          fingerprint: 0,
          publicKey: "",
          serializedPath: path,
          xpub: accountKey(Number(path.split("/")[2]?.replace("'", ""))).publicExtendedKey,
        },
        success: true,
      }),
    ),
    init: mock(() => Promise.resolve(undefined)),
    signTransaction: mock(() => Promise.resolve({ payload: { serializedTx: "", signatures: [] }, success: true })),
  },
}));

const { trezorWallet } = await import("../src/trezor");

type ConnectedWallet = { signTransaction: (tx: Transaction) => Promise<Transaction> };

const CHAINS = [
  [Chain.Bitcoin, 0],
  [Chain.Litecoin, 2],
] as const;

async function connect(chain: UTXOChain, coinType: number, address: string) {
  const addChain = mock(() => undefined);
  const connectWallet = trezorWallet.connectTrezor.connectWallet({ addChain: addChain as never });

  await connectWallet([chain], [49, coinType, 0, 0, 0] as unknown as DerivationPathArray, { address });

  return addChain.mock.calls[0]?.[0] as unknown as ConnectedWallet;
}

function txSpending(scripts: Uint8Array[], changeScript: Uint8Array) {
  const tx = new Transaction({ allowLegacyWitnessUtxo: true, allowUnknownOutputs: true });

  for (const [index, script] of scripts.entries()) {
    tx.addInput({ index: 0, txid: new Uint8Array(32).fill(index + 1), witnessUtxo: { amount: 100_000n, script } });
  }

  tx.addOutput({ amount: 90_000n, script: changeScript });

  return tx;
}

function redeemScriptOf(tx: Transaction, index: number) {
  return (tx.getInput(index) as { redeemScript?: Uint8Array }).redeemScript;
}

describe.each(CHAINS)("the PSBT a Trezor returns for a nested segwit %s account", (chain, coinType) => {
  const network = getNetworkForChain(chain);
  const nested = p2sh(p2wpkh(leafKey(coinType).publicKey as Uint8Array, network), network);
  const foreignScript = OutScript.encode({ hash: new Uint8Array(20).fill(9), type: "sh" });

  it("stamps the redeem script the API leaves off a P2SH-wrapped segwit input", async () => {
    const wallet = await connect(chain, coinType, nested.address as string);
    const tx = await wallet.signTransaction(txSpending([nested.script], nested.script));

    expect(redeemScriptOf(tx, 0)).toEqual(nested.redeemScript as Uint8Array);
  });

  it("can be finalized once the redeem script is back", async () => {
    const wallet = await connect(chain, coinType, nested.address as string);
    const tx = await wallet.signTransaction(txSpending([nested.script], nested.script));

    tx.signIdx(leafKey(coinType).privateKey as Uint8Array, 0);

    expect(() => tx.finalize()).not.toThrow();
  });

  it("leaves an input alone when the derived redeem script does not hash to its scriptPubKey", async () => {
    const wallet = await connect(chain, coinType, nested.address as string);
    const tx = await wallet.signTransaction(txSpending([foreignScript, nested.script], nested.script));

    expect(redeemScriptOf(tx, 0)).toBeUndefined();
    expect(redeemScriptOf(tx, 1)).toEqual(nested.redeemScript as Uint8Array);
  });
});
