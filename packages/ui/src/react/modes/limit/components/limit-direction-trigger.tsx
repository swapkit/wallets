"use client";

import { ChevronsUpDownIcon } from "lucide-react";
import { Button } from "../../../components/ui/button";
import type { LimitDirection } from "../../../lib/limit-orders/price";

export function LimitDirectionTrigger({
  direction,
  disabled,
  onToggle,
}: {
  direction: LimitDirection;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      className="sk-ui--ml-2 sk-ui-h-7 sk-ui-gap-1 sk-ui-rounded-md sk-ui-px-2 sk-ui-font-medium sk-ui-text-foreground sk-ui-text-xs"
      disabled={disabled}
      onClick={onToggle}
      size="xs"
      type="button"
      variant="ghost">
      {direction === "sell" ? "Sell" : "Buy"}
      <ChevronsUpDownIcon className="sk-ui-size-3 sk-ui-text-muted-foreground" />
    </Button>
  );
}
