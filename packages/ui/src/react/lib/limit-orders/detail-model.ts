import { AssetValue, type Chain, getChainConfig, type LimitOrder, SwapKitNumber } from "@swapkit/helpers";
import { formatCurrency } from "../../../lib/utils";
import { getChainOfId } from "../asset-chain";
import { getChainName } from "../chain-catalog";
import {
  getFillCount,
  getFillPercent,
  getRefundEntry,
  getRemainingSellAmount,
  hasFills,
  isDepositedOrder,
  isNativeOneinchSell,
  isPositive,
} from "./amounts";
import { getFeeBlockModel, type LimitOrderFeeBlockModel } from "./fees";
import { formatMarketChip, getLimitOrderDirection, getMarketComparison } from "./market";
import { formatLimitPrice, getLimitSides, toDisplayPrice } from "./price";
import { formatCountdown, formatOrderAmount, getTicker, type LimitOrderRowPrices } from "./row-model";
import {
  getLimitOrderStatusMeta,
  isLiveLimitOrderStatus,
  isTerminalLimitOrderStatus,
  LIMIT_ORDER_LIVE_BAR_CLASS,
  LIMIT_ORDER_TERMINAL_BAR_CLASS,
} from "./status";

type TxEntry = NonNullable<LimitOrder["txHashes"]>[number];

export type LimitOrderSummaryRow = { key: string; label: string; value: string | null };

export type LimitOrderMarketRow =
  | { status: "ready"; chip: string; fillableNow: boolean; value: string }
  | { status: "pending" };

export type LimitOrderTimelineEntry = {
  chain: Chain | undefined;
  chainName: string;
  key: string;
  markerAsset: string;
  title: string;
  txHash: string;
  type: TxEntry["type"];
};

export type LimitOrderDetailModel = {
  action: "cancel" | "placeNew" | "none";
  address: { label: string; value: string } | null;
  buyAmount: string;
  buyTicker: string;
  expiry: { countdown: string | null; time: number } | null;
  failure: { body: string; title: string } | null;
  fees: LimitOrderFeeBlockModel;
  feesChargedNone: boolean;
  isCancelling: boolean;
  limitPrice: string | null;
  market: LimitOrderMarketRow | null;
  progress: {
    barClass: string;
    caption: string | null;
    isHighlighted: boolean;
    label: string;
    percent: number;
    value: string;
  } | null;
  refund: { entry: LimitOrderTimelineEntry | null; text: string } | null;
  sellAmount: string;
  sellTicker: string;
  statusLine: string;
  summary: LimitOrderSummaryRow[];
  timeline: LimitOrderTimelineEntry[];
  timelineEmpty: string | null;
};

const NUMBER_WORDS: Record<number, string> = { 2: "two" };

function approxUsd(value: number) {
  return `≈ ${formatCurrency(value)}`;
}

function usdOf(amount: string, price: number | undefined) {
  if (!price || !isPositive(amount)) return null;
  return approxUsd(new SwapKitNumber(amount).mul(price).getValue("number"));
}

function storedUsd(value: string | null | undefined) {
  if (!isPositive(value)) return null;
  return approxUsd(new SwapKitNumber(value ?? "0").getValue("number"));
}

function getChainIdOfAsset(asset: string) {
  try {
    return getChainConfig(AssetValue.from({ asset }).chain).chainId as string;
  } catch {
    return null;
  }
}

export function getLimitOrderStatusLine(order: LimitOrder, isCancelling = false) {
  if (isCancelling) return "Cancelling…";
  const filled = hasFills(order);
  switch (order.status) {
    case "OPEN":
      return "Open · waiting on the market";
    case "PARTIAL":
      return "In Progress · partly filled";
    case "SUBMITTED":
      return "Submitting · waiting for the order book";
    case "CANCELLED":
      if (getRefundEntry(order)) return "Cancelled · funds returned";
      return filled ? "Cancelled · partly filled" : "Cancelled · nothing filled";
    case "EXPIRED":
      if (getRefundEntry(order)) return "Expired · funds returned";
      return filled ? "Expired · partly filled" : "Expired · nothing filled";
    case "FAILED":
      return "Failed · nothing traded";
    case "FILLED":
      return "Completed · fully filled";
    default:
      return getLimitOrderStatusMeta(order.status).label ?? order.status;
  }
}

