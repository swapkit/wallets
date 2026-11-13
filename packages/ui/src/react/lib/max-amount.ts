import { AssetValue, Chain } from "@swapkit/helpers";

// Mirrors the backend's sweep-enabled chains (EVM sweeps are disabled there).
const SWEEP_CHAINS: ReadonlySet<Chain> = new Set([
  Chain.Bitcoin,
  Chain.BitcoinCash,
  Chain.Dash,
  Chain.Dogecoin,
  Chain.Litecoin,
  Chain.Ton,
  Chain.Tron,
  Chain.Zcash,
]);

export function getMaxAmountOption({
  asset,
  balance,
  isWalletConnected,
}: {
  asset: string | null | undefined;
  balance: AssetValue | null | undefined;
  isWalletConnected: boolean;
}) {
  if (!asset || !balance || !isWalletConnected || !balance.gt(0)) return null;

  const { chain, isGasAsset } = AssetValue.from({ asset });
  if (isGasAsset && !SWEEP_CHAINS.has(chain)) return null;

  return { amount: balance.getValue("string"), enableSweep: isGasAsset };
}
