import { create } from "zustand";
import type { LimitCancelEntry } from "../lib/limit-orders/cancel";

type LimitOrderCancelStore = {
  entries: ReadonlyMap<string, LimitCancelEntry>;
  clear: (orderId: string) => void;
  set: (orderId: string, entry: LimitCancelEntry) => void;
};

export const useLimitOrderCancelStore = create<LimitOrderCancelStore>((set) => ({
  clear: (orderId) =>
    set((state) => {
      if (!state.entries.has(orderId)) return state;
      const entries = new Map(state.entries);
      entries.delete(orderId);
      return { entries };
    }),
  entries: new Map(),
  set: (orderId, entry) =>
    set((state) => {
      const entries = new Map(state.entries);
      entries.set(orderId, entry);
      return { entries };
    }),
}));

export function useIsLimitOrderCancelPending(orderId: string | null | undefined) {
  return useLimitOrderCancelStore((state) => {
    const phase = orderId ? state.entries.get(orderId)?.phase : undefined;
    return phase === "signing" || phase === "submitting";
  });
}

export function useLimitOrderCancelPhase(orderId: string | null | undefined) {
  return useLimitOrderCancelStore((state) => (orderId ? state.entries.get(orderId)?.phase : undefined));
}

export function getLimitOrderCancelEntry(orderId: string) {
  return useLimitOrderCancelStore.getState().entries.get(orderId);
}

export function clearLimitOrderCancel(orderId: string) {
  useLimitOrderCancelStore.getState().clear(orderId);
}

export function setLimitOrderCancelEntry(orderId: string, entry: LimitCancelEntry) {
  useLimitOrderCancelStore.getState().set(orderId, entry);
}
