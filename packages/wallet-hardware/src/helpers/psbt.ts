import type { UTXOChain } from "@swapkit/helpers";
import type { Transaction } from "@swapkit/utxo-signer";

export async function applyMissingSpendingMetadata({
  chain,
  indexes,
  publicKey,
  tx,
}: {
  chain: UTXOChain;
  indexes?: number[];
  publicKey: Uint8Array;
  tx: Transaction;
}) {
  const { getMissingSpendingMetadata, getNetworkForChain } = await import("@swapkit/toolboxes/utxo");

  for (const { index, ...metadata } of getMissingSpendingMetadata({
    chain,
    indexes,
    network: getNetworkForChain(chain),
    publicKey,
    tx,
  })) {
    tx.updateInput(index, metadata);
  }
}
