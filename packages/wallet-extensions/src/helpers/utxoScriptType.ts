import type { UTXOChain } from "@swapkit/helpers";

/**
 * The script type an extension's UTXO address encodes, as toolbox params. Extension wallets choose
 * their own account type (native segwit, nested segwit, taproot), so the toolbox must report that one
 * instead of the chain default. Without an address the toolbox keeps its default.
 */
export async function getUtxoScriptTypeParams({ address, chain }: { address?: string; chain: UTXOChain }) {
  if (!address) return {};

  const { getScriptTypeForAddress } = await import("@swapkit/toolboxes/utxo");
  return { scriptType: getScriptTypeForAddress(address, chain) };
}
