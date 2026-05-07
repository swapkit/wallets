import { hex } from "@scure/base";
import { SwapKitError, type UTXOChain } from "@swapkit/helpers";
import type { UTXOType } from "@swapkit/toolboxes/utxo";
import type { Transaction } from "@swapkit/utxo-signer";

/**
 * Extract per-input metadata from a V3 PSBT in the shape the legacy
 * `@ledgerhq/hw-app-btc.createPaymentTransaction` adapter expects.
 *
 * The legacy Ledger signer still needs the full previous tx hex for
 * `btcApp.splitTransaction(hex)`. Some V3 PSBTs only include `witnessUtxo`,
 * so we fetch the previous raw tx when `nonWitnessUtxo` is absent.
 *
 * Single-address account assumption: all inputs share our derivation path.
 */
export async function extractInputsFromPsbt(tx: Transaction, chain: UTXOChain): Promise<UTXOType[]> {
  const { RawTx } = await import("@swapkit/utxo-signer");
  const { getUtxoApi } = await import("@swapkit/toolboxes/utxo");
  const inputs: UTXOType[] = [];

  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);

    if (!input.txid || input.index === undefined) {
      throw new Error(`PSBT input ${i} is missing txid/index`);
    }

    const txid = hex.encode(input.txid);
    const txHex = input.nonWitnessUtxo
      ? hex.encode(RawTx.encode(input.nonWitnessUtxo))
      : await getUtxoApi(chain).getRawTx(txid);
    if (!txHex) {
      throw new SwapKitError("wallet_ledger_invalid_params", {
        chain,
        inputIndex: i,
        reason: "Unable to resolve previous transaction hex for Ledger signing",
        txid,
      });
    }
    const witnessUtxo = input.witnessUtxo
      ? { script: input.witnessUtxo.script, value: Number(input.witnessUtxo.amount) }
      : undefined;
    const nonWitnessPrevout = input.index !== undefined ? input.nonWitnessUtxo?.outputs?.[input.index] : undefined;
    const value = witnessUtxo?.value ?? (nonWitnessPrevout ? Number(nonWitnessPrevout.amount) : 0);

    inputs.push({ hash: txid, index: input.index, txHex, value, witnessUtxo } as UTXOType);
  }

  return inputs;
}

export async function signLegacyPsbtTransaction({
  legacyClient,
  chain,
  tx,
}: {
  legacyClient: { signTransaction: (tx: Transaction, inputUtxos: UTXOType[]) => Promise<string> };
  chain: UTXOChain;
  tx: Transaction;
}): Promise<string> {
  const inputUtxos = await extractInputsFromPsbt(tx, chain);
  return legacyClient.signTransaction(tx, inputUtxos);
}

/**
 * Build a toolbox-compatible signer from the existing legacy Ledger UTXO
 * client. Callers that need sign-and-broadcast should broadcast the raw hex
 * from `signLegacyPsbtTransaction` directly; the legacy Ledger app returns an
 * already-finalized transaction that should not be passed back to toolbox
 * finalization.
 */
export function createLegacyPsbtSigner({
  legacyClient,
  chain,
  address,
}: {
  legacyClient: { signTransaction: (tx: Transaction, inputUtxos: UTXOType[]) => Promise<string> };
  chain: UTXOChain;
  address: string;
}) {
  return {
    getAddress: async () => address,
    signTransaction: async (tx: Transaction): Promise<Transaction> => {
      const signedTxHex = await signLegacyPsbtTransaction({ chain, legacyClient, tx });

      const { Transaction: TxClass } = await import("@swapkit/utxo-signer");
      // `Transaction.fromRaw` parses a serialised tx (no PSBT envelope) — exactly
      // what `createPaymentTransaction` returns.
      return TxClass.fromRaw(hex.decode(signedTxHex));
    },
  };
}
