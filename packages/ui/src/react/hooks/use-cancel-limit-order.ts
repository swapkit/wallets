import {
  AssetValue,
  type Chain,
  FeeOption,
  type LimitOrder,
  type LimitOrderCancelBuildResponse,
  type LimitOrderCancelSubmitResponse,
  parseTransactionValue,
} from "@swapkit/helpers";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { SWAPKIT_WIDGET_TOASTER_ID, toast } from "../components/ui/sonner";
import { getAssetChain, getChainOfId } from "../lib/asset-chain";
import {
  classifyCancelBuild,
  classifyCancelError,
  getCancelErrorMessage,
  getCancelGate,
  getCancelVariant,
  getInitialCancelState,
  type LimitCancelArtifact,
  type LimitCancelErrorKind,
  type LimitCancelShape,
  limitCancelReducer,
} from "../lib/limit-orders/cancel";
import { getLimitErrorKey, getLimitErrorMessage } from "../lib/limit-orders/errors";
import { limitOrderKeys } from "../lib/limit-orders/query-keys";
import { isTerminalLimitOrderStatus } from "../lib/limit-orders/status";
import { useApiConfig, useSwapKitQueryClient } from "../lib/query-client";
import { addSentryBreadcrumb, captureWidgetError, isErrorCaptured } from "../sentry";
import {
  clearLimitOrderCancel,
  getLimitOrderCancelEntry,
  setLimitOrderCancelEntry,
  useLimitOrderCancelPhase,
} from "../stores/limit-order-cancel-store";
import { useSwapKit } from "../swapkit-context";
import { patchLimitOrderInLists } from "./use-limit-order";

type CancelStage = "build" | "sign" | "submit";
type FeeEstimate = { gasAssetId: string; status: "pending" } | { fee: AssetValue; gasAssetId: string; status: "ready" };
type EstimatingWallet = {
  estimateTransactionFee?: (params: {
    data: string;
    feeOption: FeeOption;
    from: string;
    to: string;
    value: bigint;
  }) => Promise<AssetValue>;
};

function getTags(order: LimitOrder, shape?: LimitCancelShape) {
  return { orderId: order.orderId, provider: order.provider, shape: shape ?? "unknown" };
}

function addStageBreadcrumb(stage: CancelStage, order: LimitOrder, shape?: LimitCancelShape) {
  addSentryBreadcrumb(`Limit cancel stage: ${stage}`, "transaction", getTags(order, shape));
}

function captureCancelError(error: unknown, stage: CancelStage, order: LimitOrder, shape?: LimitCancelShape) {
  if (isErrorCaptured(error)) return;
  captureWidgetError(error, {
    category: "transaction",
    extra: { orderId: order.orderId },
    tags: {
      errorKey: getLimitErrorKey(error),
      provider: order.provider,
      shape: shape ?? "unknown",
      stage: `limit_cancel_${stage}`,
    },
  });
}

function getGasAssetId(chain: Chain) {
  try {
    return AssetValue.from({ chain }).toString();
  } catch {
    return null;
  }
}

function canSignCancel(swapKit: ReturnType<typeof useSwapKit>["swapKit"], order: LimitOrder) {
  if (!swapKit) return false;
  try {
    return swapKit.limitOrder.cancel.canSign({ order });
  } catch {
    return false;
  }
}

export function useLimitOrderCancelGate(order: LimitOrder | undefined, isFresh: boolean) {
  const { connectedWallets, isWalletConnected, swapKit } = useSwapKit();
  const cancelPhase = useLimitOrderCancelPhase(order?.orderId);
  const chain = order ? getAssetChain(order.sellAsset) : undefined;
  const sellWallet = isWalletConnected && chain ? connectedWallets.get(chain) : undefined;

  return useMemo(() => {
    if (!order) return { kind: "none" } as const;
    const connected = sellWallet?.address ?? null;
    return getCancelGate({
      cancelPhase,
      canSignCancel: !!connected && canSignCancel(swapKit, order),
      connectedAddress: connected,
      isFresh,
      order,
    });
  }, [cancelPhase, isFresh, order, sellWallet, swapKit]);
}

