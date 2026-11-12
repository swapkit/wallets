"use client";

import type { LimitOrder } from "@swapkit/helpers";
import { ArrowRight, Loader2, RotateCcw } from "lucide-react";
import { getLimitOrderRowModel, type LimitOrderRowPrices } from "../../lib/limit-orders/row-model";
import { truncateMiddle } from "../../lib/truncate";
import { useIsLimitOrderCancelPending } from "../../stores/limit-order-cancel-store";
import { AssetIcon } from "../simple/asset-icon";
import { ActivityRow, getRelativeTime } from "./activity-parts";
import { LimitOrderStatusIcon } from "./limit-order-status-icon";

export function LimitOrderItem({
  isPriceLoading,
  now,
  onSelect,
  order,
  price,
}: {
  isPriceLoading?: boolean;
  now: number;
  onSelect: (orderId: string) => void;
  order: LimitOrder;
  price?: LimitOrderRowPrices;
}) {
  const isCancelPending = useIsLimitOrderCancelPending(order.orderId);
  const row = getLimitOrderRowModel(order, price ?? {}, now, { isCancelPending });
  const createdAt = Date.parse(order.createdAt);

  return (
    <ActivityRow
      className="sk-ui-cursor-pointer"
      icon={
        row.isCancelling ? (
          <Loader2 aria-hidden className="sk-ui-size-4 sk-ui-shrink-0 sk-ui-animate-spin sk-ui-text-muted-foreground" />
        ) : (
          <LimitOrderStatusIcon status={order.status} />
        )
      }
      onClick={() => onSelect(order.orderId)}>
      <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-1 sk-ui-flex-col sk-ui-gap-1.5">
        <div className="sk-ui-flex sk-ui-items-start sk-ui-justify-between sk-ui-gap-2">
          <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-items-center sk-ui-gap-2">
            <span className="sk-ui-font-medium sk-ui-text-sm">Limit</span>
            {Number.isNaN(createdAt) ? null : (
              <span className="sk-ui-text-muted-foreground sk-ui-text-xs">{getRelativeTime(createdAt, now)}</span>
            )}
          </div>

          <span className="sk-ui-shrink-0 sk-ui-font-mono sk-ui-text-muted-foreground sk-ui-text-xs sk-ui-leading-5 sk-ui-transition-colors group-hover:sk-ui-text-foreground">
            {truncateMiddle(order.orderHash)}
          </span>
        </div>

        <div className="sk-ui-flex sk-ui-flex-wrap sk-ui-items-center sk-ui-gap-x-1.5 sk-ui-gap-y-1">
          <span className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5 sk-ui-whitespace-nowrap">
            <AssetIcon asset={order.sellAsset} className="sk-ui-size-5" />
            <span className="sk-ui-text-sm">
              <span className="sk-ui-text-muted-foreground">{row.sellAmount} </span>
              {row.sellTicker}
            </span>
          </span>

          <span className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5 sk-ui-whitespace-nowrap">
            <ArrowRight className="sk-ui-mx-0.5 sk-ui-size-3 sk-ui-shrink-0 sk-ui-text-muted-foreground" />
            <AssetIcon asset={order.buyAsset} className="sk-ui-size-5" />
            <span className="sk-ui-text-sm">
              <span className="sk-ui-text-muted-foreground">{row.buyAmount} </span>
              {row.buyTicker}
            </span>
          </span>

          {row.usd?.text ? (
            <span className="sk-ui-text-muted-foreground sk-ui-text-xs sk-ui-tabular-nums">{row.usd.text}</span>
          ) : row.usd?.pending && isPriceLoading ? (
            <span className="sk-ui-inline-block sk-ui-h-3.5 sk-ui-w-16 sk-ui-animate-pulse sk-ui-rounded-sm sk-ui-bg-secondary" />
          ) : null}
        </div>

        <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-2">
          <span
            className={`sk-ui-rounded-md sk-ui-text-xs sk-ui-transition-colors group-hover:sk-ui-bg-bg-active ${row.chipClass}`}
            style={{ margin: "0 -6px", padding: "1px 6px" }}>
            {row.chip}
          </span>

          {row.trailing?.kind === "refund" ? (
            <span className="sk-ui-flex sk-ui-items-center sk-ui-gap-1 sk-ui-text-success-foreground sk-ui-text-xs">
              <RotateCcw className="sk-ui-size-3" />
              {row.trailing.text}
            </span>
          ) : row.trailing ? (
            <span className="sk-ui-text-muted-foreground sk-ui-text-xs sk-ui-tabular-nums">{row.trailing.text}</span>
          ) : null}
        </div>

        {row.bar ? (
          <div className="sk-ui-h-1.5 sk-ui-w-full sk-ui-overflow-hidden sk-ui-rounded-full sk-ui-bg-bg-active">
            <div
              className={`sk-ui-h-full sk-ui-rounded-full ${row.bar.className}`}
              style={{ width: `${row.bar.percent}%` }}
            />
          </div>
        ) : null}
      </div>
    </ActivityRow>
  );
}
