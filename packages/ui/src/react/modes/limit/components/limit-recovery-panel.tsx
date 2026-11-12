"use client";

import { Loader2Icon, XCircleIcon } from "lucide-react";
import { TxHashLink } from "../../../components/simple/tx-hash-link";
import { Button } from "../../../components/ui/button";
import { getAssetChain } from "../../../lib/asset-chain";
import type { LimitHeldLock, LimitHeldOrder } from "../limit-order-store";

function getRecoveryCopy(order: LimitHeldOrder) {
  return order.kind.flow === "deposit"
    ? {
        body: "Your deposit is on-chain. If the order doesn't show up in Activity, contact support with this transaction.",
        title: "Your deposit was sent but the order wasn't registered",
      }
    : { body: "Nothing was sent. Try again or close it.", title: "Your order was signed but not sent" };
}

function getDepositTxHash(order: LimitHeldOrder) {
  return order.artifact && "depositTxHash" in order.artifact ? order.artifact.depositTxHash : null;
}

export function LimitRecoveryPanel({
  isBusy,
  onDiscard,
  onRetry,
  order,
}: {
  isBusy: boolean;
  onDiscard: () => void;
  onRetry: () => void;
  order: LimitHeldOrder & { lock: LimitHeldLock };
}) {
  const copy = getRecoveryCopy(order);
  const depositTxHash = getDepositTxHash(order);

  return (
    <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2">
      <div className="sk-ui-flex sk-ui-items-start sk-ui-gap-2 sk-ui-rounded-lg sk-ui-border sk-ui-border-error-foreground/40 sk-ui-bg-error sk-ui-p-3">
        <XCircleIcon className="sk-ui-mt-px sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-error-foreground" />
        <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-col sk-ui-gap-1">
          <span className="sk-ui-font-medium sk-ui-text-foreground sk-ui-text-sm">{copy.title}</span>
          <span className="sk-ui-text-muted-foreground sk-ui-text-xs">{copy.body}</span>
          {depositTxHash && <TxHashLink chain={getAssetChain(order.route.sellAsset)} txHash={depositTxHash} />}
        </div>
      </div>

      <div className="sk-ui-flex sk-ui-gap-2">
        <Button className="sk-ui-flex-1" disabled={isBusy} onClick={onRetry} size="xl" variant="primary">
          {isBusy && <Loader2Icon className="sk-ui-mr-2 sk-ui-h-4 sk-ui-w-4 sk-ui-animate-spin" />}
          Try again
        </Button>
        <Button disabled={isBusy} onClick={onDiscard} size="xl" variant="secondary">
          Close
        </Button>
      </div>
    </div>
  );
}
