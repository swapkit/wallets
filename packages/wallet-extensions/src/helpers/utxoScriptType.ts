import type { UTXOChain } from "@swapkit/helpers";

export async function getUtxoScriptTypeParams({ address, chain }: { address?: string; chain: UTXOChain }) {
  if (!address) return {};

  const { getScriptTypeForAddress } = await import("@swapkit/toolboxes/utxo");
  return { scriptType: getScriptTypeForAddress(address, chain) };
}
