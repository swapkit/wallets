import type { LimitOrder } from "@swapkit/helpers";

export type LimitOrderCursors = Record<string, string | null | undefined>;

export type LimitOrderPage = { orders: LimitOrder[]; cursors: LimitOrderCursors };

function toTime(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

export function getWatermark(cursors: LimitOrderCursors | undefined) {
  let watermark: string | undefined;
  for (const cursor of Object.values(cursors ?? {})) {
    if (!cursor) continue;
    if (watermark === undefined || toTime(cursor) > toTime(watermark)) watermark = cursor;
  }
  return watermark;
}

export function mergeOrderPages(pages: readonly LimitOrderPage[]) {
  const byId = new Map<string, LimitOrder>();
  for (const page of pages) {
    for (const order of page.orders) {
      const existing = byId.get(order.orderId);
      if (!existing || toTime(order.updatedAt) >= toTime(existing.updatedAt)) byId.set(order.orderId, order);
    }
  }

  const watermark = getWatermark(pages.at(-1)?.cursors);
  const floor = watermark === undefined ? undefined : toTime(watermark);
  const orders = [...byId.values()]
    .filter((order) => floor === undefined || toTime(order.createdAt) >= floor)
    .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt) || a.orderId.localeCompare(b.orderId));

  return { orders, watermark };
}
