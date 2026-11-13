"use client";

import { cn } from "../../../lib/utils";
import { getLimitOrderStatusMeta } from "../../lib/limit-orders/status";

export function LimitOrderStatusIcon({ className, status }: { className?: string; status: string }) {
  const meta = getLimitOrderStatusMeta(status);
  if (!meta.icon) return null;
  const Icon = meta.icon;

  return (
    <Icon
      aria-hidden
      className={cn(
        "sk-ui-size-4 sk-ui-shrink-0",
        meta.textClass ?? "sk-ui-text-muted-foreground",
        meta.iconClass,
        className,
      )}
    />
  );
}
