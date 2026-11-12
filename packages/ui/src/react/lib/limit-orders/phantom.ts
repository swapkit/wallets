import type { LimitOrder } from "@swapkit/helpers";
import { DEPOSIT_FLOW_PROVIDERS, hasFills } from "./amounts";

export function isPhantomExpiry(order: LimitOrder) {
  if (order.status !== "EXPIRED") return false;
  if (hasFills(order) || (order.txHashes?.length ?? 0) > 0) return false;
  if (Date.parse(order.updatedAt) < Date.parse(order.expiresAt)) return true;
  return DEPOSIT_FLOW_PROVIDERS.has(order.provider) && !order.depositHash;
}
