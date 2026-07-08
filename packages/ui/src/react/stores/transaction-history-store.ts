import type { ChainId } from "@swapkit/helpers";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_TRANSACTIONS = 50;
const STORAGE_KEY = "swapkit-transaction-history";

export type TransactionStatus = "pending" | "completed" | "failed";
export type TransactionType = "swap" | "approval";

export type TransactionTrackerMetadata = {
  trackerStatus?: string;
  lastCheckedAt?: number;
  nextCheckAt?: number;
  checkCount?: number;
  lastErrorAt?: number;
};

export type TransactionRecord = {
  id: string;
  hash: string;
  chainId: ChainId;
  timestamp: number;
  status: TransactionStatus;
  type: TransactionType;
  sellAsset?: string;
  sellAmount?: string;
  buyAsset?: string;
  buyAmount?: string;
} & TransactionTrackerMetadata;

type TransactionHistoryStore = {
  transactions: TransactionRecord[];
  addTransaction: (tx: Omit<TransactionRecord, "id" | "timestamp">) => void;
  updateStatus: (id: string, status: TransactionStatus) => void;
  updateTransaction: (id: string, update: Partial<Omit<TransactionRecord, "id">>) => void;
  getTransactions: () => TransactionRecord[];
  clearHistory: () => void;
};

export const useTransactionHistoryStore = create<TransactionHistoryStore>()(
  persist(
    (set, get) => ({
      addTransaction: (tx) => {
        const newTransaction: TransactionRecord = { ...tx, id: `${tx.hash}-${tx.chainId}`, timestamp: Date.now() };

        set((state) => {
          const updatedTransactions = [newTransaction, ...state.transactions];

          if (updatedTransactions.length > MAX_TRANSACTIONS) {
            return { transactions: updatedTransactions.slice(0, MAX_TRANSACTIONS) };
          }

          return { transactions: updatedTransactions };
        });
      },

      clearHistory: () => {
        set({ transactions: [] });
      },

      getTransactions: () => {
        return get().transactions;
      },
      transactions: [],

      updateStatus: (id, status) => {
        set((state) => ({ transactions: state.transactions.map((tx) => (tx.id === id ? { ...tx, status } : tx)) }));
      },

      updateTransaction: (id, update) => {
        set((state) => ({ transactions: state.transactions.map((tx) => (tx.id === id ? { ...tx, ...update } : tx)) }));
      },
    }),
    { name: STORAGE_KEY },
  ),
);

export function useTransactionHistory() {
  const store = useTransactionHistoryStore();

  return {
    addTransaction: store.addTransaction,
    clearHistory: store.clearHistory,
    getTransactions: store.getTransactions,
    transactions: store.transactions,
    updateStatus: store.updateStatus,
    updateTransaction: store.updateTransaction,
  };
}
