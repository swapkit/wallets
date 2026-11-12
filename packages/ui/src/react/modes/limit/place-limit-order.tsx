import { AssetValue, getChainConfig, type LimitOrderBuildResponse, type LimitOrderQuoteRoute } from "@swapkit/helpers";
import type { SwapKitClient } from "../../../swapkit-types";
import { LimitOrderPlacedToast } from "../../components/simple/limit-order-placed-toast";
import { SWAPKIT_WIDGET_TOASTER_ID, toast } from "../../components/ui/sonner";
import { showModal } from "../../hooks/use-modal";
import { getAssetChain } from "../../lib/asset-chain";
import {
  getLimitErrorKey,
  getLimitErrorMessage,
  isInvalidState,
  isLimitUserRejection,
  LIMIT_BUILD_ERROR_KEYS,
  LIMIT_SIGN_ERROR_KEYS,
  LIMIT_SUBMIT_ERROR_KEYS,
} from "../../lib/limit-orders/errors";
import { formatExpiryDuration, getLimitExpiresAt, type LimitExpiryBounds } from "../../lib/limit-orders/expiry";
import type { LimitDirection } from "../../lib/limit-orders/price";
import { limitOrderKeys } from "../../lib/limit-orders/query-keys";
import { getTicker } from "../../lib/limit-orders/row-model";
import type { QueryClient } from "../../lib/query-client";
import { addSentryBreadcrumb, captureWidgetError, isErrorCaptured } from "../../sentry";
import { useTransactionHistoryStore } from "../../stores/transaction-history-store";
import { confirmAndSendApproval, type EVMWallet } from "../swap/approval";
import { LimitOrderConfirmDialog } from "./components/limit-order-confirm-dialog";
import { classifyLimitBuild, type LimitSignableBuildKind } from "./lib/build-shape";
import { formatHeldAmount, getHeldSellAmount, hasDepositAmountMismatch, isApproximateReceive } from "./lib/held-order";
import {
  type LimitHeldOrder,
  type LimitOrderArtifact,
  releaseHeldLimitOrder,
  useLimitOrderStore,
} from "./limit-order-store";

export type LimitOrderDraft = {
  destinationAddress: string;
  direction: LimitDirection;
  expiryBounds: LimitExpiryBounds;
  expirySeconds: number;
  route: LimitOrderQuoteRoute;
  sourceAddress: string;
};

export type LimitOrderContext = {
  apiConfigKey: string;
  onQuoteStale: () => void;
  onRouteExpired: () => void;
  queryClient: QueryClient;
  swapKit: SwapKitClient;
};

export type PlaceLimitOrder = (draft: LimitOrderDraft, context: LimitOrderContext) => Promise<void>;

type LimitStage = "limit_build" | "limit_approval" | "limit_sign_typed_data" | "limit_send_deposit" | "limit_submit";

const WALLET_CANNOT_SIGN_MESSAGE = "This wallet can't sign this order.";
const USER_REJECTED_MESSAGE = "Order not placed — you rejected it in your wallet.";

function getOrderTags(route: LimitOrderQuoteRoute, kind?: LimitSignableBuildKind) {
  return {
    custody: kind?.custody ?? "unknown",
    flow: kind?.flow ?? "unknown",
    provider: route.provider,
    routeId: route.routeId,
  };
}

function addStageBreadcrumb(
  stage: LimitStage,
  { kind, orderId, route }: { kind?: LimitSignableBuildKind; orderId?: string; route: LimitOrderQuoteRoute },
) {
  addSentryBreadcrumb(`Limit stage: ${stage}`, "transaction", { ...getOrderTags(route, kind), orderId });
}

function getDepositTxHash(artifact: LimitOrderArtifact | null) {
  return artifact && "depositTxHash" in artifact ? artifact.depositTxHash : undefined;
}

function captureLimitError(
  error: unknown,
  {
    depositTxHash,
    kind,
    orderId,
    route,
    stage,
  }: {
    depositTxHash?: string;
    kind?: LimitSignableBuildKind;
    orderId?: string;
    route: LimitOrderQuoteRoute;
    stage: LimitStage;
  },
) {
  if (isErrorCaptured(error)) return;
  captureWidgetError(error, {
    category: "transaction",
    extra: { depositTxHash, orderId, routeId: route.routeId },
    tags: {
      buyAsset: route.buyAsset,
      errorKey: getLimitErrorKey(error),
      flow: kind?.flow ?? "unknown",
      provider: route.provider,
      sellAsset: route.sellAsset,
      stage,
    },
  });
}

