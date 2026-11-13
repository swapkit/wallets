import type { LimitOrder } from "@swapkit/helpers";
import {
  compareWirePrices,
  formatLimitPercent,
  getSeedWirePrice,
  type LimitDirection,
  limitPriceToPercent,
  toDisplayPrice,
} from "./price";

export type LimitOrderMarketComparison = {
  direction: LimitDirection;
  fillableNow: boolean;
  limitDisplay: string;
  marketDisplay: string;
  percent: string;
};

function isUsablePrice(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

export function getLimitOrderDirection(limitPrice: string): LimitDirection | null {
  const comparison = compareWirePrices(limitPrice, "1");
  if (comparison === null) return null;
  return comparison >= 0 ? "sell" : "buy";
}

export function getMarketComparison({
  buyPriceUsd,
  order,
  sellPriceUsd,
}: {
  buyPriceUsd?: number;
  order: Pick<LimitOrder, "limitPrice">;
  sellPriceUsd?: number;
}): LimitOrderMarketComparison | null {
  if (!isUsablePrice(sellPriceUsd) || !isUsablePrice(buyPriceUsd)) return null;
  const direction = getLimitOrderDirection(order.limitPrice);
  if (!direction) return null;

  const limitDisplay = toDisplayPrice({ direction, wirePrice: order.limitPrice });
  const marketWire = getSeedWirePrice({ buyPriceUsd, sellPriceUsd });
  const marketDisplay = toDisplayPrice({ direction, wirePrice: marketWire });
  if (limitDisplay === null || marketDisplay === null) return null;

  const percent = limitPriceToPercent({ direction, displayPrice: limitDisplay, effectiveFillPrice: marketWire });
  const reached = compareWirePrices(marketWire, order.limitPrice);
  if (percent === null || reached === null) return null;

  return { direction, fillableNow: reached >= 0, limitDisplay, marketDisplay, percent };
}

export function formatMarketChip(comparison: Pick<LimitOrderMarketComparison, "fillableNow" | "percent">) {
  if (comparison.fillableNow) return "fillable now";
  const percent = formatLimitPercent(comparison.percent);
  return percent === null ? null : `${percent.replace(/^-/, "−")}% to go`;
}
