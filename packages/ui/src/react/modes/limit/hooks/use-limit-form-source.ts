"use client";

import type { useAssetPair } from "../../../hooks/use-asset-pair";
import { getAssetChain } from "../../../lib/asset-chain";
import type { LimitDirection } from "../../../lib/limit-orders/price";
import { useWidgetFormStore } from "../../../stores/widget-form-store";
import { type LimitHeldOrder, useLimitOrderStore } from "../limit-order-store";

type AssetPair = ReturnType<typeof useAssetPair>;

function getLimitFormSource({
  held,
  pair,
  storedBuyAmount,
  storedDirection,
}: {
  held: LimitHeldOrder | null;
  pair: AssetPair;
  storedBuyAmount: string;
  storedDirection: LimitDirection;
}) {
  if (!held) {
    return {
      amount: pair.amount,
      buyAmount: storedBuyAmount,
      buyAsset: pair.outputAsset,
      buyChain: pair.outputAssetChain,
      direction: storedDirection,
      held,
      heldRoute: null,
      sellAsset: pair.inputAsset,
      sellChain: pair.inputAssetChain,
    };
  }

  const { direction, route } = held;
  return {
    amount: direction === "sell" ? route.sellAmount : pair.amount,
    buyAmount: direction === "buy" ? route.buyAmount : storedBuyAmount,
    buyAsset: route.buyAsset,
    buyChain: getAssetChain(route.buyAsset),
    direction,
    held,
    heldRoute: route,
    sellAsset: route.sellAsset,
    sellChain: getAssetChain(route.sellAsset),
  };
}

export function useLimitFormSource(pair: AssetPair) {
  const held = useLimitOrderStore((state) => state.held);
  const storedDirection = useLimitOrderStore((state) => state.direction);
  const storedBuyAmount = useLimitOrderStore((state) => state.buyAmount);
  const isPlacing = useWidgetFormStore((state) => state.pendingOperation === "limit");
  return {
    ...getLimitFormSource({ held, pair, storedBuyAmount, storedDirection }),
    isFormLocked: isPlacing || !!held,
    isPlacing,
  };
}
