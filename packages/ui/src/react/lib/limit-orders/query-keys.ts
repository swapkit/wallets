import type { LimitOrderScope } from "./status";

export const limitOrderKeys = {
  all: (cfg: string) => ["limitOrders", cfg] as const,
  detail: (cfg: string, orderId: string) => ["limitOrders", cfg, "detail", orderId] as const,
  list: (cfg: string, scope: LimitOrderScope, addressesKey: string) =>
    ["limitOrders", cfg, "list", scope, addressesKey] as const,
  lists: (cfg: string) => ["limitOrders", cfg, "list"] as const,
};
