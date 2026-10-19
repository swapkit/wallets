import { AssetValue, type Chain, getChainConfig } from "@swapkit/helpers";
import { SwapKitApi } from "@swapkit/helpers/api";

export type BalanceGetter = (address: string, scamFilter?: boolean) => Promise<AssetValue[]>;

export function getBalanceViaApi(chain: Chain, fallback: BalanceGetter): BalanceGetter {
  return async (address, scamFilter = true) => {
    let balances: Awaited<ReturnType<typeof SwapKitApi.getChainBalance>>;

    try {
      balances = await SwapKitApi.getChainBalance({ address, chain, scamFilter });
    } catch {
      return fallback(address, scamFilter);
    }

    const { baseDecimal } = getChainConfig(chain);
    const assets = balances.map(
      ({ decimal, identifier, value }) => new AssetValue({ decimal: decimal || baseDecimal, identifier, value }),
    );

    return assets.some((asset) => asset.isGasAsset) ? assets : [AssetValue.from({ chain }), ...assets];
  };
}
