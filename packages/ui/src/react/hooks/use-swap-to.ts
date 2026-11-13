import { SwapKitApi, type SwapToAsset } from "@swapkit/helpers/api";
import { hasApiAuth, useApiConfig, useSwapKitQuery } from "../lib/query-client";

const NO_SWAP_TO_ASSETS: SwapToAsset[] = [];

async function fetchSwapTo(sellAsset: string) {
  if (!hasApiAuth()) return [];
  const response = await SwapKitApi.getSwapTo({ sellAsset });
  return response.buyAssets;
}

export function useSwapTo(sellAsset: string | undefined) {
  const apiConfig = useApiConfig();

  const { data, isFetching } = useSwapKitQuery({
    enabled: Boolean(sellAsset) && apiConfig.hasAuth && apiConfig.settled,
    meta: { category: "api", extra: { sellAsset }, tags: { endpoint: "swapTo" } },
    queryFn: () => fetchSwapTo(sellAsset as string),
    queryKey: ["swapTo", apiConfig.key, sellAsset],
    staleTime: 60 * 1000,
  });

  return { isFetchingSwapTo: isFetching, swapToAssets: data ?? NO_SWAP_TO_ASSETS };
}
