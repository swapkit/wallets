import { describe, expect, it, mock } from "bun:test";
import { hex } from "@scure/base";
import { HDKey } from "@scure/bip32";
import { Chain, type DerivationPathArray } from "@swapkit/helpers";
import { p2tr, Transaction } from "@swapkit/utxo-signer";

const master = HDKey.fromMasterSeed(new Uint8Array(64).fill(7));
const accountKey = master.derive("m/86'/0'/0'");
const xOnlyKey = (accountKey.derive("m/0/0").publicKey as Uint8Array).slice(1);
const taproot = p2tr(xOnlyKey);
const schnorrSignature = new Uint8Array(64).fill(3);

const signTransaction = mock((_params: { inputs: Array<{ script_type: string }>; outputs: unknown[] }) =>
  Promise.resolve({ payload: { serializedTx: "", signatures: [hex.encode(schnorrSignature)] }, success: true }),
);

mock.module("@trezor/connect-web", () => ({
  default: {
    dispose: mock(() => Promise.resolve(undefined)),
    getAddress: mock(() => Promise.resolve({ payload: { address: taproot.address }, success: true })),
    getPublicKey: mock(({ path }: { path: string }) =>
      Promise.resolve({
        payload: { depth: 3, fingerprint: 0, publicKey: "", serializedPath: path, xpub: accountKey.publicExtendedKey },
        success: true,
      }),
    ),
    init: mock(() => Promise.resolve(undefined)),
    signTransaction,
  },
}));

const { trezorWallet } = await import("../src/trezor");

type ConnectedWallet = { signTransaction: (tx: Transaction) => Promise<Transaction> };

async function connect() {
  const addChain = mock(() => undefined);
  const connectWallet = trezorWallet.connectTrezor.connectWallet({ addChain: addChain as never });

  await connectWallet([Chain.Bitcoin], [86, 0, 0, 0, 0] as unknown as DerivationPathArray, {
    address: taproot.address,
  });

  return addChain.mock.calls[0]?.[0] as unknown as ConnectedWallet;
}

function txSpendingTaproot() {
  const tx = new Transaction({ allowUnknownOutputs: true });
  tx.addInput({
    index: 0,
    txid: new Uint8Array(32).fill(1),
    witnessUtxo: { amount: 100_000n, script: taproot.script },
  });
  tx.addOutput({ amount: 90_000n, script: taproot.script });
  return tx;
}

describe("a Trezor Bitcoin taproot account", () => {
  it("signs as taproot and returns a PSBT that finalizes from the key-path signature", async () => {
    const wallet = await connect();
    const tx = await wallet.signTransaction(txSpendingTaproot());

    const [{ inputs, outputs }] = signTransaction.mock.calls.at(-1) as [{ inputs: any[]; outputs: any[] }];
    expect(inputs[0].script_type).toBe("SPENDTAPROOT");
    expect(outputs[0].script_type).toBe("PAYTOTAPROOT");
    expect(tx.getInput(0).tapKeySig).toEqual(schnorrSignature);
    expect(() => tx.finalize()).not.toThrow();
  });
});
