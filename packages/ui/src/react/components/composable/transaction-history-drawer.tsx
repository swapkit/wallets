"use client";

import { AssetValue } from "@swapkit/helpers";
import { SwapKitApi } from "@swapkit/helpers/api";
import { ArrowRight, CheckCircle2, ExternalLink, History, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showModal, useModal } from "../../hooks/use-modal";
import {
  type TransactionRecord,
  type TransactionStatus,
  useTransactionHistory,
} from "../../stores/transaction-history-store";
import { AssetIcon } from "../simple/asset-icon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";

const TRACKER_POLL_TICK_MS = 10_000;
const TRACKER_MAX_REQUESTS_PER_TICK = 5;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export function showTransactionHistoryDrawer() {
  return showModal(<TransactionHistoryDrawer />);
}

function getRelativeTime(timestamp: number) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function StatusIcon({ status }: { status: TransactionStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-green-500" />;
    case "failed":
      return <XCircle className="sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-red-500" />;
    default:
      return <div className="sk-ui-size-2 sk-ui-shrink-0 sk-ui-animate-pulse sk-ui-rounded-full sk-ui-bg-yellow-500" />;
  }
}

function truncateHash(hash: string) {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function formatAmount(amount: string | undefined, asset: string | undefined) {
  if (!amount || !asset) return null;
  try {
    const assetValue = AssetValue.from({ asset, value: amount });
    return assetValue.toSignificant(6);
  } catch {
    return amount;
  }
}

function mapTrackerStatus(status: string | undefined): TransactionStatus | null {
  if (status === "completed") return "completed";
  if (status === "failed" || status === "refunded") return "failed";
  return null;
}

function getTrackerBackoffMs(transaction: TransactionRecord, checkCount: number, checkedAt: number) {
  const ageMs = checkedAt - transaction.timestamp;

  if (ageMs < MINUTE_MS && checkCount <= 6) return 10_000;
  if (ageMs < 5 * MINUTE_MS) return 30_000;
  if (ageMs < 30 * MINUTE_MS) return MINUTE_MS;
  if (ageMs < 6 * HOUR_MS) return 5 * MINUTE_MS;

  return 15 * MINUTE_MS;
}

function getNextTrackerCheckAt(transaction: TransactionRecord, checkCount: number, checkedAt: number) {
  return checkedAt + getTrackerBackoffMs(transaction, checkCount, checkedAt);
}

function getDuePendingTransactions(transactions: TransactionRecord[], now: number) {
  return transactions
    .filter((transaction) => transaction.status === "pending" && (transaction.nextCheckAt ?? 0) <= now)
    .sort((a, b) => (a.nextCheckAt ?? 0) - (b.nextCheckAt ?? 0) || a.timestamp - b.timestamp)
    .slice(0, TRACKER_MAX_REQUESTS_PER_TICK);
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
    <button
      className="sk-ui-group sk-ui-flex sk-ui-w-full sk-ui-items-center sk-ui-gap-3 sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-bg-card sk-ui-p-3 sk-ui-text-left sk-ui-transition-colors hover:sk-ui-bg-bg-hover"
      onClick={handleClick}
      type="button">
      <StatusIcon status={transaction.status} />

      <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-1 sk-ui-flex-col sk-ui-gap-1">
        <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between">
          <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-2">
            <span className="sk-ui-font-medium sk-ui-text-sm sk-ui-capitalize">{transaction.type}</span>
            <span className="sk-ui-text-muted-foreground sk-ui-text-xs">{getRelativeTime(transaction.timestamp)}</span>
          </div>

          <div className="sk-ui-font-mono sk-ui-text-muted-foreground sk-ui-text-xs">
            {truncateHash(transaction.hash)}
          </div>
        </div>

        {transaction.sellAsset && (
          <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5">
            <AssetIcon asset={transaction.sellAsset} className="sk-ui-size-5" />
            <span className="sk-ui-text-sm">
              {sellAmount && <span className="sk-ui-text-muted-foreground">{sellAmount} </span>}
              {sellTicker}
            </span>

            {transaction.buyAsset && (
              <>
                <ArrowRight className="sk-ui-mx-1 sk-ui-size-3 sk-ui-text-muted-foreground" />
                <AssetIcon asset={transaction.buyAsset} className="sk-ui-size-5" />
                <span className="sk-ui-text-sm">
                  {buyAmount && <span className="sk-ui-text-muted-foreground">{buyAmount} </span>}
                  {buyTicker}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <ExternalLink className="sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-muted-foreground sk-ui-opacity-0 sk-ui-transition-opacity group-hover:sk-ui-opacity-100" />
    </button>
  );
}

export function TransactionHistoryDrawer() {
  const modal = useModal();
  const { transactions, clearHistory, updateTransaction } = useTransactionHistory();
  const [showConfirm, setShowConfirm] = useState(false);
  const isPollingTransactions = useRef(false);
  const transactionsRef = useRef(transactions);
  const pendingTransactionIds = useMemo(
    () =>
      transactions
        .filter((tx) => tx.status === "pending")
        .map((tx) => tx.id)
        .join("|"),
    [transactions],
  );

  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  // Auto-refresh pending transactions
  useEffect(() => {
    if (!pendingTransactionIds) return;

    const pollTransactions = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (isPollingTransactions.current) return;

      isPollingTransactions.current = true;

      try {
        const dueTransactions = getDuePendingTransactions(transactionsRef.current, Date.now());

        for (const tx of dueTransactions) {
          const checkedAt = Date.now();
          const checkCount = (tx.checkCount ?? 0) + 1;

          try {
            const response = await SwapKitApi.getTrackerDetails({ chainId: tx.chainId.toString(), hash: tx.hash });
            const trackerStatus = response.status ?? response.legs?.[0]?.status;
            const status = mapTrackerStatus(trackerStatus) ?? tx.status;

            updateTransaction(tx.id, {
              checkCount,
              lastCheckedAt: checkedAt,
              lastErrorAt: undefined,
              nextCheckAt: status === "pending" ? getNextTrackerCheckAt(tx, checkCount, checkedAt) : undefined,
              status,
              trackerStatus,
            });
          } catch {
            updateTransaction(tx.id, {
              checkCount,
              lastCheckedAt: checkedAt,
              lastErrorAt: checkedAt,
              nextCheckAt: getNextTrackerCheckAt(tx, checkCount, checkedAt),
            });
          }
        }
      } finally {
        isPollingTransactions.current = false;
      }
    };

    const pollIfVisible = () => {
      void pollTransactions();
    };

    pollIfVisible();
    const interval = setInterval(() => {
      pollIfVisible();
    }, TRACKER_POLL_TICK_MS);

    window.addEventListener("focus", pollIfVisible);
    document.addEventListener("visibilitychange", pollIfVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", pollIfVisible);
      document.removeEventListener("visibilitychange", pollIfVisible);
    };
  }, [pendingTransactionIds, updateTransaction]);

  const handleClearHistory = useCallback(() => {
    if (showConfirm) {
      clearHistory();
      setShowConfirm(false);
    } else {
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 3000);
    }
  }, [showConfirm, clearHistory]);

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => b.timestamp - a.timestamp);
  }, [transactions]);

  return (
    <Sheet {...modal}>
      <SheetContent className="sk-ui-flex sk-ui-flex-col">
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
            <div className="sk-ui-flex sk-ui-h-full sk-ui-items-center sk-ui-justify-center">
              <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-center sk-ui-text-center">
                <History className="sk-ui-size-12 sk-ui-text-muted-foreground sk-ui-opacity-50" />
                <p className="sk-ui-mt-4 sk-ui-text-muted-foreground">No transactions yet</p>
                <p className="sk-ui-mt-2 sk-ui-text-muted-foreground sk-ui-text-sm">
                  Your swap and approval transactions will appear here
                </p>
              </div>
            </div>
          )}
        </div>

        {transactions.length > 0 && (
          <button
            className={`sk-ui-flex sk-ui-w-full sk-ui-items-center sk-ui-justify-center sk-ui-gap-2 sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-p-3 sk-ui-text-sm sk-ui-font-medium sk-ui-transition-colors ${
              showConfirm
                ? "sk-ui-border-red-500/50 sk-ui-bg-red-500/10 sk-ui-text-red-500 hover:sk-ui-bg-red-500/20"
                : "sk-ui-bg-card hover:sk-ui-bg-bg-hover"
            }`}
            onClick={handleClearHistory}
            type="button">
            <Trash2 className="sk-ui-size-4" />
            {showConfirm ? "Click again to confirm" : "Clear History"}
          </button>
        )}
      </SheetContent>
    </Sheet>
  );
}
