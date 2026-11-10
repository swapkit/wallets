import { type LimitOrder, SwapKitNumber } from "@swapkit/helpers";
import { getRemainingSellAmount, hasFills, isDepositedOrder } from "./amounts";
import { formatFeeBps } from "./price";
import { formatOrderAmount, getTicker } from "./row-model";
import { isLiveLimitOrderStatus, isTerminalLimitOrderStatus } from "./status";

export type LimitOrderFeeStage = "estimated" | "soFar" | "final" | "flat" | "none";

export type LimitOrderFeeRow = { amount: string | null; isFree: boolean; key: string; label: string };

export type LimitOrderFeeBlockModel = {
  caption: string | null;
  flatValue: string | null;
  rows: LimitOrderFeeRow[];
  stage: LimitOrderFeeStage;
  sumBps: string | null;
  title: string | null;
};

type Fee = LimitOrder["fees"][number];

const FEE_ROWS = [
  { key: "liquidity", label: "Liquidity fee", optional: false, types: ["liquidity"] },
  { key: "affiliate", label: "Exchange fee", optional: false, types: ["affiliate"] },
  { key: "network", label: "Network fee", optional: false, types: ["network", "outbound"] },
  { key: "service", label: "Service fee", optional: true, types: ["service"] },
] as const;

const STAGE_TITLES: Record<LimitOrderFeeStage, string | null> = {
  estimated: "Estimated fees",
  final: "Final fees",
  flat: "Final fees",
  none: null,
  soFar: "Fees so far",
};

function toNumber(value: string) {
  try {
    return new SwapKitNumber(value);
  } catch {
    return null;
  }
}

function sumByAsset(fees: Fee[]) {
  const totals = new Map<string, SwapKitNumber>();
  for (const fee of fees) {
    const amount = toNumber(fee.amount);
    if (!amount?.gt(0)) continue;
    const current = totals.get(fee.asset);
    totals.set(fee.asset, current ? current.add(amount) : amount);
  }
  return [...totals.entries()].map(
    ([asset, amount]) => `${formatOrderAmount(amount.getValue("string"))} ${getTicker(asset)}`,
  );
}

function getRows(fees: Fee[]) {
  return FEE_ROWS.flatMap(({ key, label, optional, types }) => {
    const matching = fees.filter(({ type }) => (types as readonly string[]).includes(type));
    const amounts = sumByAsset(matching);
    if (optional && amounts.length === 0) return [];
    return [{ amount: amounts.length > 0 ? amounts.join(" + ") : null, isFree: amounts.length === 0, key, label }];
  });
}

function getSumBps(fees: Fee[]) {
  const counted = fees.filter(
    ({ amountBps, type }) =>
      amountBps !== undefined && FEE_ROWS.some(({ types }) => (types as readonly string[]).includes(type)),
  );
  if (counted.length === 0) return null;
  return formatFeeBps(counted.reduce((total, { amountBps }) => total + (amountBps ?? 0), 0));
}

function getStage(order: LimitOrder): LimitOrderFeeStage {
  if (order.status === "FAILED") return "none";
  const filled = hasFills(order);
  if (isLiveLimitOrderStatus(order.status)) return filled ? "soFar" : "estimated";
  if (!isTerminalLimitOrderStatus(order.status)) return "none";
  if (filled) return "final";
  if ((order.status === "CANCELLED" || order.status === "EXPIRED") && isDepositedOrder(order)) return "flat";
  return "none";
}

function getCaption(order: LimitOrder, stage: LimitOrderFeeStage) {
  const sell = getTicker(order.sellAsset);
  const buy = getTicker(order.buyAsset);
  const filledSell = formatOrderAmount(order.filledSellAmount);
  const filledBuy = formatOrderAmount(order.filledBuyAmount);
  const deposited = isDepositedOrder(order);

  switch (stage) {
    case "estimated":
      return deposited
        ? "What this order will cost if it fills. Taken from what you receive."
        : `What this order will cost if it fills. Charged to the filler, not deducted from your ${formatOrderAmount(order.buyAmount)} ${buy}.`;
    case "soFar":
      return deposited
        ? `Taken from the ${filledBuy} ${buy} already sent to you, not added on top. It grows with each fill.`
        : `Charged on the ${filledSell} ${sell} filled so far, to the filler — not deducted from your ${filledBuy} ${buy}. It grows with each fill.`;
    case "final": {
      const remaining = getRemainingSellAmount(order);
      const unfilled = toNumber(remaining)?.gt(0)
        ? ` The unfilled ${formatOrderAmount(remaining)} ${sell} cost you nothing.`
        : "";
      return `Charged on the ${filledBuy} ${buy} that actually filled.${unfilled}`;
    }
    case "flat":
      return "Returning your funds cost a network fee. The liquidity and exchange fees were not charged, because the order never settled.";
    default:
      return null;
  }
}

export function getFeeBlockModel(order: LimitOrder): LimitOrderFeeBlockModel {
  let stage = getStage(order);
  const fees = order.fees ?? [];
  const flatAmounts =
    stage === "flat" ? sumByAsset(fees.filter(({ type }) => type === "network" || type === "outbound")) : [];
  if (stage === "flat" && flatAmounts.length === 0) stage = "none";

  return {
    caption: getCaption(order, stage),
    flatValue: stage === "flat" ? flatAmounts.join(" + ") : null,
    rows: stage === "none" || stage === "flat" ? [] : getRows(fees),
    stage,
    sumBps: stage === "none" || stage === "flat" ? null : getSumBps(fees),
    title: STAGE_TITLES[stage],
  };
}
