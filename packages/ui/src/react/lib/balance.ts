import { AssetValue, type Chain } from "@swapkit/helpers";

export function findBalance(
  balancesByChain: Map<Chain, { balance: AssetValue }[]>,
  value: AssetValue | null,
  isWalletConnected: boolean,
) {
  if (!value || !isWalletConnected) return null;
  const identifier = value.toString().toLowerCase();
  return (
    balancesByChain.get(value.chain)?.find(({ balance }) => balance.toString().toLowerCase() === identifier)?.balance ??
    null
  );
}

export function exceedsBalance(asset: string, amount: string | null, balance: AssetValue | null) {
  if (!balance || !amount) return false;
  try {
    return AssetValue.from({ asset, value: amount }).gt(balance);
  } catch {
    return false;
  }
}
