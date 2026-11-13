import { AssetValue, type Chain, getChainConfig } from "@swapkit/helpers";

export function getAssetChain(asset: string) {
  if (!asset) return undefined;
  try {
    return AssetValue.from({ asset }).chain;
  } catch {
    return undefined;
  }
}

export function getChainOfId(chainId: number | string) {
  try {
    return (getChainConfig(String(chainId) as Parameters<typeof getChainConfig>[0]) as { chain?: Chain }).chain ?? null;
  } catch {
    return null;
  }
}