const TIMELINE_TITLES: Record<TxEntry["type"], string> = {
  cancel: "Cancel",
  deposit: "Deposit",
  fill: "Fill",
  refund: "Refund",
  withdraw: "Settlement",
};

function getTxEntries(order: LimitOrder) {
  const entries: TxEntry[] = [...(order.txHashes ?? [])];
  if (order.depositHash && !entries.some(({ type }) => type === "deposit")) {
    const chainId = getChainIdOfAsset(order.sellAsset);
    if (chainId) entries.unshift({ chainId, txHash: order.depositHash, type: "deposit" } as TxEntry);
  }
  return entries;
}

function getTimeline(order: LimitOrder) {
  return getTxEntries(order).map((entry, index): LimitOrderTimelineEntry => {
    const chain = getChainOfId(entry.chainId);
    return {
      chain: chain ?? undefined,
      chainName: chain ? getChainName(chain) : entry.chainId,
      key: `${entry.type}-${entry.txHash}-${index}`,
      markerAsset: entry.type === "fill" || entry.type === "withdraw" ? order.buyAsset : order.sellAsset,
      title: TIMELINE_TITLES[entry.type] ?? "Transaction",
      txHash: entry.txHash,
      type: entry.type,
    };
  });
}

function getProgressCaption(order: LimitOrder, sellTicker: string, buyTicker: string, isLive: boolean) {
  const filledSell = formatOrderAmount(order.filledSellAmount);
  const filledBuy = formatOrderAmount(order.filledBuyAmount);
  const remaining = formatOrderAmount(getRemainingSellAmount(order));
  const fills = getFillCount(order.txHashes);
  const across = fills > 1 ? `, across ${NUMBER_WORDS[fills] ?? fills} fills` : "";
  const deposited = isDepositedOrder(order);

  if (isLive) {
    if (!hasFills(order)) return "This order can be filled in more than one go. No fills yet.";
    const head = `${filledSell} ${sellTicker} sold so far for ${filledBuy} ${buyTicker}${across}.`;
    return deposited
      ? `${head} Your remaining ${remaining} ${sellTicker} is still held against this order.`
      : `${head} The rest is still on the book.`;
  }

  const head = `${filledSell} of ${formatOrderAmount(order.sellAmount)} ${sellTicker} was sold for ${filledBuy} ${buyTicker}.`;
  if (order.status === "EXPIRED") {
    return deposited || isNativeOneinchSell(order)
      ? `${head} The rest expired unfilled.`
      : `${head} The rest expired unfilled and is still in your wallet.`;
  }
  return `${head} The rest was cancelled unfilled.`;
}

function getRefund(order: LimitOrder, sellTicker: string, timeline: LimitOrderTimelineEntry[]) {
  const refundEntry = getRefundEntry(order);
  if (!refundEntry) return null;
  const entry = timeline.find(({ txHash, type }) => type === "refund" && txHash === refundEntry.txHash) ?? null;
  return { entry, text: `Your remaining ${sellTicker} was returned to your wallet` };
}

function getSummary(order: LimitOrder, prices: LimitOrderRowPrices, isLive: boolean) {
  const filled = hasFills(order);
  const rows: LimitOrderSummaryRow[] = [];

  if (isLive) {
    const remaining = getRemainingSellAmount(order);
    if (isPositive(remaining))
      rows.push({ key: "open", label: "Value still open", value: usdOf(remaining, prices.sell) });
    if (filled)
      rows.push({ key: "received", label: "Received so far", value: usdOf(order.filledBuyAmount, prices.buy) });
    return rows;
  }

  if (!isTerminalLimitOrderStatus(order.status)) return rows;

  if (filled) {
    const value = storedUsd(order.usdValueClose);
    if (value) rows.push({ key: "received", label: "Received", value });
    return rows;
  }

  if (order.status !== "FILLED") {
    const value = storedUsd(order.usdValueOpen);
    if (value) rows.push({ key: "placed", label: "Value when placed", value });
  }
  return rows;
}

function getMarket(order: LimitOrder, prices: LimitOrderRowPrices, isLive: boolean): LimitOrderMarketRow | null {
  if (!isLive) return null;
  const comparison = getMarketComparison({ buyPriceUsd: prices.buy, order, sellPriceUsd: prices.sell });
  if (!comparison) return { status: "pending" };
  const chip = formatMarketChip(comparison);
  const value = formatLimitPrice(comparison.marketDisplay);
  if (!chip || !value) return null;
  return { chip, fillableNow: comparison.fillableNow, status: "ready", value };
}

