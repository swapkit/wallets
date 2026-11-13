"use client";

import type { LimitOrder } from "@swapkit/helpers";
import { ArrowRight, CheckCircle2, ChevronLeft, Loader2, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { cn } from "../../../lib/utils";
import { useLimitOrderCancelGate } from "../../hooks/use-cancel-limit-order";
import { useLimitOrder } from "../../hooks/use-limit-order";
import { useOrderPrices } from "../../hooks/use-limit-orders";
import { showModal } from "../../hooks/use-modal";
import {
  getLimitOrderDetailModel,
  type LimitOrderDetailModel,
  type LimitOrderTimelineEntry,
} from "../../lib/limit-orders/detail-model";
import { formatExpiryDateTime } from "../../lib/limit-orders/expiry";
import type { LimitOrderFeeBlockModel } from "../../lib/limit-orders/fees";
import { truncateMiddle } from "../../lib/truncate";
import { useIsLimitOrderCancelPending } from "../../stores/limit-order-cancel-store";
import { LimitOrderCancelDialog } from "../dialogs/limit-order-cancel-dialog";
import { AssetIcon } from "../simple/asset-icon";
import { LimitNotice } from "../simple/limit-notice";
import { TruncatedAddress } from "../simple/truncated-address";
import { TxHashLink } from "../simple/tx-hash-link";
import { Button } from "../ui/button";
import { CollapsibleSection } from "../ui/collapsible-section";
import { SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { LimitOrderStatusIcon } from "./limit-order-status-icon";
import { TimelineRail } from "./route-provider-parts";

const CARD = "sk-ui-flex sk-ui-flex-col sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-bg-card sk-ui-p-3";

function formatTime(ms: number) {
  return Number.isNaN(ms) ? null : formatExpiryDateTime(ms / 1000);
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="sk-ui-font-semibold sk-ui-text-[11px] sk-ui-text-muted-foreground sk-ui-uppercase sk-ui-tracking-wider">
      {children}
    </span>
  );
}

function ValueSkeleton() {
  return (
    <span className="sk-ui-inline-block sk-ui-h-3.5 sk-ui-w-16 sk-ui-animate-pulse sk-ui-rounded-sm sk-ui-bg-bg-active" />
  );
}

function SummaryRow({ children, label }: { children: ReactNode; label: ReactNode }) {
  return (
    <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-2">
      <span className="sk-ui-text-muted-foreground sk-ui-text-xs">{label}</span>
      <span className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5 sk-ui-font-medium sk-ui-text-xs sk-ui-tabular-nums">
        {children}
      </span>
    </div>
  );
}

function LimitOrderTimeline({ entries }: { entries: LimitOrderTimelineEntry[] }) {
  return (
    <ol className="sk-ui-m-0 sk-ui-flex sk-ui-list-none sk-ui-flex-col sk-ui-p-0">
      {entries.map((entry, index) => (
        <li className="sk-ui-flex sk-ui-items-stretch sk-ui-gap-3" key={entry.key}>
          <TimelineRail
            isFirst={index === 0}
            isLast={index === entries.length - 1}
            marker={
              <span className="sk-ui-relative sk-ui-z-10 sk-ui-bg-background">
                <AssetIcon asset={entry.markerAsset} className="sk-ui-size-6" />
              </span>
            }
          />
          <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-1 sk-ui-items-center sk-ui-justify-between sk-ui-gap-2 sk-ui-py-1">
            <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-col">
              <span className="sk-ui-font-medium sk-ui-text-foreground sk-ui-text-sm sk-ui-tabular-nums">
                {entry.title}
              </span>
              <span className="sk-ui-text-[11px] sk-ui-text-muted-foreground">{entry.chainName}</span>
            </div>
            <TxHashLink chain={entry.chain} txHash={entry.txHash} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function FeeBlock({ fees }: { fees: LimitOrderFeeBlockModel }) {
  if (fees.stage === "none") return null;

  if (fees.stage === "flat") {
    return (
      <div className={cn(CARD, "sk-ui-gap-3")}>
        <SummaryRow label={fees.title}>{fees.flatValue}</SummaryRow>
        {fees.caption ? <p className="sk-ui-text-[11px] sk-ui-text-muted-foreground">{fees.caption}</p> : null}
      </div>
    );
  }

  return (
    <CollapsibleSection
      className="sk-ui-bg-card"
      defaultOpen
      title={
        <span className="sk-ui-flex sk-ui-items-center sk-ui-text-sm">
          {fees.title}
          {fees.sumBps ? (
            <span className="sk-ui-mr-2 sk-ui-ml-auto sk-ui-text-foreground sk-ui-tabular-nums">{fees.sumBps}</span>
          ) : null}
        </span>
      }>
      <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2">
        {fees.rows.map((row) => (
          <SummaryRow key={row.key} label={row.label}>
            {row.isFree ? <span className="sk-ui-text-success-foreground">FREE</span> : row.amount}
          </SummaryRow>
        ))}
      </div>
      {fees.caption ? <p className="sk-ui-text-[11px] sk-ui-text-muted-foreground">{fees.caption}</p> : null}
    </CollapsibleSection>
  );
}

function CancelAction({ isFetching, isFresh, order }: { isFetching: boolean; isFresh: boolean; order: LimitOrder }) {
  const gate = useLimitOrderCancelGate(order, isFresh);

  switch (gate.kind) {
    case "none":
      return null;
    case "stale":
      return (
        <Button className="sk-ui-h-10 sk-ui-w-full" disabled isLoading={isFetching} variant="secondary">
          Cancel
        </Button>
      );
    case "wallet":
      return (
        <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2">
          <Button className="sk-ui-h-10 sk-ui-w-full" disabled variant="secondary">
            Cancel
          </Button>
          <p className="sk-ui-text-center sk-ui-text-muted-foreground sk-ui-text-xs">
            {gate.reason === "cannotSignCancel"
              ? "This wallet can't sign the cancel. Connect the same address with a wallet that can."
              : "Connect the wallet that placed this order to cancel it."}
          </p>
        </div>
      );
    case "ready":
      return (
        <Button
          className="sk-ui-h-10 sk-ui-w-full"
          onClick={() => void showModal(<LimitOrderCancelDialog order={order} />)}
          variant="secondary">
          Cancel
        </Button>
      );
    case "resume":
      return (
        <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2">
          <Button
            className="sk-ui-h-10 sk-ui-w-full"
            onClick={() => void showModal(<LimitOrderCancelDialog order={order} />)}
            variant="secondary">
            Retry cancel
          </Button>
          <p className="sk-ui-text-center sk-ui-text-muted-foreground sk-ui-text-xs">
            Your cancellation wasn't submitted.
          </p>
        </div>
      );
  }
}

function ActionSlot({
  action,
  isFetching,
  isFresh,
  onPlaceNewOrder,
  order,
}: {
  action: "cancel" | "placeNew" | "none";
  isFetching: boolean;
  isFresh: boolean;
  onPlaceNewOrder: () => void;
  order: LimitOrder;
}) {
  switch (action) {
    case "placeNew":
      return (
        <Button className="sk-ui-h-10 sk-ui-w-full" onClick={onPlaceNewOrder} variant="secondary">
          Place a new order
        </Button>
      );
    case "cancel":
      return <CancelAction isFetching={isFetching} isFresh={isFresh} order={order} />;
    case "none":
      return null;
  }
}

function FailurePanel({ failure }: { failure: NonNullable<LimitOrderDetailModel["failure"]> }) {
  return (
    <div className="sk-ui-flex sk-ui-items-start sk-ui-gap-2 sk-ui-rounded-lg sk-ui-border sk-ui-border-error-foreground/40 sk-ui-bg-error sk-ui-p-3">
      <XCircle className="sk-ui-mt-px sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-error-foreground" />
      <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-col sk-ui-gap-1">
        <span className="sk-ui-font-medium sk-ui-text-error-foreground sk-ui-text-sm">{failure.title}</span>
        <span className="sk-ui-text-error-foreground sk-ui-text-xs">{failure.body}</span>
      </div>
    </div>
  );
}

function MarketRow({ isPriceLoading, market }: { isPriceLoading: boolean; market: LimitOrderDetailModel["market"] }) {
  if (market?.status === "pending") {
    return isPriceLoading ? (
      <SummaryRow label="Market now">
        <ValueSkeleton />
      </SummaryRow>
    ) : null;
  }
  if (!market) return null;

  return (
    <SummaryRow label="Market now">
      {market.value}
      <span
        className="sk-ui-flex sk-ui-items-center sk-ui-gap-1 sk-ui-rounded-md sk-ui-bg-bg-active sk-ui-font-medium sk-ui-text-[11px] sk-ui-tabular-nums"
        style={{ padding: "1px 5px" }}>
        {market.fillableNow ? <CheckCircle2 className="sk-ui-size-3 sk-ui-text-success-foreground" /> : null}
        {market.chip}
      </span>
    </SummaryRow>
  );
}

function PairCard({
  isPriceLoading,
  model,
  order,
}: {
  isPriceLoading: boolean;
  model: LimitOrderDetailModel;
  order: LimitOrder;
}) {
  return (
    <div className={cn(CARD, "sk-ui-gap-2")}>
      <div className="sk-ui-flex sk-ui-flex-wrap sk-ui-items-center sk-ui-gap-x-2 sk-ui-gap-y-1">
        <span className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5 sk-ui-whitespace-nowrap">
          <AssetIcon asset={order.sellAsset} className="sk-ui-size-6" />
          <span className="sk-ui-font-medium sk-ui-text-sm">
            {model.sellAmount} {model.sellTicker}
          </span>
        </span>
        <ArrowRight className="sk-ui-size-3 sk-ui-shrink-0 sk-ui-text-muted-foreground" />
        <span className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5 sk-ui-whitespace-nowrap">
          <AssetIcon asset={order.buyAsset} className="sk-ui-size-6" />
          <span className="sk-ui-font-medium sk-ui-text-sm">
            {model.buyAmount} {model.buyTicker}
          </span>
        </span>
      </div>

      <div className="sk-ui-h-px sk-ui-w-full sk-ui-bg-border" />

      {model.limitPrice ? <SummaryRow label="Limit price">{model.limitPrice}</SummaryRow> : null}

      <MarketRow isPriceLoading={isPriceLoading} market={model.market} />

      {model.summary.map((row) =>
        row.value || isPriceLoading ? (
          <SummaryRow key={row.key} label={row.label}>
            {row.value ?? <ValueSkeleton />}
          </SummaryRow>
        ) : null,
      )}

      {model.feesChargedNone ? <SummaryRow label="Fees charged">None</SummaryRow> : null}
    </div>
  );
}

function ProgressBlock({ progress }: { progress: NonNullable<LimitOrderDetailModel["progress"]> }) {
  return (
    <div className={cn(CARD, "sk-ui-gap-2")}>
      <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-2">
        <span className="sk-ui-text-muted-foreground sk-ui-text-xs">{progress.label}</span>
        <span
          className={cn(
            "sk-ui-font-medium sk-ui-text-xs sk-ui-tabular-nums",
            progress.isHighlighted && "sk-ui-text-warning-foreground",
          )}>
          {progress.value}
        </span>
      </div>
      <div className="sk-ui-h-1.5 sk-ui-w-full sk-ui-overflow-hidden sk-ui-rounded-full sk-ui-bg-bg-active">
        <div
          className={cn("sk-ui-h-full sk-ui-rounded-full", progress.barClass)}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      {progress.caption ? <p className="sk-ui-text-[11px] sk-ui-text-muted-foreground">{progress.caption}</p> : null}
    </div>
  );
}

function RefundBlock({ refund }: { refund: NonNullable<LimitOrderDetailModel["refund"]> }) {
  return (
    <div className="sk-ui-flex sk-ui-items-start sk-ui-gap-2 sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-bg-card sk-ui-p-3">
      <RotateCcw className="sk-ui-mt-px sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-success-foreground" />
      <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-1 sk-ui-flex-wrap sk-ui-items-center sk-ui-justify-between sk-ui-gap-2">
        <span className="sk-ui-font-medium sk-ui-text-sm">{refund.text}</span>
        {refund.entry ? <TxHashLink chain={refund.entry.chain} txHash={refund.entry.txHash} /> : null}
      </div>
    </div>
  );
}

function TransactionsSection({ model }: { model: LimitOrderDetailModel }) {
  return (
    <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2">
      <SectionLabel>Transactions</SectionLabel>
      {model.timelineEmpty ? (
        <div className="sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-bg-card sk-ui-p-3 sk-ui-text-muted-foreground sk-ui-text-xs">
          {model.timelineEmpty}
        </div>
      ) : (
        <LimitOrderTimeline entries={model.timeline} />
      )}
    </div>
  );
}

function DetailsSection({ model, order }: { model: LimitOrderDetailModel; order: LimitOrder }) {
  return (
    <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2">
      <SectionLabel>Details</SectionLabel>
      <div className={cn(CARD, "sk-ui-gap-3 sk-ui-text-sm")}>
        {model.expiry ? (
          <SummaryRow label="Expires">
            {[formatTime(model.expiry.time), model.expiry.countdown].filter(Boolean).join(" · ")}
          </SummaryRow>
        ) : null}
        <SummaryRow label="Created">{formatTime(Date.parse(order.createdAt))}</SummaryRow>
        <SummaryRow label="Order">
          <TruncatedAddress
            address={order.orderHash}
            className="sk-ui--my-1.5 sk-ui--mr-2"
            copiedMessage="Order hash copied"
          />
        </SummaryRow>
        {model.address ? (
          <SummaryRow label={model.address.label}>
            <span className="sk-ui-font-mono">{truncateMiddle(model.address.value)}</span>
          </SummaryRow>
        ) : null}
      </div>
    </div>
  );
}

function StatusLine({ model, order }: { model: LimitOrderDetailModel | null; order: LimitOrder | undefined }) {
  if (!order || !model) return <SheetDescription className="sk-ui-sr-only">Limit order</SheetDescription>;

  return (
    <SheetDescription className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5">
      {model.isCancelling ? (
        <Loader2 aria-hidden className="sk-ui-size-4 sk-ui-shrink-0 sk-ui-animate-spin sk-ui-text-muted-foreground" />
      ) : (
        <LimitOrderStatusIcon status={order.status} />
      )}
      {model.statusLine}
    </SheetDescription>
  );
}

export function LimitOrderDetail({
  now,
  onBack,
  onPlaceNewOrder,
  orderId,
  placeholder,
}: {
  now: number;
  onBack: () => void;
  onPlaceNewOrder: (order: LimitOrder) => void;
  orderId: string;
  placeholder?: LimitOrder;
}) {
  const { error, isFetching, isFresh, order } = useLimitOrder(orderId, { placeholder });
  const isCancelPending = useIsLimitOrderCancelPending(orderId);
  const orders = useMemo(() => (order ? [order] : []), [order]);
  const { getPrices, isPriceLoading } = useOrderPrices(orders);
  const prices = useMemo(() => (order ? getPrices(order) : {}), [getPrices, order]);
  const model = useMemo(
    () => (order ? getLimitOrderDetailModel(order, prices, now, { isCancelPending }) : null),
    [isCancelPending, now, order, prices],
  );
  const refreshFailed = Boolean(error) && !isFetching;

  return (
    <>
      <SheetHeader className="sk-ui-items-start sk-ui-text-left">
        <Button className="sk-ui--ml-2" onClick={onBack} size="xs" variant="ghost">
          <ChevronLeft className="sk-ui-size-4" />
          Orders
        </Button>
        <SheetTitle>Limit order</SheetTitle>
        <StatusLine model={model} order={order} />
      </SheetHeader>

      <div className="sk-ui--mr-4 sk-ui-mt-4 sk-ui-flex sk-ui-w-auto sk-ui-flex-1 sk-ui-flex-col sk-ui-gap-4 sk-ui-overflow-y-auto sk-ui-pr-4">
        {refreshFailed ? (
          <LimitNotice
            body="Couldn't refresh this order. Showing the last known state."
            icon={RefreshCw}
            tone="neutral"
          />
        ) : null}

        {order && model ? (
          <>
            {model.failure ? <FailurePanel failure={model.failure} /> : null}
            <PairCard isPriceLoading={isPriceLoading} model={model} order={order} />
            {model.progress ? <ProgressBlock progress={model.progress} /> : null}
            {model.refund ? <RefundBlock refund={model.refund} /> : null}
            <FeeBlock fees={model.fees} />
            <TransactionsSection model={model} />
            <DetailsSection model={model} order={order} />
          </>
        ) : (
          <div className="sk-ui-flex sk-ui-flex-1 sk-ui-items-center sk-ui-justify-center">
            <Loader2 className="sk-ui-size-6 sk-ui-animate-spin sk-ui-text-muted-foreground" />
          </div>
        )}
      </div>

      {order && model ? (
        <ActionSlot
          action={model.action}
          isFetching={isFetching}
          isFresh={isFresh && !refreshFailed}
          onPlaceNewOrder={() => onPlaceNewOrder(order)}
          order={order}
        />
      ) : null}
    </>
  );
}
