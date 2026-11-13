"use client";

import { AssetValue, type LimitOrder } from "@swapkit/helpers";
import {
  ArrowRight,
  ExternalLink,
  History,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Timer,
  Trash2,
  Wallet2,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFirstLoad } from "../../hooks/use-first-load";
import { useLimitOrderOwnerAddresses } from "../../hooks/use-limit-order-owner-addresses";
import { useLimitOrders, useOrderPrices } from "../../hooks/use-limit-orders";
import { showModal, useModal } from "../../hooks/use-modal";
import { isRateLimited } from "../../lib/api-errors";
import type { LimitOrderScope } from "../../lib/limit-orders/status";
import { truncateMiddle } from "../../lib/truncate";
import { type TransactionRecord, useTransactionHistory } from "../../stores/transaction-history-store";
import { AssetIcon } from "../simple/asset-icon";
import { LimitNotice } from "../simple/limit-notice";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { SwapKitLoader } from "../ui/swapkit-loader";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { useOpenLimitForm, useWidgetModes } from "../widget-modes-context";
import { ActivityEmptyState, ActivityRow, getRelativeTime, StatusIcon } from "./activity-parts";
import { LimitOrderDetail } from "./limit-order-detail";
import { LimitOrderItem } from "./limit-order-item";

export function showTransactionHistoryDrawer() {
  return showModal(<TransactionHistoryDrawer />);
}

const ACTIVE_SWAP_STATUSES: ReadonlyArray<TransactionRecord["status"]> = ["pending"];
const HISTORY_SWAP_STATUSES: ReadonlyArray<TransactionRecord["status"]> = ["completed", "failed"];
const CLOCK_TICK_MS = 30_000;

type ActivityEntry =
  | { kind: "order"; order: LimitOrder; time: number }
  | { kind: "swap"; transaction: TransactionRecord; time: number };

function formatAmount(amount: string | undefined, asset: string | undefined) {
  if (!amount || !asset) return null;
  try {
    const assetValue = AssetValue.from({ asset, value: amount });
    return assetValue.toSignificant(6);
  } catch {
    return amount;
  }
}