function getLimitPriceText(order: LimitOrder) {
  const direction = getLimitOrderDirection(order.limitPrice);
  if (!direction) return null;
  const display = toDisplayPrice({ direction, wirePrice: order.limitPrice });
  const price = display ? formatLimitPrice(display) : null;
  if (!price) return null;
  const { baseAsset, quoteAsset } = getLimitSides({ buyAsset: order.buyAsset, direction, sellAsset: order.sellAsset });
  return `${price} ${getTicker(quoteAsset)} per ${getTicker(baseAsset)}`;
}

function getAddress(order: LimitOrder, isLive: boolean, hasRefund: boolean) {
  if (hasRefund) return order.maker ? { label: "Returned to", value: order.maker } : null;
  if (!order.receiver) return null;
  if (isLive) return { label: "Receiving at", value: order.receiver };
  if (isTerminalLimitOrderStatus(order.status) && hasFills(order))
    return { label: "Received at", value: order.receiver };
  return null;
}

function getExpiry(order: LimitOrder, isLive: boolean, now: number) {
  if (isTerminalLimitOrderStatus(order.status)) return null;
  const countdown = isLive ? (formatCountdown(order.expiresAt, now)?.replace(/ left$/, "") ?? null) : null;
  return { countdown, time: Date.parse(order.expiresAt) };
}

function getFailure(order: LimitOrder, sellTicker: string) {
  if (order.status !== "FAILED") return null;
  const fundsMoved = isDepositedOrder(order) || isNativeOneinchSell(order);
  return {
    body: fundsMoved
      ? "Nothing was traded. Place a new order to try again."
      : `Nothing was traded and your ${formatOrderAmount(order.sellAmount)} ${sellTicker} never left your wallet. Place a new order to try again.`,
    title: "This order can no longer be filled",
  };
}

export function getLimitOrderDetailModel(
  order: LimitOrder,
  prices: LimitOrderRowPrices,
  now: number,
  { isCancelPending = false }: { isCancelPending?: boolean } = {},
): LimitOrderDetailModel {
  const isLive = isLiveLimitOrderStatus(order.status);
  const isTerminal = isTerminalLimitOrderStatus(order.status);
  const isCancelling = !isTerminal && (Boolean(order.cancelRequestedAt) || isCancelPending);
  const sellTicker = getTicker(order.sellAsset);
  const buyTicker = getTicker(order.buyAsset);
  const filled = hasFills(order);
  const percent = getFillPercent(order);
  const timeline = getTimeline(order);
  const refund = getRefund(order, sellTicker, timeline);
  const showProgress = !refund && (isLive || ((order.status === "EXPIRED" || order.status === "CANCELLED") && filled));

  return {
    action: isLive ? "cancel" : isTerminal ? "placeNew" : "none",
    address: getAddress(order, isLive, Boolean(refund)),
    buyAmount: formatOrderAmount(order.buyAmount),
    buyTicker,
    expiry: getExpiry(order, isLive, now),
    failure: getFailure(order, sellTicker),
    fees: getFeeBlockModel(order),
    feesChargedNone: order.status === "FAILED",
    isCancelling,
    limitPrice: getLimitPriceText(order),
    market: getMarket(order, prices, isLive),
    progress: showProgress
      ? {
          barClass: isLive ? LIMIT_ORDER_LIVE_BAR_CLASS : LIMIT_ORDER_TERMINAL_BAR_CLASS,
          caption: getProgressCaption(order, sellTicker, buyTicker, isLive),
          isHighlighted: isLive && percent > 0,
          label: order.status === "EXPIRED" ? "Filled before expiry" : "Filled",
          percent,
          value: isLive
            ? `${percent}% · ${formatOrderAmount(getRemainingSellAmount(order))} ${sellTicker} remaining`
            : `${percent}%`,
        }
      : null,
    refund,
    sellAmount: formatOrderAmount(order.sellAmount),
    sellTicker,
    statusLine: getLimitOrderStatusLine(order, isCancelling),
    summary: getSummary(order, prices, isLive),
    timeline,
    timelineEmpty:
      timeline.length > 0
        ? null
        : isLive
          ? "No transactions yet. Nothing has moved on-chain — this order is a signed instruction until it fills."
          : "No transactions. Nothing ever moved on-chain, so there is nothing to look up.",
  };
}
