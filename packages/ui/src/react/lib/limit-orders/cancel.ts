import {
  type Chain,
  type EVMChain,
  EVMChains,
  type LimitOrder,
  type LimitOrderCancelBuildResponse,
} from "@swapkit/helpers";
import { getAssetChain } from "../asset-chain";
import { hasFills, isNativeOneinchSell } from "./amounts";
import { getLimitOrderStatusLine } from "./detail-model";
import { getLimitErrorKey, isActionUnavailable, isInvalidState, isLimitUserRejection } from "./errors";
import { formatOrderAmount, getTicker } from "./row-model";
import { isUiCancellableStatus } from "./status";

export type LimitCancelShape = "evmTx" | "typedData" | "btcMessage" | "none";
export type LimitCancelVariant = "inWallet" | "escrowed" | "deposited" | "partiallyFilled";
export type LimitCancelErrorKind =
  | "rejected"
  | "invalidState"
  | "unavailable"
  | "walletCannotSign"
  | "unsupportedShape"
  | "failed";

export type LimitCancelArtifact = { txHash: string } | { signature: string } | Record<string, never>;

export type LimitCancelEntry =
  | { phase: "signing" }
  | Extract<LimitCancelState, { phase: "submitting" | "submitFailed" }>;

export type LimitCancelGate =
  | { kind: "none" }
  | { kind: "resume" }
  | { kind: "stale" }
  | { kind: "wallet"; reason: "noWallet" | "wrongWallet" | "cannotSignCancel" }
  | { kind: "ready" };

const UNSUPPORTED_CANCEL_SHAPE_KEY = "plugin_swapkit_limit_order_unsupported_cancel_shape";
const WALLET_CANNOT_SIGN_KEYS = new Set([
  "plugin_swapkit_limit_order_wallet_cannot_sign",
  "plugin_swapkit_limit_order_no_signable_provider",
  "core_wallet_connection_not_found",
  "core_plugin_not_found",
]);

export function classifyCancelBuild(
  build: Pick<LimitOrderCancelBuildResponse, "btcSignaturePreimage" | "cancelTx" | "typedData">,
): LimitCancelShape {
  if (build.cancelTx) return "evmTx";
  if (build.typedData) return "typedData";
  if (build.btcSignaturePreimage) return "btcMessage";
  return "none";
}

export function getCancelVariant(
  order: Pick<LimitOrder, "filledBuyAmount" | "filledSellAmount" | "provider" | "sellAsset">,
  shape: LimitCancelShape,
): LimitCancelVariant {
  if (hasFills(order)) return "partiallyFilled";
  if (shape !== "evmTx") return "deposited";
  return isNativeOneinchSell(order) ? "escrowed" : "inWallet";
}

export function needsCancelSignature(shape: LimitCancelShape) {
  return shape !== "none";
}

export function isEvmChain(chain: Chain | undefined) {
  return !!chain && EVMChains.includes(chain as EVMChain);
}

