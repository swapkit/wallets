import type { LimitOrderBuildResponse, LimitOrderQuoteRoute } from "@swapkit/helpers";
import { create } from "zustand";
import { DEFAULT_LIMIT_EXPIRY, type LimitExpiry } from "../../lib/limit-orders/expiry";
import type { LimitDirection } from "../../lib/limit-orders/price";
import type { LimitSignableBuildKind } from "./lib/build-shape";

export type LimitOrderArtifact = { signature: string } | { depositTxHash: string };

export type LimitHeldLock = "signedNotSubmitted";

export type LimitHeldStage = "confirm" | "approval" | "sign" | "submit";

export type LimitHeldOrder = {
  approved: boolean;
  artifact: LimitOrderArtifact | null;
  build: LimitOrderBuildResponse;
  confirmed: boolean;
  destinationAddress: string;
  direction: LimitDirection;
  expiresAt: number;
  expirySeconds: number;
  kind: LimitSignableBuildKind;
  lock: LimitHeldLock | null;
  route: LimitOrderQuoteRoute;
  sourceAddress: string;
  stage: LimitHeldStage;
};

type LimitOrderValues = {
  buyAmount: string;
  direction: LimitDirection;
  expiry: LimitExpiry;
  held: LimitHeldOrder | null;
  isExpiryExpanded: boolean;
  price: { scope: string; value: string } | null;
  requoteNotice: { previousAmount: string } | null;
};

type LimitOrderState = LimitOrderValues & {
  holdOrder: (held: LimitHeldOrder) => void;
  setBuyAmount: (buyAmount: string) => void;
  setDirection: (direction: LimitDirection) => void;
  setExpiry: (expiry: LimitExpiry) => void;
  setIsExpiryExpanded: (isExpiryExpanded: boolean) => void;
  setPrice: (scope: string, value: string) => void;
  setRequoteNotice: (requoteNotice: LimitOrderValues["requoteNotice"]) => void;
  updateHeldOrder: (update: Partial<LimitHeldOrder>) => void;
};

const initialLimitOrderValues: LimitOrderValues = {
  buyAmount: "",
  direction: "sell",
  expiry: DEFAULT_LIMIT_EXPIRY,
  held: null,
  isExpiryExpanded: false,
  price: null,
  requoteNotice: null,
};

export const useLimitOrderStore = create<LimitOrderState>()((set) => ({
  ...initialLimitOrderValues,
  holdOrder: (held) => set({ held }),
  setBuyAmount: (buyAmount) => set({ buyAmount }),
  setDirection: (direction) => set({ direction }),
  setExpiry: (expiry) => set({ expiry }),
  setIsExpiryExpanded: (isExpiryExpanded) => set({ isExpiryExpanded }),
  setPrice: (scope, value) => set({ price: { scope, value } }),
  setRequoteNotice: (requoteNotice) => set({ requoteNotice }),
  updateHeldOrder: (update) => set((state) => (state.held ? { held: { ...state.held, ...update } } : {})),
}));

export function resetLimitOrderStore() {
  useLimitOrderStore.setState(initialLimitOrderValues);
}

export function releaseHeldLimitOrder() {
  useLimitOrderStore.setState({ held: null, price: null });
}

export function getLimitPriceScope({
  buyAsset,
  direction,
  sellAsset,
}: {
  buyAsset: string;
  direction: LimitDirection;
  sellAsset: string;
}) {
  return `${direction}:${sellAsset.toLowerCase()}:${buyAsset.toLowerCase()}`;
}