export function useCancelLimitOrder(
  order: LimitOrder,
  { isOpen, onDone }: { isOpen: boolean; onDone: (status?: string) => void },
) {
  const { swapKit } = useSwapKit();
  const queryClient = useSwapKitQueryClient();
  const cfg = useApiConfig().key;
  const [state, dispatch] = useReducer(
    limitCancelReducer,
    getLimitOrderCancelEntry(order.orderId),
    getInitialCancelState,
  );
  const [feeEstimate, setFeeEstimate] = useState<FeeEstimate | null>(null);
  const started = useRef(state.phase !== "preparing");
  const open = useRef(isOpen);
  open.current = isOpen;
  const detailKey = limitOrderKeys.detail(cfg, order.orderId);

  const finish = useCallback(
    (status?: string) => {
      dispatch({ type: "close" });
      onDone(status);
    },
    [onDone],
  );

  const race = useCallback(async () => {
    clearLimitOrderCancel(order.orderId);
    dispatch({ type: "race" });
    const before = queryClient.getQueryState(detailKey)?.dataUpdatedAt ?? 0;
    try {
      await queryClient.invalidateQueries({ queryKey: detailKey }, { throwOnError: true });
    } catch {
      dispatch({ order: null, type: "raceSettled" });
      return;
    }
    const refreshed = (queryClient.getQueryState(detailKey)?.dataUpdatedAt ?? 0) > before;
    dispatch({
      order: refreshed ? (queryClient.getQueryData<LimitOrder>(detailKey) ?? null) : null,
      type: "raceSettled",
    });
  }, [detailKey, order.orderId, queryClient]);

  const fail = useCallback(
    (error: unknown, stage: CancelStage, shape?: LimitCancelShape): LimitCancelErrorKind => {
      const kind = classifyCancelError(error);

      if (kind === "invalidState") {
        addSentryBreadcrumb("Limit cancel raced", "transaction", { ...getTags(order, shape), stage });
        void race();
        return kind;
      }

      if (stage !== "submit") clearLimitOrderCancel(order.orderId);

      if (kind === "rejected") {
        addSentryBreadcrumb("Limit cancel rejected in wallet", "transaction", getTags(order, shape));
        return kind;
      }

      console.error(`Limit order cancel ${stage} failed:`, error);
      captureCancelError(error, stage, order, shape);
      return kind;
    },
    [order, race],
  );

  const estimateFee = useCallback(
    async (cancelTx: NonNullable<LimitOrderCancelBuildResponse["cancelTx"]>) => {
      const chain = getChainOfId(cancelTx.chainId);
      const gasAssetId = chain ? getGasAssetId(chain) : null;
      if (!swapKit || !chain || !gasAssetId) return;
      setFeeEstimate({ gasAssetId, status: "pending" });
      try {
        const wallet = swapKit.getWallet(chain as Parameters<typeof swapKit.getWallet>[0]) as
          | EstimatingWallet
          | undefined;
        if (typeof wallet?.estimateTransactionFee !== "function") throw new Error("No fee estimator");
        const fee = await wallet.estimateTransactionFee({
          data: cancelTx.data,
          feeOption: FeeOption.Average,
          from: cancelTx.from,
          to: cancelTx.to,
          value: parseTransactionValue(cancelTx.value),
        });
        setFeeEstimate({ fee, gasAssetId, status: "ready" });
      } catch (error) {
        addSentryBreadcrumb("Limit cancel fee estimate failed", "transaction", {
          error: getLimitErrorMessage(error),
          orderId: order.orderId,
        });
        setFeeEstimate(null);
      }
    },
    [order.orderId, swapKit],
  );

  useEffect(() => {
    if (started.current || !swapKit) return;
    started.current = true;

    void (async () => {
      addStageBreadcrumb("build", order);
      let build: LimitOrderCancelBuildResponse;
      try {
        build = await swapKit.limitOrder.cancel.build({ orderId: order.orderId });
      } catch (error) {
        const kind = fail(error, "build");
        if (kind === "invalidState") return;
        toast.error(getCancelErrorMessage(kind, getLimitErrorMessage(error)), { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
        finish();
        return;
      }

      const shape = classifyCancelBuild(build);
      dispatch({ build, shape, type: "built", variant: getCancelVariant(order, shape) });
      if (build.cancelTx) void estimateFee(build.cancelTx);
    })();
  }, [estimateFee, fail, finish, order, swapKit]);

  const applyResult = useCallback(
    (result: LimitOrderCancelSubmitResponse) => {
      const current = queryClient.getQueryData<LimitOrder>(detailKey) ?? order;
      const next: LimitOrder = {
        ...current,
        cancelRequestedAt: result.cancelRequestedAt ?? current.cancelRequestedAt,
        status: result.status,
      };
      queryClient.setQueryData(detailKey, next);
      patchLimitOrderInLists(queryClient, cfg, next);
      void queryClient.invalidateQueries({ queryKey: limitOrderKeys.all(cfg) });
      clearLimitOrderCancel(order.orderId);

      const terminal = isTerminalLimitOrderStatus(result.status);
      addSentryBreadcrumb("Limit order cancel submitted", "transaction", {
        orderId: order.orderId,
        provider: order.provider,
        status: result.status,
      });
      toast.success(terminal ? "Order cancelled" : "Cancel requested", { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
      dispatch({ status: result.status, type: "done" });
      onDone(result.status);
    },
    [cfg, detailKey, onDone, order, queryClient],
  );

  const submit = useCallback(
    async (artifact: LimitCancelArtifact, shape: LimitCancelShape) => {
      if (!swapKit) return;
      setLimitOrderCancelEntry(order.orderId, { artifact, phase: "submitting", shape });
      addStageBreadcrumb("submit", order, shape);
      let result: LimitOrderCancelSubmitResponse;
      try {
        result = await swapKit.limitOrder.cancel.submit({ orderId: order.orderId, ...artifact });
      } catch (error) {
        const kind = fail(error, "submit", shape);
        if (kind === "invalidState") return;
        const message = getCancelErrorMessage(kind, getLimitErrorMessage(error));
        setLimitOrderCancelEntry(order.orderId, { artifact, message, phase: "submitFailed", shape });
        if (!open.current) {
          toast.error("Your cancellation wasn't submitted. Open the order to try again.", {
            toasterId: SWAPKIT_WIDGET_TOASTER_ID,
          });
        }
        dispatch({ message, type: "submitFailed" });
        return;
      }
      applyResult(result);
    },
    [applyResult, fail, order, swapKit],
  );

  const confirm = useCallback(async () => {
    if (!swapKit || state.phase !== "ready") return;
    const { build, shape } = state;
    dispatch({ type: "sign" });
    setLimitOrderCancelEntry(order.orderId, { phase: "signing" });
    addStageBreadcrumb("sign", order, shape);

    let artifact: LimitCancelArtifact;
    try {
      artifact = (await swapKit.limitOrder.cancel.sign({
        cancelBuild: build,
        order: { chainId: order.chainId, orderId: order.orderId },
      })) as LimitCancelArtifact;
    } catch (error) {
      const kind = fail(error, "sign", shape);
      if (kind === "invalidState") return;
      if (kind === "rejected") {
        dispatch({ type: "signRejected" });
        return;
      }
      toast.error(getCancelErrorMessage(kind, getLimitErrorMessage(error)), { toasterId: SWAPKIT_WIDGET_TOASTER_ID });
      finish();
      return;
    }

    dispatch({ artifact, type: "signed" });
    await submit(artifact, shape);
  }, [fail, finish, order, state, submit, swapKit]);

  const retry = useCallback(async () => {
    if (state.phase !== "submitFailed") return;
    addSentryBreadcrumb("Limit cancel submit retried", "ui", getTags(order, state.shape));
    dispatch({ type: "retry" });
    await submit(state.artifact, state.shape);
  }, [order, state, submit]);

  const discard = useCallback(() => {
    if (state.phase !== "submitFailed" || state.shape === "evmTx") return;
    addSentryBreadcrumb("Limit cancel submit discarded", "ui", getTags(order, state.shape));
    clearLimitOrderCancel(order.orderId);
    finish();
  }, [finish, order, state]);

  return { confirm, discard, feeEstimate, retry, state };
}
