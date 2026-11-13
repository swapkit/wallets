"use client";

import type { LimitOrderQuoteRoute } from "@swapkit/helpers";
import { useApiConfig, useSwapKitQueryClient } from "../../../lib/query-client";
import { addSentryBreadcrumb } from "../../../sentry";
import { useWidgetFormStore } from "../../../stores/widget-form-store";
import { useSwapKit } from "../../../swapkit-context";
import { releaseHeldLimitOrder, useLimitOrderStore } from "../limit-order-store";
import {
  type LimitOrderContext,
  type LimitOrderDraft,
  type PlaceLimitOrder,
  resumeHeldLimitOrder,
} from "../place-limit-order";

type DraftInput = Omit<LimitOrderDraft, "expirySeconds" | "route" | "sourceAddress"> & {
  expirySeconds: number | null;
  route: LimitOrderQuoteRoute | null;
  sourceAddress: string | undefined;
};

function getLimitOrderDraft({ expirySeconds, route, sourceAddress, ...rest }: DraftInput): LimitOrderDraft | null {
  if (!route || expirySeconds === null || !sourceAddress) return null;
  return { ...rest, expirySeconds, route, sourceAddress };
}

export function useLimitOrderActions({
  draft,
  onPlaceOrder,
  previousQuoteAmount,
  refetchQuote,
}: {
  draft: DraftInput;
  onPlaceOrder: PlaceLimitOrder;
  previousQuoteAmount: string;
  refetchQuote: () => void;
}) {
  const { swapKit } = useSwapKit();
  const queryClient = useSwapKitQueryClient();
  const apiConfigKey = useApiConfig().key;
  const held = useLimitOrderStore((state) => state.held);
  const setRequoteNotice = useLimitOrderStore((state) => state.setRequoteNotice);
  const startOperation = useWidgetFormStore((state) => state.startOperation);
  const finishOperation = useWidgetFormStore((state) => state.finishOperation);

  const getContext = (): LimitOrderContext | null =>
    swapKit
      ? {
          apiConfigKey,
          onQuoteStale: refetchQuote,
          onRouteExpired: () => {
            setRequoteNotice({ previousAmount: previousQuoteAmount });
            refetchQuote();
          },
          queryClient,
          swapKit,
        }
      : null;

  const runOperation = async (operation: (context: LimitOrderContext) => Promise<void>) => {
    const context = getContext();
    if (!context || !startOperation("limit")) return;
    try {
      await operation(context);
    } finally {
      finishOperation();
    }
  };

  const placeOrder = async () => {
    const orderDraft = getLimitOrderDraft(draft);
    if (!orderDraft) return;
    await runOperation((context) => onPlaceOrder(orderDraft, context));
  };

  const retryHeldOrder = async () => {
    addSentryBreadcrumb("Limit held order retried", "ui", { lock: held?.lock, orderId: held?.build.orderId });
    await runOperation(resumeHeldLimitOrder);
  };

  const discardHeldOrder = () => {
    addSentryBreadcrumb("Limit held order discarded", "ui", { lock: held?.lock, orderId: held?.build.orderId });
    releaseHeldLimitOrder();
  };

  return { discardHeldOrder, placeOrder, retryHeldOrder };
}
