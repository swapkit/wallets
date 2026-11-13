import { SwapKitApi } from "@swapkit/helpers/api";
import { useApiConfig, useSwapKitQuery } from "../lib/query-client";

export function useLimitOrderTokens() {
  const apiConfig = useApiConfig();

  const { data, isError, isPending } = useSwapKitQuery({
    enabled: apiConfig.hasAuth && apiConfig.settled,
    meta: { category: "api", tags: { endpoint: "limitTokens" } },
    queryFn: () => SwapKitApi.getLimitOrderTokens(),
    queryKey: ["limitOrderTokens", apiConfig.key],
    staleTime: 5 * 60 * 1000,
  });

  return { isLoadingTokens: isPending, isTokensError: isError, tokens: data ?? null };
}
