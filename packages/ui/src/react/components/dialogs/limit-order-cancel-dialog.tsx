"use client";

import { type LimitOrder, SwapKitNumber } from "@swapkit/helpers";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useRef } from "react";
import { cn, formatCurrency } from "../../../lib/utils";
import { useCancelLimitOrder } from "../../hooks/use-cancel-limit-order";
import { useModal } from "../../hooks/use-modal";
import { useTokenPrices, useTokenPricesQuery } from "../../hooks/use-token-prices";
import { getFillPercent, getRemainingSellAmount, hasFills } from "../../lib/limit-orders/amounts";
import {
  getRacedOutcome,
  type LimitCancelShape,
  type LimitCancelState,
  type LimitCancelVariant,
  needsCancelSignature,
} from "../../lib/limit-orders/cancel";
import { formatExpiryDateTime } from "../../lib/limit-orders/expiry";
import { formatOrderAmount, getAssetPriceId, getTicker } from "../../lib/limit-orders/row-model";
import { LIMIT_ORDER_LIVE_BAR_CLASS } from "../../lib/limit-orders/status";
import { truncateMiddle } from "../../lib/truncate";
import { LimitOrderStatusIcon } from "../composable/limit-order-status-icon";
import { LimitNotice } from "../simple/limit-notice";
import { SummaryList } from "../simple/summary-list";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Skeleton } from "../ui/skeleton";

export type LimitOrderCancelDialogResult = { status?: string };

type Prices = { buy?: number; gas?: number; sell?: number };

function usd(amount: string, price: number | undefined) {
  if (!price) return null;
  try {
    const value = new SwapKitNumber(amount).mul(price).getValue("number");
    return value > 0 ? `≈ ${formatCurrency(value)}` : null;
  } catch {
    return null;
  }
}

function useCancelPrices(order: LimitOrder, gasAssetId: string | null) {
  const sellId = getAssetPriceId(order.sellAsset);
  const buyId = getAssetPriceId(order.buyAsset);
  const ids = useMemo(
    () => [...new Set([sellId, buyId, gasAssetId].filter((id): id is string => Boolean(id)))].sort(),
    [buyId, gasAssetId, sellId],
  );
  const query = useTokenPricesQuery(ids);
  const { pricesByTokenId } = useTokenPrices();
  const price = (id: string | null) => (id ? pricesByTokenId.get(id)?.priceUSD : undefined);

  return {
    isLoading: query.isLoading,
    prices: { buy: price(buyId), gas: price(gasAssetId), sell: price(sellId) } satisfies Prices,
  };
}

function InlineSkeleton() {
  return (
    <span className="sk-ui-inline-block sk-ui-h-3.5 sk-ui-w-12 sk-ui-animate-pulse sk-ui-rounded-sm sk-ui-bg-bg-active sk-ui-align-middle" />
  );
}

function GasWarning({ feeUsd, order }: { feeUsd: string | null | undefined; order: LimitOrder }) {
  const expiresAt = Date.parse(order.expiresAt);

  return (
    <div className="sk-ui-flex sk-ui-items-start sk-ui-gap-2 sk-ui-rounded-lg sk-ui-border sk-ui-border-warning-foreground/40 sk-ui-bg-warning sk-ui-p-3">
      <AlertTriangle className="sk-ui-mt-px sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-warning-foreground" />
      <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-col sk-ui-gap-1 sk-ui-text-xs">
        <span className="sk-ui-font-medium sk-ui-text-foreground sk-ui-text-sm">Cancelling costs a network fee.</span>
        <span className="sk-ui-text-muted-foreground">
          Your order is an off-chain signature. Revoking it before it expires means sending a transaction.
          {feeUsd === null ? null : (
            <>
              {" "}
              Estimated cost{" "}
              {feeUsd === undefined ? (
                <InlineSkeleton />
              ) : (
                <span className="sk-ui-font-medium sk-ui-text-foreground">{feeUsd}</span>
              )}
              .
            </>
          )}
        </span>
        {Number.isNaN(expiresAt) ? null : (
          <span className="sk-ui-mt-1 sk-ui-text-muted-foreground">
            Or leave it — it expires by itself on {formatExpiryDateTime(expiresAt / 1000)}, at no cost.
          </span>
        )}
      </div>
    </div>
  );
}

