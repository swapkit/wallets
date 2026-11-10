"use client";

import { CollapsibleSection } from "../../../components/ui/collapsible-section";
import { formatFeeBps } from "../../../lib/limit-orders/price";

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-text-sm">
      <span className="sk-ui-text-muted-foreground">{label}</span>
      <span className="sk-ui-text-foreground sk-ui-tabular-nums">{value}</span>
    </div>
  );
}

export function LimitOrderSummary({
  integratorFeeBps,
  takerFeeBps,
}: {
  integratorFeeBps: number;
  takerFeeBps: number;
}) {
  return (
    <CollapsibleSection
      title={
        <span className="sk-ui-flex sk-ui-items-center">
          <span>Order summary</span>
          <span className="sk-ui-mr-2 sk-ui-ml-auto sk-ui-text-foreground">
            Fee {formatFeeBps(takerFeeBps + integratorFeeBps)}
          </span>
        </span>
      }>
      <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2">
        <SummaryRow label="Liquidity fee" value={formatFeeBps(takerFeeBps)} />
        <SummaryRow label="Exchange fee" value={formatFeeBps(integratorFeeBps)} />
      </div>
      <p className="sk-ui-text-muted-foreground sk-ui-text-xs">
        Fees are charged to whoever fills the order and are already reflected in the fill price.
      </p>
    </CollapsibleSection>
  );
}
