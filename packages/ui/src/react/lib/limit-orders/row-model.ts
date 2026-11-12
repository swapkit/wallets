import { AssetValue, type LimitOrder, SwapKitNumber } from "@swapkit/helpers";
import { formatCurrency, formatTokenAmount } from "../../../lib/utils";
import { getFillCount, getFillPercent, getRefundEntry, getRemainingSellAmount, hasFills, isPositive } from "./amounts";
import {
  getLimitOrderStatusMeta,
  isLiveLimitOrderStatus,
  LIMIT_ORDER_LIVE_BAR_CLASS,
  LIMIT_ORDER_TERMINAL_BAR_CLASS,
} from "./status";

export type LimitOrderRowPrices = { sell?: number; buy?: number };

export type LimitOrderRowTrailing =
  | { kind: "countdown"; text: string }
  | { kind: "fills"; text: string }
  | { kind: "refund"; text: string }
  | { kind: "sold"; text: string };

export type LimitOrderRowModel = {
  bar: { className: string; percent: number } | null;
  buyAmount: string;
  buyTicker: string;
  chip: string;
  chipClass: string;
  fillPercent: number;
  isCancelling: boolean;
  isLive: boolean;
  sellAmount: string;
  sellTicker: string;
  trailing: LimitOrderRowTrailing | null;
  usd: { pending: false; text: string } | { pending: true; text: null } | null;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function getTicker(asset: string) {
  try {
    return AssetValue.from({ asset }).ticker;
  } catch {
    return asset.split(".").at(-1)?.split("-")[0] ?? asset;
  }
}

export function getAssetPriceId(asset: string) {
  try {
    return AssetValue.from({ asset }).toString();
  } catch {
    return null;
  }
}

export const ORDER_AMOUNT_MAX_SIGNIFICANT_DIGITS = 10;

export function formatOrderAmount(amount: string) {
  return formatTokenAmount(amount, { maximumSignificantDigits: ORDER_AMOUNT_MAX_SIGNIFICANT_DIGITS });
}

export function formatCountdown(expiresAt: string, now: number) {
  const remaining = Math.max(Date.parse(expiresAt) - now, 0);
  if (Number.isNaN(remaining)) return null;
  const days = Math.floor(remaining / DAY_MS);
  const hours = Math.floor((remaining % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((remaining % HOUR_MS) / MINUTE_MS);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

function toUsd(amount: string, price: number) {
  return new SwapKitNumber(amount).mul(price).getValue("number");
}

function getLiveUsd(order: LimitOrder, prices: LimitOrderRowPrices): LimitOrderRowModel["usd"] {
  const remaining = getRemainingSellAmount(order);
  const needsBuy = isPositive(order.filledBuyAmount);
  const needsSell = isPositive(remaining);
  if ((needsBuy && !prices.buy) || (needsSell && !prices.sell)) return { pending: true, text: null };

  const received = needsBuy && prices.buy ? toUsd(order.filledBuyAmount, prices.buy) : 0;
  const open = needsSell && prices.sell ? toUsd(remaining, prices.sell) : 0;
  const total = received + open;
  return total > 0 ? { pending: false, text: `≈ ${formatCurrency(total)} now` } : null;
}

function getTerminalUsd(order: LimitOrder): LimitOrderRowModel["usd"] {
  if (!isPositive(order.filledBuyAmount) || !isPositive(order.usdValueClose)) return null;
  return {
    pending: false,
    text: `≈ ${formatCurrency(new SwapKitNumber(order.usdValueClose ?? "0").getValue("number"))}`,
  };
}

function getTrailing(order: LimitOrder, sellTicker: string, now: number): LimitOrderRowTrailing | null {
  if (isLiveLimitOrderStatus(order.status)) {
    const text = formatCountdown(order.expiresAt, now);
    return text ? { kind: "countdown", text } : null;
  }

  if (order.status === "FILLED") {
    const fills = getFillCount(order.txHashes);
    if (fills === 0) return null;
    return { kind: "fills", text: fills === 1 ? "1 fill" : `${fills} fills` };
  }

  if (getRefundEntry(order)) {
    return { kind: "refund", text: `${sellTicker} returned` };
  }

  if ((order.status === "CANCELLED" || order.status === "EXPIRED") && hasFills(order)) {
    return { kind: "sold", text: `${formatOrderAmount(order.filledSellAmount)} ${sellTicker} sold` };
  }

  return null;
}

export function getLimitOrderRowModel(
  order: LimitOrder,
  prices: LimitOrderRowPrices,
  now: number,
  { isCancelPending = false }: { isCancelPending?: boolean } = {},
) {
  const meta = getLimitOrderStatusMeta(order.status);
  const isLive = isLiveLimitOrderStatus(order.status);
  const isCancelling = isLive && (Boolean(order.cancelRequestedAt) || isCancelPending);
  const fillPercent = getFillPercent(order);
  const sellTicker = getTicker(order.sellAsset);
  const buyTicker = getTicker(order.buyAsset);
  const chip =
    order.status === "FAILED" && !hasFills(order)
      ? "Failed · never filled"
      : `${isCancelling ? "Cancelling…" : (meta.label ?? order.status)} · ${fillPercent}% filled`;

  return {
    bar:
      fillPercent > 0 && fillPercent < 100
        ? { className: isLive ? LIMIT_ORDER_LIVE_BAR_CLASS : LIMIT_ORDER_TERMINAL_BAR_CLASS, percent: fillPercent }
        : null,
    buyAmount: formatOrderAmount(order.buyAmount),
    buyTicker,
    chip,
    chipClass: meta.textClass ?? "sk-ui-text-muted-foreground",
    fillPercent,
    isCancelling,
    isLive,
    sellAmount: formatOrderAmount(order.sellAmount),
    sellTicker,
    trailing: getTrailing(order, sellTicker, now),
    usd: isLive ? getLiveUsd(order, prices) : getTerminalUsd(order),
  } satisfies LimitOrderRowModel;
}