function ReturnNotice({ order, prices }: { order: LimitOrder; prices: Prices }) {
  const sellTicker = getTicker(order.sellAsset);
  const remaining = getRemainingSellAmount(order);
  const value = usd(remaining, prices.sell);

  return (
    <div className="sk-ui-flex sk-ui-items-start sk-ui-gap-2 sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-p-3">
      <RotateCcw className="sk-ui-mt-px sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-success-foreground" />
      <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-col sk-ui-gap-1 sk-ui-text-xs">
        <span className="sk-ui-font-medium sk-ui-text-foreground sk-ui-text-sm">
          Your {formatOrderAmount(remaining)} {sellTicker}
          {value ? ` (${value})` : ""} comes back.
        </span>
        <span className="sk-ui-text-muted-foreground">
          Cancelling is free and sends your {sellTicker} to your wallet. A small network fee is taken from the returned
          amount.
        </span>
      </div>
    </div>
  );
}

function PartialFillCard({ order, prices }: { order: LimitOrder; prices: Prices }) {
  const sellTicker = getTicker(order.sellAsset);
  const buyTicker = getTicker(order.buyAsset);
  const remaining = getRemainingSellAmount(order);
  const received = usd(order.filledBuyAmount, prices.buy);
  const open = usd(remaining, prices.sell);
  const filled = `${formatOrderAmount(order.filledSellAmount)} ${sellTicker} → ${formatOrderAmount(order.filledBuyAmount)} ${buyTicker}`;

  return (
    <>
      <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2 sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-p-3 sk-ui-text-sm">
        <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-0.5">
          <span className="sk-ui-text-muted-foreground sk-ui-text-xs">Already filled — you keep this</span>
          <span className="sk-ui-font-medium sk-ui-tabular-nums">{received ? `${filled} · ${received}` : filled}</span>
        </div>
        <div className="sk-ui-h-1.5 sk-ui-w-full sk-ui-overflow-hidden sk-ui-rounded-full sk-ui-bg-bg-active">
          <div
            className={cn("sk-ui-h-full sk-ui-rounded-full", LIMIT_ORDER_LIVE_BAR_CLASS)}
            style={{ width: `${getFillPercent(order)}%` }}
          />
        </div>
        <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-0.5">
          <span className="sk-ui-text-muted-foreground sk-ui-text-xs">Being cancelled</span>
          <span className="sk-ui-font-medium sk-ui-tabular-nums">
            {formatOrderAmount(remaining)} {sellTicker}
            {open ? ` · ${open}` : ""}
          </span>
        </div>
      </div>
      <p className="sk-ui-text-muted-foreground sk-ui-text-xs">
        The {formatOrderAmount(order.filledBuyAmount)} {buyTicker} you've already received stays yours. Nothing is
        reversed.
      </p>
    </>
  );
}

function RestingSummary({
  order,
  prices,
  variant,
}: {
  order: LimitOrder;
  prices: Prices;
  variant: "inWallet" | "escrowed";
}) {
  const sellTicker = getTicker(order.sellAsset);
  const open = usd(getRemainingSellAmount(order), prices.sell);

  return (
    <SummaryList
      className="sk-ui-text-sm"
      items={[
        {
          title: `Your ${sellTicker}`,
          value: variant === "escrowed" ? "Returned to your wallet" : "Stays in your wallet — it never left",
        },
        ...(open ? [{ title: "Value still open", value: open }] : []),
        {
          title: "Order",
          value: <span className="sk-ui-font-mono sk-ui-text-xs">{truncateMiddle(order.orderHash)}</span>,
        },
      ]}
    />
  );
}

