"use client";

import type { Chain } from "@swapkit/helpers";
import { CheckCircleIcon } from "lucide-react";
import { TxHashLink } from "./tx-hash-link";

export function LimitOrderPlacedToast({
  deposit,
  summary,
  title,
}: {
  deposit?: { chain: Chain | undefined; txHash: string };
  summary: string;
  title: string;
}) {
  return (
    <div className="sk-ui-flex sk-ui-w-full sk-ui-items-start sk-ui-gap-2">
      <CheckCircleIcon className="sk-ui-mt-1 sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-success-foreground" />
      <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-1 sk-ui-flex-col sk-ui-gap-0.5">
        <div className="sk-ui-font-medium">{title}</div>
        <div className="sk-ui-text-muted-foreground sk-ui-text-xs">{summary}</div>
        {deposit && <TxHashLink chain={deposit.chain} txHash={deposit.txHash} />}
      </div>
    </div>
  );
}
