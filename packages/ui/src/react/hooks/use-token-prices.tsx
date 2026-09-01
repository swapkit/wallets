import { SwapKitApi, type Token } from "@swapkit/helpers";
import { useCallback, useMemo } from "react";
import { create } from "zustand";
import { captureWidgetError } from "../sentry";

type TokenPrice = { identifier: Token["identifier"]; priceUSD: number };

const useTokenPricesStore = create<{
  pricesByTokenId: Map<TokenPrice["identifier"], TokenPrice>;
  setTokenPrices: (tokenPrices: TokenPrice[]) => void;
  clearTokenPrices: () => void;
  isFetchingTokenPrices: boolean;
  setIsFetchingTokenPrices: (isFetchingTokenPrices: boolean) => void;
}>((set) => {
  return {
    clearTokenPrices: () => set({ pricesByTokenId: new Map() }),
    isFetchingTokenPrices: false,
    pricesByTokenId: new Map(),
    setIsFetchingTokenPrices: (isFetchingTokenPrices: boolean) => set({ isFetchingTokenPrices }),
    setTokenPrices: (tokenPrices: TokenPrice[]) =>
      set((state) => {
        const newPricesByTokenId = new Map(state.pricesByTokenId);

        tokenPrices?.forEach((tokenPrice) => {
          newPricesByTokenId.set(tokenPrice?.identifier, tokenPrice);
        });

        return { pricesByTokenId: newPricesByTokenId };
      }),
  };
});

export const useTokenPrices = () => {
  const { pricesByTokenId, setTokenPrices, clearTokenPrices, isFetchingTokenPrices, setIsFetchingTokenPrices } =
    useTokenPricesStore((state) => state);

  const fetchTokenPrices = useCallback(
    async (tokenIds: Token["identifier"][]) => {
      setIsFetchingTokenPrices(true);
      try {
        const getPriceInput = tokenIds.map((tokenId) => ({ identifier: tokenId }));

        console.debug("[SwapKit] getPrice request:", getPriceInput);
        const tokenPrices = await SwapKitApi.getPrice({ metadata: false, tokens: getPriceInput });

        const extractedTokenPrices = tokenPrices
          .filter((tokenPrice) => tokenPrice?.identifier && tokenPrice?.price_usd)
          .map((tokenPrice) => ({
            identifier: tokenPrice?.identifier as Token["identifier"],
            priceUSD: tokenPrice?.price_usd ?? 0,
          }));

        setTokenPrices?.(extractedTokenPrices);
      } catch (error) {
        console.error("Failed to fetch token prices:", error);
        captureWidgetError(error, { category: "data", tags: { endpoint: "price" } });
      } finally {
        setIsFetchingTokenPrices(false);
      }
    },
    [setTokenPrices, setIsFetchingTokenPrices],
  );

  return useMemo(
    () => ({ clearTokenPrices, fetchTokenPrices, isFetchingTokenPrices, pricesByTokenId, setTokenPrices }),
    [clearTokenPrices, fetchTokenPrices, isFetchingTokenPrices, pricesByTokenId, setTokenPrices],
  );
};
