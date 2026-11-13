import { AssetValue, Chain } from "@swapkit/helpers";
import { SwapKitApi } from "@swapkit/helpers/api";
import type { SwapKitClient } from "../../swapkit-types";
import {
  type TransactionRecord,
  type TransactionStatus,
  useTransactionHistoryStore,
} from "../stores/transaction-history-store";
import { useSwapKitStore } from "../swapkit-context";
import { addAleoShieldedDeliveryHash } from "./aleo-shielded-deliveries";

const TRACKER_POLL_TICK_MS = 10_000;
const TRACKER_MAX_REQUESTS_PER_TICK = 5;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

function mapTrackerStatus(status: string | undefined): TransactionStatus | null {
  if (status === "completed") return "completed";
  if (status === "failed" || status === "refunded") return "failed";
  return null;
}

async function probeAleoShieldedDelivery({
  response,
  swapKit,
  transaction,
}: {
  response: Awaited<ReturnType<typeof SwapKitApi.getTrackerDetails>>;
  swapKit: SwapKitClient | null;
  transaction: TransactionRecord;
}) {
  if (!swapKit || !transaction.buyAsset || transaction.shieldedDeliveryHash) return undefined;

  try {
    if (AssetValue.from({ asset: transaction.buyAsset }).chain !== Chain.Aleo) return undefined;

    const wallet = swapKit.getWallet(Chain.Aleo);
    const address = swapKit.getAddress(Chain.Aleo);
    const deliveryHash = response.legs.at(-1)?.hash;
    if (!wallet || !address || !deliveryHash) return undefined;

    const records = await wallet.getRecords({ transactionIds: [deliveryHash] });
    if (!records.some((record) => !record.spent)) return undefined;

    addAleoShieldedDeliveryHash(address, deliveryHash);
    return deliveryHash;
  } catch {
    console.warn("Failed to check whether the completed Aleo delivery was shielded");
    return undefined;
  }
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

function getPendingTransactionIds(transactions: TransactionRecord[]) {
  return transactions
    .filter((transaction) => transaction.status === "pending")
    .map((transaction) => transaction.id)
    .join("|");
}

async function pollTrackedTransaction(transaction: TransactionRecord) {
  const { updateTransaction } = useTransactionHistoryStore.getState();
  const checkedAt = Date.now();
  const checkCount = (transaction.checkCount ?? 0) + 1;

  try {
    const response = await SwapKitApi.getTrackerDetails({
      chainId: transaction.chainId.toString(),
      hash: transaction.hash,
    });
    const trackerStatus = response.status ?? response.legs?.[0]?.status;
    const status = mapTrackerStatus(trackerStatus) ?? transaction.status;
    const swapKit = useSwapKitStore.getState().swapKit;
    const detectedShieldedDeliveryHash =
      status === "completed" ? await probeAleoShieldedDelivery({ response, swapKit, transaction }) : undefined;
    const shieldedDeliveryHash = detectedShieldedDeliveryHash ?? transaction.shieldedDeliveryHash;

    updateTransaction(transaction.id, {
      checkCount,
      lastCheckedAt: checkedAt,
      lastErrorAt: undefined,
      nextCheckAt: status === "pending" ? getNextTrackerCheckAt(transaction, checkCount, checkedAt) : undefined,
      shieldedDeliveryHash,
      status,
      trackerStatus,
    });
  } catch {
    updateTransaction(transaction.id, {
      checkCount,
      lastCheckedAt: checkedAt,
      lastErrorAt: checkedAt,
      nextCheckAt: getNextTrackerCheckAt(transaction, checkCount, checkedAt),
    });
  }
}

let isPollingTransactions = false;

async function pollTransactions() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  if (isPollingTransactions) return;

  const dueTransactions = getDuePendingTransactions(useTransactionHistoryStore.getState().transactions, Date.now());
  if (dueTransactions.length === 0) return;

  isPollingTransactions = true;

  try {
    for (const transaction of dueTransactions) {
      await pollTrackedTransaction(transaction);
    }
  } finally {
    isPollingTransactions = false;
  }
}

function pollIfVisible() {
  void pollTransactions();
}

function startTrackerLoop() {
  const interval = setInterval(pollIfVisible, TRACKER_POLL_TICK_MS);

  // Poll right away when the pending set or the SwapKit client changes.
  const unsubscribeHistory = useTransactionHistoryStore.subscribe((state, previousState) => {
    if (state.transactions === previousState.transactions) return;

    const pendingTransactionIds = getPendingTransactionIds(state.transactions);
    if (pendingTransactionIds && pendingTransactionIds !== getPendingTransactionIds(previousState.transactions)) {
      pollIfVisible();
    }
  });
  const unsubscribeSwapKit = useSwapKitStore.subscribe((state, previousState) => {
    if (state.swapKit !== previousState.swapKit) pollIfVisible();
  });

  if (typeof window !== "undefined") window.addEventListener("focus", pollIfVisible);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", pollIfVisible);

  pollIfVisible();

  return () => {
    clearInterval(interval);
    unsubscribeHistory();
    unsubscribeSwapKit();
    if (typeof window !== "undefined") window.removeEventListener("focus", pollIfVisible);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", pollIfVisible);
  };
}

let activeTrackers = 0;
let stopTrackerLoop: (() => void) | null = null;

export function startTransactionTracking(): () => void {
  activeTrackers += 1;
  if (activeTrackers === 1) stopTrackerLoop = startTrackerLoop();

  let stopped = false;

  return () => {
    if (stopped) return;
    stopped = true;
    activeTrackers -= 1;

    if (activeTrackers === 0) {
      stopTrackerLoop?.();
      stopTrackerLoop = null;
    }
  };
}