function VariantBody({
  feeUsd,
  order,
  prices,
  shape,
  variant,
}: {
  feeUsd: string | null | undefined;
  order: LimitOrder;
  prices: Prices;
  shape: LimitCancelShape;
  variant: LimitCancelVariant;
}) {
  switch (variant) {
    case "inWallet":
    case "escrowed":
      return (
        <>
          <GasWarning feeUsd={feeUsd} order={order} />
          <RestingSummary order={order} prices={prices} variant={variant} />
        </>
      );
    case "deposited":
      return <ReturnNotice order={order} prices={prices} />;
    case "partiallyFilled":
      return (
        <>
          <PartialFillCard order={order} prices={prices} />
          {shape === "evmTx" ? <GasWarning feeUsd={feeUsd} order={order} /> : null}
        </>
      );
  }
}

function CenteredState({ body, icon, title }: { body: ReactNode; icon: ReactNode; title: ReactNode }) {
  return (
    <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-center sk-ui-gap-3 sk-ui-py-2 sk-ui-text-center">
      {icon}
      <span className="sk-ui-font-medium sk-ui-text-base">{title}</span>
      {body ? <span className="sk-ui-max-w-[280px] sk-ui-text-muted-foreground sk-ui-text-xs">{body}</span> : null}
    </div>
  );
}

function InFlight({ shape }: { shape: LimitCancelShape }) {
  return (
    <CenteredState
      body={
        shape === "evmTx"
          ? "Waiting for the transaction to confirm. You can close this — the order will update itself."
          : "Waiting for the cancel to settle. You can close this — the order will update itself."
      }
      icon={<Loader2 className="sk-ui-size-8 sk-ui-animate-spin sk-ui-text-muted-foreground" />}
      title="Cancelling…"
    />
  );
}

function Raced({ order }: { order: LimitOrder | null }) {
  const outcome = getRacedOutcome(order);
  const icon =
    order?.status === "FILLED" ? (
      <CheckCircle2 className="sk-ui-size-8 sk-ui-text-success-foreground" />
    ) : order ? (
      <LimitOrderStatusIcon className="sk-ui-size-8" status={order.status} />
    ) : (
      <XCircle className="sk-ui-size-8 sk-ui-text-muted-foreground" />
    );

  return <CenteredState body={outcome.body} icon={icon} title={outcome.title} />;
}

function PreparingBody() {
  return (
    <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-3">
      <Skeleton className="sk-ui-h-20 sk-ui-w-full sk-ui-rounded-lg sk-ui-bg-bg-active" isLoading>
        <div />
      </Skeleton>
      <Skeleton className="sk-ui-h-4 sk-ui-w-3/4 sk-ui-bg-bg-active" isLoading>
        <div />
      </Skeleton>
      <Skeleton className="sk-ui-h-4 sk-ui-w-1/2 sk-ui-bg-bg-active" isLoading>
        <div />
      </Skeleton>
    </div>
  );
}

function getFeeUsd(
  feeEstimate: ReturnType<typeof useCancelLimitOrder>["feeEstimate"],
  gasPrice: number | undefined,
  isPriceLoading: boolean,
) {
  if (!feeEstimate) return null;
  if (feeEstimate.status === "pending") return undefined;
  if (!gasPrice) return isPriceLoading ? undefined : null;
  const value = feeEstimate.fee.getValue("number") * gasPrice;
  return value > 0 ? `≈ ${formatCurrency(value)}` : null;
}

function getHeader(order: LimitOrder, state: LimitCancelState) {
  if (state.phase === "submitting" || state.phase === "racing" || state.phase === "raced") return null;
  const sell = `${formatOrderAmount(order.sellAmount)} ${getTicker(order.sellAsset)}`;
  const buy = `${formatOrderAmount(order.buyAmount)} ${getTicker(order.buyAsset)}`;
  return hasFills(order)
    ? { subtitle: null, title: "Cancel the rest of this order?" }
    : { subtitle: `${sell} → ${buy} · nothing filled`, title: "Cancel this order?" };
}

