import { AssetValue, type LimitOrder, ProviderName, SwapKitNumber } from "@swapkit/helpers";

export const DEPOSIT_FLOW_PROVIDERS: ReadonlySet<string> = new Set([ProviderName.HARBOR, ProviderName.NEAR]);

type FillAmounts = Pick<LimitOrder, "filledBuyAmount" | "filledSellAmount">;

export function isPositive(value: string | null | undefined) {
  if (!value) return false;
  try {
    return new SwapKitNumber(value).gt(0);
  } catch {
    return false;
  }
}

export function hasFills(order: FillAmounts) {
  return isPositive(order.filledSellAmount) || isPositive(order.filledBuyAmount);
}

export function getFillPercent(order: Pick<LimitOrder, "filledSellAmount" | "sellAmount" | "status">) {
  if (order.status === "FILLED") return 100;
  if (!isPositive(order.sellAmount) || !isPositive(order.filledSellAmount)) return 0;
  const ratio = new SwapKitNumber(order.filledSellAmount).mul(100).div(order.sellAmount).getValue("string");
  const whole = Number.parseInt(ratio.split(".")[0] ?? "0", 10);
  return Number.isFinite(whole) ? Math.min(Math.max(whole, 0), 99) : 0;
}

export function getRemainingSellAmount(order: Pick<LimitOrder, "filledSellAmount" | "sellAmount">) {
  if (!isPositive(order.filledSellAmount)) return new SwapKitNumber(order.sellAmount).getValue("string");
  const remaining = new SwapKitNumber(order.sellAmount).sub(order.filledSellAmount);
  return remaining.gt(0) ? remaining.getValue("string") : "0";
}

export function getFillCount(txHashes: LimitOrder["txHashes"]) {
  return (txHashes ?? []).filter(({ type }) => type === "fill").length;
}

export function getRefundEntry(order: Pick<LimitOrder, "status" | "txHashes">) {
  if (order.status !== "CANCELLED" && order.status !== "EXPIRED") return undefined;
  return order.txHashes?.find(({ type }) => type === "refund");
}

export function isDepositedOrder(order: Pick<LimitOrder, "depositHash" | "provider">) {
  return Boolean(order.depositHash) || DEPOSIT_FLOW_PROVIDERS.has(order.provider);
}

export function isNativeOneinchSell(order: Pick<LimitOrder, "provider" | "sellAsset">) {
  if (order.provider !== ProviderName.ONEINCH) return false;
  try {
    return AssetValue.from({ asset: order.sellAsset }).isGasAsset;
  } catch {
    return false;
  }
}
