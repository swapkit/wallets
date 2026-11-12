"use client";

import { getTriggerSummary, type LimitDirection } from "../../../lib/limit-orders/price";
import type { useLimitOrderPricing } from "../hooks/use-limit-order-pricing";
import { LimitPriceCard, LimitPriceCardSkeleton } from "./limit-price-card";
import { LimitTriggerSummary } from "./limit-trigger-summary";

export function LimitPriceSection({
  baseTicker,
  direction,
  disabled,
  isCrossChain,
  pricing,
  quoteTicker,
}: {
  baseTicker: string;
  direction: LimitDirection;
  disabled: boolean;
  isCrossChain: boolean;
  pricing: ReturnType<typeof useLimitOrderPricing>;
  quoteTicker: string;
}) {
  const { anchor, band, displayRoute, market, priceInput, quoteAmount } = pricing;

  if (!displayRoute || !market || !anchor) {
    return pricing.isChecking || pricing.isFetching ? <LimitPriceCardSkeleton /> : null;
  }

  const triggerSummary =
    priceInput && quoteAmount ? getTriggerSummary({ direction, displayPrice: priceInput, quoteAmount }) : null;
  const summary =
    band && triggerSummary ? (
      <LimitTriggerSummary
        anchor={anchor}
        band={band}
        baseTicker={baseTicker}
        isCrossChain={isCrossChain}
        market={market}
        quoteTicker={quoteTicker}
        summary={triggerSummary}
      />
    ) : null;

  return (
    <LimitPriceCard
      band={band}
      baseTicker={baseTicker}
      direction={direction}
      disabled={disabled}
      effectiveFillPrice={displayRoute.effectiveFillPrice}
      market={market}
      onPercentChange={pricing.setPercent}
      onPriceChange={pricing.setPrice}
      percent={pricing.percent}
      price={priceInput ?? ""}
      quoteTicker={quoteTicker}
      summary={summary}
    />
  );
}
