"use client";

import type { AssetValue, LimitOrderTokensResponse } from "@swapkit/helpers";
import { useMemo } from "react";
import type { AssetPickerFilter } from "../../../components/composable/swap-asset-select";
import { useSwapKit } from "../../../swapkit-context";
import { getLimitInputAllowlist, getLimitOutputAllowlist, type LimitAssetOption } from "../lib/pairs";

const NO_ASSETS: LimitAssetOption[] = [];

const EMPTY_STATE = {
  body: "Limit orders are temporarily paused for this chain. Clear the chain filter to see what's still available.",
  title: "No tokens available right now",
};

const ERROR_STATE = { body: "Couldn't load tokens. Try again later.", title: "Tokens unavailable" };

export function useLimitAssetFilters({
  isLoadingTokens,
  isTokensError,
  sellValue,
  tokens,
}: {
  isLoadingTokens: boolean;
  isTokensError: boolean;
  sellValue: AssetValue | null;
  tokens: LimitOrderTokensResponse | null;
}) {
  const { swapKit, connectedWallets } = useSwapKit();
  const sellAsset = sellValue?.toString();
  const pending = isLoadingTokens ? null : NO_ASSETS;
  const emptyState = isTokensError && !tokens ? ERROR_STATE : EMPTY_STATE;

  const sellWallet = sellValue ? connectedWallets.get(sellValue.chain) : undefined;

  const allowedProviders = useMemo(() => {
    if (!swapKit || !sellValue || !sellWallet) return null;
    try {
      const providers = swapKit.limitOrder.allowedProviders({ sellAsset: sellValue });
      return providers.length ? providers : null;
    } catch {
      return null;
    }
  }, [swapKit, sellValue, sellWallet]);

  const sellFilter = useMemo<AssetPickerFilter>(
    () => ({ assets: tokens ? getLimitInputAllowlist(tokens) : pending, emptyState }),
    [tokens, pending, emptyState],
  );

  const buyFilter = useMemo<AssetPickerFilter>(() => {
    const options =
      tokens && sellAsset ? getLimitOutputAllowlist({ providers: allowedProviders, sellAsset, tokens }) : null;
    return { assets: options ?? pending, emptyState };
  }, [tokens, sellAsset, allowedProviders, pending, emptyState]);

  return { buyFilter, sellFilter };
}