function showError(message: string) {
  toast.error(message, { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
}

function getHeldOrder() {
  return useLimitOrderStore.getState().held;
}

function updateHeldOrder(update: Partial<LimitHeldOrder>) {
  useLimitOrderStore.getState().updateHeldOrder(update);
  return getHeldOrder();
}

function handleBuildError(error: unknown, draft: LimitOrderDraft, context: LimitOrderContext) {
  const key = getLimitErrorKey(error);

  if (key === LIMIT_BUILD_ERROR_KEYS.quoteNotFound) {
    addSentryBreadcrumb("Limit route expired before build", "transaction", getOrderTags(draft.route));
    context.onRouteExpired();
    return;
  }

  if (key === LIMIT_BUILD_ERROR_KEYS.makerBlacklisted) {
    showError("Limit orders aren't available for this address.");
    return;
  }

  console.error("Limit order build failed:", error);
  captureLimitError(error, { route: draft.route, stage: "limit_build" });
  showError(`Couldn't place the order: ${getLimitErrorMessage(error)}`);
}

function handleSignError(error: unknown, held: LimitHeldOrder, stage: LimitStage) {
  const { build, kind, route } = held;

  if (isLimitUserRejection(error)) {
    addSentryBreadcrumb("Limit order rejected in wallet", "transaction", getOrderTags(route, kind));
    releaseHeldLimitOrder();
    toast.warning(USER_REJECTED_MESSAGE, { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
    return;
  }

  const key = getLimitErrorKey(error);
  console.error("Limit order signing failed:", error);

  const cannotSign =
    key === LIMIT_SIGN_ERROR_KEYS.walletCannotSign || key === LIMIT_SIGN_ERROR_KEYS.unsupportedSignShape;

  captureLimitError(error, { kind, orderId: build.orderId, route, stage });
  releaseHeldLimitOrder();
  showError(cannotSign ? WALLET_CANNOT_SIGN_MESSAGE : `Couldn't place the order: ${getLimitErrorMessage(error)}`);
}

function handleSubmitError(error: unknown, held: LimitHeldOrder, context: LimitOrderContext) {
  const { artifact, build, kind, route } = held;
  const key = getLimitErrorKey(error);
  const message = getLimitErrorMessage(error);
  const depositTxHash = getDepositTxHash(artifact);
  const hasDepositHash = !!depositTxHash;
  console.error("Limit order submit failed:", error);

  if (!hasDepositHash && key === LIMIT_SUBMIT_ERROR_KEYS.insufficientAllowance) {
    addSentryBreadcrumb("Limit order allowance missing on submit", "transaction", getOrderTags(route, kind));
    releaseHeldLimitOrder();
    context.onQuoteStale();
    showError("Approval missing — review the order again.");
    return;
  }

  if (!hasDepositHash && key === LIMIT_SUBMIT_ERROR_KEYS.maxOrdersExceeded) {
    releaseHeldLimitOrder();
    showError(message);
    return;
  }

  if (hasDepositHash && isInvalidState(error)) {
    addSentryBreadcrumb("Limit deposit order already registered", "transaction", {
      ...getOrderTags(route, kind),
      depositTxHash,
      orderId: build.orderId,
    });
    releaseHeldLimitOrder();
    void context.queryClient.invalidateQueries({ queryKey: limitOrderKeys.all(context.apiConfigKey) });
    toast.success("Deposit sent — your order will appear in Activity shortly.", {
      toasterId: SWAPKIT_WIDGET_TOASTER_ID,
    });
    return;
  }

  captureLimitError(error, { depositTxHash, kind, orderId: build.orderId, route, stage: "limit_submit" });

  if (isInvalidState(error)) {
    releaseHeldLimitOrder();
    showError(`Couldn't place the order: ${message}`);
    return;
  }

  updateHeldOrder({ lock: "signedNotSubmitted" });
  showError(`Couldn't place the order: ${message}`);
}

function showPlacedToast(held: LimitHeldOrder, artifact: LimitOrderArtifact) {
  const { expirySeconds, kind, route } = held;
  const approximate = isApproximateReceive(kind) ? "~" : "";
  const summary = `${formatHeldAmount(getHeldSellAmount(held))} ${getTicker(route.sellAsset)} → ${approximate}${formatHeldAmount(route.buyAmount)} ${getTicker(route.buyAsset)} · expires in ${formatExpiryDuration(expirySeconds)}`;
  const deposit =
    "depositTxHash" in artifact ? { chain: getAssetChain(route.sellAsset), txHash: artifact.depositTxHash } : undefined;

  toast(
    <LimitOrderPlacedToast
      deposit={deposit}
      summary={summary}
      title={deposit ? "Deposit sent · order placed" : "Limit order placed"}
    />,
    { duration: 10_000, toasterId: SWAPKIT_WIDGET_TOASTER_ID },
  );
}

async function approveHeldOrder(held: LimitHeldOrder, swapKit: SwapKitClient) {
  const { approvalTx } = held.build;
  if (!approvalTx) return { confirmed: true, failedOnChain: false };

  const { chain } = AssetValue.from({ asset: held.route.sellAsset });
  const wallet = swapKit.getWallet(chain) as EVMWallet | undefined;
  if (!wallet) throw new Error("Wallet not connected for approval transaction");

  return await confirmAndSendApproval({
    addTransaction: useTransactionHistoryStore.getState().addTransaction,
    amount: getHeldSellAmount(held),
    approvalTx,
    chain,
    note: "Keep the approval in place until the order fills or expires. Removing it stops the order from filling.",
    tokenAsset: held.route.sellAsset,
    wallet,
  });
}

type StepProgress = { stage: LimitStage };

async function confirmStep(held: LimitHeldOrder) {
  if (held.confirmed) return held;
  const confirming = updateHeldOrder({ stage: "confirm" });
  if (!confirming) return null;

  const { confirmed } = await showModal(<LimitOrderConfirmDialog order={confirming} />);
  if (confirmed) return updateHeldOrder({ confirmed: true });

  addSentryBreadcrumb("Limit order confirm dismissed", "ui", getOrderTags(held.route, held.kind));
  releaseHeldLimitOrder();
  return null;
}

async function approvalStep(held: LimitHeldOrder, context: LimitOrderContext, progress: StepProgress) {
  if (!held.kind.needsApproval || held.approved) return held;
  progress.stage = "limit_approval";
  addStageBreadcrumb(progress.stage, { kind: held.kind, orderId: held.build.orderId, route: held.route });
  const approving = updateHeldOrder({ stage: "approval" });
  if (!approving) return null;

  const { confirmed, failedOnChain } = await approveHeldOrder(approving, context.swapKit);
  if (confirmed && !failedOnChain) return updateHeldOrder({ approved: true });

  releaseHeldLimitOrder();
  if (failedOnChain) showError("Couldn't place the order: the approval failed on-chain.");
  return null;
}

async function signStep(held: LimitHeldOrder, context: LimitOrderContext, progress: StepProgress) {
  if (held.artifact) return held;
  const stage = held.kind.flow === "signature" ? "limit_sign_typed_data" : "limit_send_deposit";
  progress.stage = stage;
  addStageBreadcrumb(stage, { kind: held.kind, orderId: held.build.orderId, route: held.route });
  const signing = updateHeldOrder({ stage: "sign" });
  if (!signing) return null;

  try {
    const artifact: LimitOrderArtifact = await context.swapKit.limitOrder.sign({
      build: signing.build,
      order: {
        chainId: getChainConfig(AssetValue.from({ asset: signing.route.sellAsset }).chain).chainId,
        orderId: signing.build.orderId,
      },
    });
    addSentryBreadcrumb("Limit order signed", "transaction", {
      ...getOrderTags(signing.route, signing.kind),
      depositTxHash: getDepositTxHash(artifact),
      orderId: signing.build.orderId,
    });
    return updateHeldOrder({ artifact }) ?? { ...signing, artifact };
  } catch (error) {
    handleSignError(error, signing, stage);
    return null;
  }
}

async function submitStep(held: LimitHeldOrder, context: LimitOrderContext, progress: StepProgress) {
  const { artifact, build, kind, route } = held;
  if (!artifact) return;
  progress.stage = "limit_submit";
  addStageBreadcrumb(progress.stage, { kind, orderId: build.orderId, route });
  const submitting = updateHeldOrder({ stage: "submit" }) ?? held;

  try {
    await context.swapKit.limitOrder.submit({ orderId: build.orderId, ...artifact });
  } catch (error) {
    handleSubmitError(error, submitting, context);
    return;
  }

  addSentryBreadcrumb("Limit order placed", "transaction", { ...getOrderTags(route, kind), orderId: build.orderId });
  void context.queryClient.invalidateQueries({ queryKey: limitOrderKeys.all(context.apiConfigKey) });
  releaseHeldLimitOrder();
  showPlacedToast(submitting, artifact);
}

export async function resumeHeldLimitOrder(context: LimitOrderContext) {
  const held = updateHeldOrder({ lock: null });
  if (!held) return;

  const { build, kind, route } = held;
  const progress: StepProgress = { stage: "limit_build" };

  try {
    const confirmed = await confirmStep(held);
    const approved = confirmed && (await approvalStep(confirmed, context, progress));
    const signed = approved && (await signStep(approved, context, progress));
    if (signed) await submitStep(signed, context, progress);
  } catch (error) {
    console.error("Limit order failed:", error);
    const current = getHeldOrder();
    captureLimitError(error, {
      depositTxHash: getDepositTxHash(current?.artifact ?? null),
      kind,
      orderId: build.orderId,
      route,
      stage: progress.stage,
    });
    if (current?.artifact) updateHeldOrder({ lock: "signedNotSubmitted" });
    else releaseHeldLimitOrder();
    showError(`Couldn't place the order: ${getLimitErrorMessage(error)}`);
  }
}

function holdBuild(
  draft: LimitOrderDraft,
  build: LimitOrderBuildResponse,
  kind: LimitSignableBuildKind,
  expiresAt: number,
) {
  useLimitOrderStore
    .getState()
    .holdOrder({
      approved: false,
      artifact: null,
      build,
      confirmed: false,
      destinationAddress: draft.destinationAddress,
      direction: draft.direction,
      expiresAt,
      expirySeconds: draft.expirySeconds,
      kind,
      lock: null,
      route: draft.route,
      sourceAddress: draft.sourceAddress,
      stage: "confirm",
    });
}

export const placeLimitOrder: PlaceLimitOrder = async (draft, context) => {
  const { destinationAddress, expiryBounds, expirySeconds, route, sourceAddress } = draft;
  const expiresAt = getLimitExpiresAt({ bounds: expiryBounds, nowMs: Date.now(), seconds: expirySeconds });

  addSentryBreadcrumb("User initiated limit order", "transaction", {
    buyAsset: route.buyAsset,
    direction: draft.direction,
    sellAmount: route.sellAmount,
    sellAsset: route.sellAsset,
  });
  addStageBreadcrumb("limit_build", { route });

  let build: LimitOrderBuildResponse;
  try {
    build = await context.swapKit.limitOrder.build({
      destinationAddress,
      expiresAt,
      routeId: route.routeId,
      sourceAddress,
    });
  } catch (error) {
    handleBuildError(error, draft, context);
    return;
  }

  const kind = classifyLimitBuild(build);

  if (kind.flow === "invalid") {
    captureLimitError(new Error(`Invalid limit order build: ${kind.reason}`), {
      orderId: build.orderId,
      route,
      stage: "limit_build",
    });
    showError(`Couldn't place the order: ${kind.reason}`);
    return;
  }

  if (kind.flow === "deposit" && hasDepositAmountMismatch({ build, route })) {
    addSentryBreadcrumb("Limit deposit amount differs from quote", "transaction", {
      depositAmount: build.depositAmount,
      orderId: build.orderId,
      sellAmount: route.sellAmount,
    });
  }

  holdBuild(draft, build, kind, expiresAt);
  await resumeHeldLimitOrder(context);
};
