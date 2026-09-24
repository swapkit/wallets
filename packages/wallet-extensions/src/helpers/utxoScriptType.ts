import type { UTXOChain } from "@swapkit/helpers";

// Extensions choose their own account type, so the toolbox must use the one their address encodes.
export async function getUtxoScriptTypeParams({ address, chain }: { address?: string; chain: UTXOChain }) {
  if (!address) return {};

  const { getScriptTypeForAddress } = await import("@swapkit/toolboxes/utxo");
  return { scriptType: getScriptTypeForAddress(address, chain) };
}
