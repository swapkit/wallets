import type { LimitOrder } from "@swapkit/helpers";

export function makeOrder(overrides: Partial<LimitOrder> = {}) {
  return {
    buyAmount: "2650",
    buyAsset: "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48",
    chainId: "1",
    createdAt: "2026-10-01T10:00:00.000Z",
    expiresAt: "2026-10-08T10:00:00.000Z",
    fees: [],
    filledBuyAmount: "0",
    filledSellAmount: "0",
    limitPrice: "2650",
    maker: "0xmaker",
    orderHash: "0xhash",
    orderId: "order-1",
    provider: "ONEINCH",
    receiver: null,
    sellAmount: "1",
    sellAsset: "ETH.ETH",
    status: "OPEN",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  } as LimitOrder;
}