export function isSameAddress(chain: Chain | undefined, a: string, b: string) {
  return isEvmChain(chain) ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export function getCancelGate({
  canSignCancel,
  cancelPhase,
  connectedAddress,
  isFresh,
  order,
}: {
  canSignCancel: boolean;
  cancelPhase: LimitCancelEntry["phase"] | undefined;
  connectedAddress: string | null | undefined;
  isFresh: boolean;
  order: Pick<LimitOrder, "cancelRequestedAt" | "maker" | "provider" | "sellAsset" | "status">;
}): LimitCancelGate {
  if (!isUiCancellableStatus(order.status) || order.cancelRequestedAt) return { kind: "none" };
  if (cancelPhase === "submitFailed") return { kind: "resume" };
  if (cancelPhase) return { kind: "none" };
  if (!isFresh) return { kind: "stale" };
  if (!connectedAddress) return { kind: "wallet", reason: "noWallet" };
  if (!isSameAddress(getAssetChain(order.sellAsset), connectedAddress, order.maker)) {
    return { kind: "wallet", reason: "wrongWallet" };
  }
  if (!canSignCancel) return { kind: "wallet", reason: "cannotSignCancel" };
  return { kind: "ready" };
}

export function classifyCancelError(error: unknown): LimitCancelErrorKind {
  if (isLimitUserRejection(error)) return "rejected";
  if (isInvalidState(error)) return "invalidState";
  if (isActionUnavailable(error)) return "unavailable";
  const key = getLimitErrorKey(error);
  if (key === UNSUPPORTED_CANCEL_SHAPE_KEY) return "unsupportedShape";
  if (WALLET_CANNOT_SIGN_KEYS.has(key)) return "walletCannotSign";
  return "failed";
}

type CancelBuildContext = {
  build: LimitOrderCancelBuildResponse;
  shape: LimitCancelShape;
  variant: LimitCancelVariant;
};

export type LimitCancelState =
  | { phase: "preparing" }
  | ({ phase: "ready" } & CancelBuildContext)
  | ({ phase: "signing" } & CancelBuildContext)
  | { phase: "submitting"; artifact: LimitCancelArtifact; shape: LimitCancelShape }
  | { phase: "submitFailed"; artifact: LimitCancelArtifact; message: string; shape: LimitCancelShape }
  | { phase: "racing" }
  | { phase: "raced"; order: LimitOrder | null }
  | { phase: "done"; status: LimitOrder["status"] }
  | { phase: "closed" };

export type LimitCancelEvent =
  | ({ type: "built" } & CancelBuildContext)
  | { type: "sign" }
  | { type: "signed"; artifact: LimitCancelArtifact }
  | { type: "signRejected" }
  | { type: "submitFailed"; message: string }
  | { type: "retry" }
  | { type: "race" }
  | { type: "raceSettled"; order: LimitOrder | null }
  | { type: "done"; status: LimitOrder["status"] }
  | { type: "close" };

export const INITIAL_CANCEL_STATE: LimitCancelState = { phase: "preparing" };

export function getInitialCancelState(entry: LimitCancelEntry | undefined): LimitCancelState {
  return entry?.phase === "submitFailed" ? entry : INITIAL_CANCEL_STATE;
}

export function limitCancelReducer(state: LimitCancelState, event: LimitCancelEvent): LimitCancelState {
  switch (event.type) {
    case "built":
      return state.phase === "preparing"
        ? { build: event.build, phase: "ready", shape: event.shape, variant: event.variant }
        : state;
    case "sign":
      return state.phase === "ready" ? { ...state, phase: "signing" } : state;
    case "signed":
      return state.phase === "signing" ? { artifact: event.artifact, phase: "submitting", shape: state.shape } : state;
    case "signRejected":
      return state.phase === "signing"
        ? { build: state.build, phase: "ready", shape: state.shape, variant: state.variant }
        : state;
    case "submitFailed":
      return state.phase === "submitting" ? { ...state, message: event.message, phase: "submitFailed" } : state;
    case "retry":
      return state.phase === "submitFailed"
        ? { artifact: state.artifact, phase: "submitting", shape: state.shape }
        : state;
    case "race":
      return { phase: "racing" };
    case "raceSettled":
      return state.phase === "racing" ? { order: event.order, phase: "raced" } : state;
    case "done":
      return { phase: "done", status: event.status };
    case "close":
      return { phase: "closed" };
  }
}

export function getRacedOutcome(order: LimitOrder | null) {
  if (!order) return { body: null, title: "It can no longer be cancelled" };
  switch (order.status) {
    case "FILLED":
      return {
        body: `This order completed while you were deciding, so there's nothing left to cancel. You received ${formatOrderAmount(order.filledBuyAmount)} ${getTicker(order.buyAsset)}.`,
        title: "Too late — it filled",
      };
    case "CANCELLED":
      return { body: getLimitOrderStatusLine(order), title: "Already cancelled" };
    case "EXPIRED":
      return { body: getLimitOrderStatusLine(order), title: "It already expired" };
    default:
      return { body: getLimitOrderStatusLine(order), title: "It can no longer be cancelled" };
  }
}

export function getCancelErrorMessage(kind: LimitCancelErrorKind, detail: string) {
  switch (kind) {
    case "unavailable":
      return "Cancelling isn't available for this order right now. Try again later.";
    case "walletCannotSign":
    case "unsupportedShape":
      return "This wallet can't cancel this order.";
    default:
      return `Couldn't cancel the order: ${detail}`;
  }
}
