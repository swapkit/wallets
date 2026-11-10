import { describe, expect, test } from "bun:test";

import { mergeOrderPages } from "../merge";
import { makeOrder } from "./fixtures";

const EVM = "0xmaker";
const BTC = "bc1qowner";

describe("mergeOrderPages", () => {
  test("dedupes an order matched as maker on one address and receiver on another, newest first", () => {
    const crossChain = { createdAt: "2026-10-03T00:00:00.000Z", orderId: "cross", receiver: BTC };
    const fresh = makeOrder({ ...crossChain, filledSellAmount: "0.5", updatedAt: "2026-10-04T00:00:00.000Z" });
    const stale = makeOrder({ ...crossChain, filledSellAmount: "0", updatedAt: "2026-10-03T00:00:00.000Z" });
    const { orders, watermark } = mergeOrderPages([
      {
        cursors: { [BTC]: null, [EVM]: null },
        orders: [
          makeOrder({ createdAt: "2026-10-01T00:00:00.000Z", orderId: "old" }),
          fresh,
          makeOrder({ createdAt: "2026-10-02T00:00:00.000Z", orderId: "mid" }),
          stale,
        ],
      },
    ]);
    expect(orders.map(({ orderId }) => orderId)).toEqual(["cross", "mid", "old"]);
    expect(orders[0]).toBe(fresh);
    expect(watermark).toBeUndefined();
  });

  test("hides rows older than a still-paging stream's unfetched range", () => {
    const { orders, watermark } = mergeOrderPages([
      {
        cursors: { [BTC]: null, [EVM]: "2026-10-05T00:00:00.000Z" },
        orders: [
          makeOrder({ createdAt: "2026-10-06T00:00:00.000Z", orderId: "evm-new" }),
          makeOrder({ createdAt: "2026-10-05T00:00:00.000Z", orderId: "evm-last" }),
          makeOrder({ createdAt: "2026-10-04T00:00:00.000Z", maker: BTC, orderId: "btc-older" }),
        ],
      },
    ]);
    expect(watermark).toBe("2026-10-05T00:00:00.000Z");
    expect(orders.map(({ orderId }) => orderId)).toEqual(["evm-new", "evm-last"]);
  });

  test("the watermark follows the last page's cursors", () => {
    const { orders, watermark } = mergeOrderPages([
      {
        cursors: { [EVM]: "2026-10-05T00:00:00.000Z" },
        orders: [makeOrder({ createdAt: "2026-10-05T00:00:00.000Z", orderId: "a" })],
      },
      { cursors: { [EVM]: null }, orders: [makeOrder({ createdAt: "2026-10-01T00:00:00.000Z", orderId: "b" })] },
    ]);
    expect(watermark).toBeUndefined();
    expect(orders.map(({ orderId }) => orderId)).toEqual(["a", "b"]);
  });
});