export function LimitOrderCancelDialog({ order }: { order: LimitOrder }) {
  const modal = useModal<LimitOrderCancelDialogResult>();
  const modalRef = useRef(modal);
  modalRef.current = modal;

  const onDone = useCallback((status?: string) => {
    modalRef.current.resolve(status ? { confirmed: true, data: { status } } : { confirmed: false });
  }, []);

  const { confirm, discard, feeEstimate, retry, state } = useCancelLimitOrder(order, { isOpen: modal.open, onDone });
  const { isLoading: isPriceLoading, prices } = useCancelPrices(order, feeEstimate?.gasAssetId ?? null);
  const feeUsd = getFeeUsd(feeEstimate, prices.gas, isPriceLoading);
  const header = getHeader(order, state);
  const dismiss = () => modal.resolve({ confirmed: false });

  const body = (() => {
    switch (state.phase) {
      case "preparing":
        return <PreparingBody />;
      case "ready":
      case "signing":
        return (
          <VariantBody feeUsd={feeUsd} order={order} prices={prices} shape={state.shape} variant={state.variant} />
        );
      case "submitting":
        return <InFlight shape={state.shape} />;
      case "submitFailed":
        return <LimitNotice body={state.message} icon={XCircle} tone="error" />;
      case "racing":
        return (
          <div className="sk-ui-flex sk-ui-justify-center sk-ui-py-6">
            <Loader2 className="sk-ui-size-8 sk-ui-animate-spin sk-ui-text-muted-foreground" />
          </div>
        );
      case "raced":
        return <Raced order={state.order} />;
      default:
        return null;
    }
  })();

  const footer = (() => {
    switch (state.phase) {
      case "preparing":
      case "ready":
      case "signing":
        return (
          <div className="sk-ui-flex sk-ui-gap-2">
            <Button className="sk-ui-flex-1" disabled={state.phase === "signing"} onClick={dismiss} variant="secondary">
              Keep the order
            </Button>
            <Button
              className="sk-ui-flex-1"
              disabled={state.phase === "preparing"}
              isLoading={state.phase === "signing"}
              onClick={() => void confirm()}
              variant="destructive">
              {state.phase !== "preparing" && !needsCancelSignature(state.shape) ? "Cancel" : "Cancel and Sign"}
            </Button>
          </div>
        );
      case "submitFailed":
        return (
          <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2">
            <div className="sk-ui-flex sk-ui-gap-2">
              <Button className="sk-ui-flex-1" onClick={dismiss} variant="secondary">
                Close
              </Button>
              <Button className="sk-ui-flex-1" onClick={() => void retry()} variant="primary">
                Try again
              </Button>
            </div>
            {state.shape === "evmTx" ? null : (
              <Button onClick={discard} size="xs" variant="ghost">
                Discard and start over
              </Button>
            )}
          </div>
        );
      case "raced":
        return (
          <Button
            onClick={() =>
              modal.resolve(
                state.order ? { confirmed: true, data: { status: state.order.status } } : { confirmed: false },
              )
            }
            variant="primary">
            View the order
          </Button>
        );
      default:
        return null;
    }
  })();

  return (
    <Dialog {...modal}>
      <DialogContent>
        {header ? (
          <DialogHeader>
            <DialogTitle>{header.title}</DialogTitle>
            <DialogDescription className={header.subtitle ? undefined : "sk-ui-sr-only"}>
              {header.subtitle ?? header.title}
            </DialogDescription>
          </DialogHeader>
        ) : (
          <DialogHeader className="sk-ui-sr-only">
            <DialogTitle>Cancel limit order</DialogTitle>
            <DialogDescription>Cancel limit order</DialogDescription>
          </DialogHeader>
        )}
        {body}
        {footer}
      </DialogContent>
    </Dialog>
  );
}
