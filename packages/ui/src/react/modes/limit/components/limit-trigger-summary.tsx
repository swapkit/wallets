"use client";

import { AlertTriangleIcon, CheckCircleIcon } from "lucide-react";
import { match } from "ts-pattern";
import { cn } from "../../../../lib/utils";
import type { LimitPriceBand, LimitTriggerSummaryData } from "../../../lib/limit-orders/price";

export function LimitTriggerSummary({
  anchor,
  band,
  baseTicker,
  isCrossChain,
  market,
  quoteTicker,
  summary,
}: {
  anchor: string;
  band: LimitPriceBand;
  baseTicker: string;
  isCrossChain: boolean;
  market: string;
  quoteTicker: string;
  summary: LimitTriggerSummaryData;
}) {
  const { amountRole, condition, price, quoteAmount } = summary;
  const isAtOrAbove = condition === "atOrAbove";
  const fillsNow = `${isAtOrAbove ? "Raise the price above" : "Lower the price below"} ${anchor} to wait on the market instead.`;

  const { Icon, body, detail, iconClass, title } = match(band)
    .with("resting", () => ({
      body:
        amountRole === "receive"
          ? `You receive ${quoteAmount} ${quoteTicker} ${isCrossChain ? "before fees" : "in full"}.`
          : `You pay ${quoteAmount} ${quoteTicker} in full — nothing is added.`,
      detail: null,
      Icon: CheckCircleIcon,
      iconClass: "sk-ui-text-success-foreground",
      title: isAtOrAbove
        ? `Fills when 1 ${baseTicker} is worth ${price} ${quoteTicker} or more.`
        : `Fills when 1 ${baseTicker} costs ${price} ${quoteTicker} or less.`,
    }))
    .with("withinFeeGap", () => ({
      body: fillsNow,
      detail: `Fills at ${price} and you ${amountRole} that in full. A swap right now gives about ${market}.`,
      Icon: AlertTriangleIcon,
      iconClass: "sk-ui-text-warning-foreground",
      title: "This order fills immediately.",
    }))
    .with("beyond", () => ({
      body: fillsNow,
      detail: `Fills at ${price}. A swap right now gives about ${market}.`,
      Icon: AlertTriangleIcon,
      iconClass: "sk-ui-text-error-foreground",
      title: "This order fills immediately, at a worse rate than a swap.",
    }))
    .exhaustive();

  return (
    <div className="sk-ui-flex sk-ui-items-start sk-ui-gap-2">
      <Icon className={cn("sk-ui-mt-px sk-ui-size-4 sk-ui-shrink-0", iconClass)} />
      <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-col sk-ui-gap-1">
        <span className="sk-ui-font-medium sk-ui-text-foreground sk-ui-text-sm">{title}</span>
        <span className="sk-ui-text-muted-foreground sk-ui-text-xs">{body}</span>
        {detail && <span className="sk-ui-mt-1 sk-ui-text-[11px] sk-ui-text-muted-foreground">{detail}</span>}
      </div>
    </div>
  );
}