function TransactionItem({ transaction }: { transaction: TransactionRecord }) {
  const handleClick = useCallback(() => {
    const url = `https://track.swapkit.dev/?hash=${transaction.hash}&chainId=${transaction.chainId}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [transaction.hash, transaction.chainId]);

  const sellTicker = transaction.sellAsset ? AssetValue.from({ asset: transaction.sellAsset }).ticker : null;
  const buyTicker = transaction.buyAsset ? AssetValue.from({ asset: transaction.buyAsset }).ticker : null;
  const sellAmount = formatAmount(transaction.sellAmount, transaction.sellAsset);
  const buyAmount = formatAmount(transaction.buyAmount, transaction.buyAsset);

  return (
    <ActivityRow icon={<StatusIcon status={transaction.status} />} onClick={handleClick}>
      <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-1 sk-ui-flex-col sk-ui-gap-1.5">
        <div className="sk-ui-flex sk-ui-items-start sk-ui-justify-between sk-ui-gap-2">
          <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-wrap sk-ui-items-center sk-ui-gap-x-2 sk-ui-gap-y-1">
            <span className="sk-ui-font-medium sk-ui-text-sm sk-ui-capitalize">{transaction.type}</span>
            <span className="sk-ui-text-muted-foreground sk-ui-text-xs">{getRelativeTime(transaction.timestamp)}</span>
            {transaction.shieldedDeliveryHash ? (
              <span className="sk-ui-flex sk-ui-items-center sk-ui-gap-1 sk-ui-rounded-full sk-ui-bg-[#00C3FF]/10 sk-ui-px-2 sk-ui-py-0.5 sk-ui-font-medium sk-ui-text-[#00A3D4] sk-ui-text-xs">
                <ShieldCheck className="sk-ui-size-3" />
                Shielded
              </span>
            ) : null}
          </div>

          <span className="sk-ui-flex sk-ui-shrink-0 sk-ui-items-center sk-ui-gap-1 sk-ui-font-mono sk-ui-text-muted-foreground sk-ui-text-xs sk-ui-leading-5">
            {truncateMiddle(transaction.hash)}
            <ExternalLink className="sk-ui-size-3.5 sk-ui-shrink-0 sm:sk-ui-opacity-0 sm:sk-ui-transition-opacity sm:group-hover:sk-ui-opacity-100" />
          </span>
        </div>

        {transaction.sellAsset && (
          <div className="sk-ui-flex sk-ui-flex-wrap sk-ui-items-center sk-ui-gap-x-1.5 sk-ui-gap-y-1">
            <span className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5 sk-ui-whitespace-nowrap">
              <AssetIcon asset={transaction.sellAsset} className="sk-ui-size-5" />
              <span className="sk-ui-text-sm">
                {sellAmount && <span className="sk-ui-text-muted-foreground">{sellAmount} </span>}
                {sellTicker}
              </span>
            </span>

            {transaction.buyAsset && (
              <span className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5 sk-ui-whitespace-nowrap">
                <ArrowRight className="sk-ui-mx-0.5 sk-ui-size-3 sk-ui-shrink-0 sk-ui-text-muted-foreground" />
                <AssetIcon asset={transaction.buyAsset} className="sk-ui-size-5" />
                <span className="sk-ui-text-sm">
                  {buyAmount && <span className="sk-ui-text-muted-foreground">{buyAmount} </span>}
                  {buyTicker}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </ActivityRow>
  );
}

function useClearHistoryConfirm(clearHistory: () => void) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClearHistory = useCallback(() => {
    if (showConfirm) {
      clearHistory();
      setShowConfirm(false);
    } else {
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 3000);
    }
  }, [showConfirm, clearHistory]);

  return { handleClearHistory, showConfirm };
}

function ClearHistoryButton({ onClick, showConfirm }: { onClick: () => void; showConfirm: boolean }) {
  return (
    <button
      className={`sk-ui-flex sk-ui-w-full sk-ui-items-center sk-ui-justify-center sk-ui-gap-2 sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-p-3 sk-ui-text-sm sk-ui-font-medium sk-ui-transition-colors ${
        showConfirm
          ? "sk-ui-border-error-foreground/40 sk-ui-bg-error sk-ui-text-error-foreground hover:sk-ui-bg-error-foreground/25"
          : "sk-ui-bg-card hover:sk-ui-bg-bg-hover"
      }`}
      onClick={onClick}
      type="button">
      <Trash2 className="sk-ui-size-4" />
      {showConfirm ? "Click again to confirm" : "Clear History"}
    </button>
  );
}

function SwapHistoryContent() {
  const { transactions, clearHistory } = useTransactionHistory();
  const { handleClearHistory, showConfirm } = useClearHistoryConfirm(clearHistory);

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => b.timestamp - a.timestamp);
  }, [transactions]);

  return (
    <>
      <SheetHeader>
        <SheetTitle>Transaction History</SheetTitle>
        <SheetDescription>
          {transactions.length === 0
            ? "No transactions yet"
            : `${transactions.length} transaction${transactions.length !== 1 ? "s" : ""}`}
        </SheetDescription>
      </SheetHeader>

      <div className="sk-ui--mr-4 sk-ui-mt-4 sk-ui-flex sk-ui-w-auto sk-ui-flex-1 sk-ui-flex-col sk-ui-gap-3 sk-ui-overflow-y-auto sk-ui-pr-4">
        {sortedTransactions.length > 0 ? (
          sortedTransactions.map((tx) => <TransactionItem key={tx.id} transaction={tx} />)
        ) : (
          <ActivityEmptyState
            description="Your swap and approval transactions will appear here"
            icon={History}
            title="No transactions yet"
          />
        )}
      </div>

      {transactions.length > 0 && <ClearHistoryButton onClick={handleClearHistory} showConfirm={showConfirm} />}
    </>
  );
}

function useNow() {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  return now;
}

function ActivityEmpty({ hasOwner, scope }: { hasOwner: boolean; scope: LimitOrderScope }) {
  if (!hasOwner) return <ActivityEmptyState icon={Wallet2} title="Connect a wallet to see your limit orders" />;
  if (scope === "active") {
    return <ActivityEmptyState description="Orders you place will appear here" icon={Inbox} title="No active orders" />;
  }
  return <ActivityEmptyState icon={Inbox} title="Nothing with this status yet" />;
}

function getOrderCountLabel(scope: LimitOrderScope, count: number, hasMore: boolean) {
  const noun = scope === "active" ? "active order" : "order";
  return `${count}${hasMore ? "+" : ""} ${noun}${count === 1 && !hasMore ? "" : "s"}`;
}

function OrdersErrorNotice({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (isRateLimited(error)) {
    return (
      <LimitNotice
        body="Too many requests right now. Your orders will refresh by themselves in a moment."
        icon={Timer}
        title="Orders are busy"
        tone="neutral"
      />
    );
  }

  return (
    <LimitNotice
      body={
        <>
          Something went wrong while loading them.{" "}
          <button
            className="sk-ui-cursor-pointer sk-ui-font-medium sk-ui-text-foreground sk-ui-underline-offset-2 hover:sk-ui-underline"
            onClick={onRetry}
            type="button">
            Try again
          </button>
        </>
      }
      icon={RefreshCw}
      title="Couldn't load your orders"
      tone="error"
    />
  );
}

function usePlaceNewOrder(onClose: () => void) {
  const openLimitForm = useOpenLimitForm();

  return useCallback(
    (order: LimitOrder) => {
      openLimitForm({ buyAsset: order.buyAsset, sellAsset: order.sellAsset });
      onClose();
    },
    [onClose, openLimitForm],
  );
}

function ActivityContent({ onClose }: { onClose: () => void }) {
  const [scope, setScope] = useState<LimitOrderScope>("active");
  const [selectedOrder, setSelectedOrder] = useState<{ orderId: string; placeholder?: LimitOrder } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listScrollTop = useRef(0);
  const now = useNow();
  const { transactions, clearHistory } = useTransactionHistory();
  const { handleClearHistory, showConfirm } = useClearHistoryConfirm(clearHistory);
  const { addresses } = useLimitOrderOwnerAddresses();
  const isListVisible = selectedOrder === null;
  const active = useLimitOrders("active", { enabled: isListVisible && scope === "active" });
  const history = useLimitOrders("history", { enabled: isListVisible && scope === "history" });
  const list = scope === "active" ? active : history;
  const hasOwner = addresses.length > 0;
  const { getPrices, isPriceLoading } = useOrderPrices(list.orders);
  const handlePlaceNewOrder = usePlaceNewOrder(onClose);

  const handleOpenOrder = useCallback(
    (orderId: string) => {
      listScrollTop.current = listRef.current?.scrollTop ?? 0;
      setSelectedOrder({ orderId, placeholder: list.orders.find((order) => order.orderId === orderId) });
    },
    [list.orders],
  );

  const handleBack = useCallback(() => setSelectedOrder(null), []);

  useLayoutEffect(() => {
    if (isListVisible && listRef.current) listRef.current.scrollTop = listScrollTop.current;
  }, [isListVisible]);

  const entries = useMemo(() => {
    const swapStatuses = scope === "active" ? ACTIVE_SWAP_STATUSES : HISTORY_SWAP_STATUSES;
    const watermark = list.watermark ? Date.parse(list.watermark) : null;
    const swaps: ActivityEntry[] = transactions
      .filter((tx) => swapStatuses.includes(tx.status))
      .filter((tx) => watermark === null || Number.isNaN(watermark) || tx.timestamp >= watermark)
      .map((transaction) => ({ kind: "swap", time: transaction.timestamp, transaction }));
    const orders: ActivityEntry[] = list.orders.map((order) => ({
      kind: "order",
      order,
      time: Date.parse(order.createdAt) || 0,
    }));
    return [...orders, ...swaps].sort((a, b) => b.time - a.time);
  }, [list.orders, list.watermark, scope, transactions]);

  const isOrdersLoading = hasOwner && list.isLoading;
  const isFirstLoad = useFirstLoad(scope, isOrdersLoading);
  const showError = hasOwner && Boolean(list.error) && !list.isFetching;

  if (selectedOrder) {
    return (
      <LimitOrderDetail
        now={now}
        onBack={handleBack}
        onPlaceNewOrder={handlePlaceNewOrder}
        orderId={selectedOrder.orderId}
        placeholder={selectedOrder.placeholder}
      />
    );
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Activity</SheetTitle>
        <SheetDescription>
          {isFirstLoad || !list.hasData
            ? "\u00A0"
            : getOrderCountLabel(scope, list.orders.length, Boolean(list.hasMore))}
        </SheetDescription>
      </SheetHeader>

      <Tabs className="sk-ui-mt-4" onValueChange={(value) => setScope(value as LimitOrderScope)} value={scope}>
        <TabsList className="sk-ui-flex sk-ui-w-full">
          <TabsTrigger className="sk-ui-cursor-pointer" value="active">
            Active
          </TabsTrigger>
          <TabsTrigger className="sk-ui-cursor-pointer" value="history">
            History
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div
        className="sk-ui--mr-4 sk-ui-mt-4 sk-ui-flex sk-ui-w-auto sk-ui-flex-1 sk-ui-flex-col sk-ui-gap-3 sk-ui-overflow-y-auto sk-ui-pr-4"
        ref={listRef}>
        {showError ? <OrdersErrorNotice error={list.error} onRetry={() => void list.refetch()} /> : null}

        {isFirstLoad ? (
          <SwapKitLoader className="sk-ui-min-h-0 sk-ui-flex-1 sk-ui-bg-transparent" />
        ) : (
          entries.map((entry) =>
            entry.kind === "order" ? (
              <LimitOrderItem
                isPriceLoading={isPriceLoading}
                key={`order-${entry.order.orderId}`}
                now={now}
                onSelect={handleOpenOrder}
                order={entry.order}
                price={getPrices(entry.order)}
              />
            ) : (
              <TransactionItem key={`swap-${entry.transaction.id}`} transaction={entry.transaction} />
            ),
          )
        )}

        {list.hasMore && !isOrdersLoading ? (
          <button
            className="sk-ui-flex sk-ui-w-full sk-ui-cursor-pointer sk-ui-items-center sk-ui-justify-center sk-ui-gap-2 sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-bg-card sk-ui-p-3 sk-ui-font-medium sk-ui-text-muted-foreground sk-ui-text-sm sk-ui-transition-colors hover:sk-ui-bg-bg-hover disabled:sk-ui-cursor-default disabled:sk-ui-opacity-60"
            disabled={list.isFetchingMore}
            onClick={() => void list.fetchMore()}
            type="button">
            {list.isFetchingMore ? <Loader2 className="sk-ui-size-4 sk-ui-animate-spin" /> : null}
            Load more
          </button>
        ) : null}

        {entries.length === 0 && !isOrdersLoading && !showError ? (
          <ActivityEmpty hasOwner={hasOwner} scope={scope} />
        ) : null}
      </div>

      {scope === "history" && !isFirstLoad && transactions.length > 0 && (
        <ClearHistoryButton onClick={handleClearHistory} showConfirm={showConfirm} />
      )}
    </>
  );
}

export function TransactionHistoryDrawer() {
  const modal = useModal();
  const hasLimitMode = useWidgetModes().includes("limit");

  return (
    <Sheet {...modal}>
      <SheetContent className="sk-ui-flex sk-ui-flex-col">
        {hasLimitMode ? (
          <ActivityContent onClose={() => modal.resolve({ confirmed: false })} />
        ) : (
          <SwapHistoryContent />
        )}
      </SheetContent>
    </Sheet>
  );
}
