import { SKConfig } from "@swapkit/helpers";
import { SwapKitApi, type SwapToAsset } from "@swapkit/helpers/api";
import { useEffect } from "react";
import { captureWidgetError } from "../sentry";
import { useSwapKitStore } from "../swapkit-context";

const inFlightSwapToRequests = new Map<string, Promise<SwapToAsset[]>>();
let activeSwapToRequestKey: string | null = null;

function getSwapToRequestKey(sellAsset: string) {
  const { apiKeys, envs, widgetId, widgetKey } = SKConfig.getState();
  const baseUrl = envs.isDev ? envs.devApiUrl : envs.apiUrl;
  const authKey = apiKeys.swapKit
    ? `api:${apiKeys.swapKit}`
    : widgetId && widgetKey
      ? `widget:${widgetId}:${widgetKey}`
      : "";

  return authKey ? `${baseUrl}|${authKey}|${sellAsset}` : null;
}

export function useSwapTo(sellAsset: string | undefined, options: { enabled?: boolean } = {}) {
  const { clearSwapToData, setSwapToData, setIsFetchingSwapTo, isFetchingSwapTo } = useSwapKitStore();
  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!enabled || !sellAsset) return;
    if (sellAsset === useSwapKitStore.getState().swapToSellAsset) return;
    const requestKey = getSwapToRequestKey(sellAsset);
    if (!requestKey) return;

    const isNewRequest = activeSwapToRequestKey !== requestKey;
    activeSwapToRequestKey = requestKey;

    if (isNewRequest) {
      clearSwapToData();
    }

    setIsFetchingSwapTo(true);

    const fetchSwapTo = async () => {
      try {
        let request = inFlightSwapToRequests.get(requestKey);
        if (!request) {
          request = SwapKitApi.getSwapTo({ sellAsset }).then((response) => response.buyAssets);
          inFlightSwapToRequests.set(requestKey, request);
        }

        const buyAssets = await request;

        if (activeSwapToRequestKey !== requestKey) return;

        setSwapToData(buyAssets, sellAsset);
      } catch (error) {
        if (activeSwapToRequestKey !== requestKey) return;
        console.warn("[SwapKit] Failed to fetch swap-to assets:", error);
        captureWidgetError(error, { category: "api", extra: { sellAsset }, tags: { endpoint: "swapTo" } });
      } finally {
        inFlightSwapToRequests.delete(requestKey);
        if (activeSwapToRequestKey === requestKey) {
          setIsFetchingSwapTo(false);
        }
      }
    };

    void fetchSwapTo();
  }, [enabled, sellAsset, clearSwapToData, setSwapToData, setIsFetchingSwapTo]);

  return { isFetchingSwapTo };
}
