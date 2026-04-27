import { hex } from "@scure/base";
import type { UTXOChain } from "@swapkit/helpers";
import type { UTXOType } from "@swapkit/toolboxes/utxo";
import type { Transaction } from "@swapkit/utxo-signer";

/**
 * Extract per-input metadata from a V3 PSBT in the shape the legacy
 * `@ledgerhq/hw-app-btc.createPaymentTransaction` adapter expects.
 *
 * For segwit inputs the SwapKit V3 API populates `witnessUtxo`; for legacy
 * (BCH/DOGE/DASH) it populates `nonWitnessUtxo` with the full prior-tx bytes.
 * We re-encode the parsed `nonWitnessUtxo` back to hex via `RawTx.encode` so
 * `btcApp.splitTransaction(hex)` can consume it.
 *
 * Single-address account assumption: all inputs share our derivation path.
 */
export async function extractInputsFromPsbt(tx: Transaction): Promise<UTXOType[]> {
  const { RawTx } = await import("@swapkit/utxo-signer");
  const inputs: UTXOType[] = [];

  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);

    if (!input.txid || input.index === undefined) {
      throw new Error(`PSBT input ${i} is missing txid/index`);
    }

    const txHex = input.nonWitnessUtxo ? hex.encode(RawTx.encode(input.nonWitnessUtxo)) : "";
    const witnessUtxo = input.witnessUtxo
      ? { script: input.witnessUtxo.script, value: Number(input.witnessUtxo.amount) }
      : undefined;

    inputs.push({
      hash: hex.encode(input.txid),
      index: input.index,
      txHex,
      value: witnessUtxo?.value ?? 0,
      witnessUtxo,
    } as UTXOType);
  }

  return inputs;
}

/**
 * Build a toolbox-compatible signer from the existing legacy Ledger UTXO
 * client. The toolbox synthesizes `signAndBroadcastTransaction` on top of
 * `signer.signTransaction(tx) → Transaction`.
 */
export function createLegacyPsbtSigner({
  legacyClient,
  chain: _chain,
  address,
}: {
  legacyClient: { signTransaction: (tx: Transaction, inputUtxos: UTXOType[]) => Promise<string> };
  chain: UTXOChain;
  address: string;
}) {
  return {
    getAddress: async () => address,
    signTransaction: async (tx: Transaction): Promise<Transaction> => {
      const inputUtxos = await extractInputsFromPsbt(tx);
      const signedTxHex = await legacyClient.signTransaction(tx, inputUtxos);

      const { Transaction: TxClass } = await import("@swapkit/utxo-signer");
      // `Transaction.fromRaw` parses a serialised tx (no PSBT envelope) — exactly
      // what `createPaymentTransaction` returns.
      return TxClass.fromRaw(hex.decode(signedTxHex));
    },
  };
}
