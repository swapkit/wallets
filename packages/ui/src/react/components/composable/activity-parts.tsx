"use client";

import { CheckCircle2, type LucideIcon, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";
import type { TransactionStatus } from "../../stores/transaction-history-store";

export function getRelativeTime(timestamp: number, now = Date.now()) {
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

export function StatusIcon({ status }: { status: TransactionStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-success-foreground" />;
    case "failed":
      return <XCircle className="sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-error-foreground" />;
    default:
      return (
        <div className="sk-ui-size-2 sk-ui-shrink-0 sk-ui-animate-pulse sk-ui-rounded-full sk-ui-bg-warning-foreground" />
      );
  }
}

export function ActivityRow({
  children,
  className,
  icon,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "sk-ui-group sk-ui-flex sk-ui-w-full sk-ui-items-start sk-ui-gap-3 sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-bg-card sk-ui-p-3 sk-ui-text-left sk-ui-transition-colors hover:sk-ui-bg-bg-hover",
        className,
      )}
      onClick={onClick}
      type="button">
      <div className="sk-ui-flex sk-ui-h-5 sk-ui-shrink-0 sk-ui-items-center">{icon}</div>
      {children}
    </button>
  );
}

export function ActivityEmptyState({
  description,
  icon: Icon,
  title,
}: {
  description?: ReactNode;
  icon: LucideIcon;
  title: ReactNode;
}) {
  return (
    <div className="sk-ui-flex sk-ui-h-full sk-ui-items-center sk-ui-justify-center">
      <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-center sk-ui-text-center">
        <Icon className="sk-ui-size-12 sk-ui-text-muted-foreground sk-ui-opacity-50" />
        <p className="sk-ui-mt-4 sk-ui-text-muted-foreground">{title}</p>
        {description ? <p className="sk-ui-mt-2 sk-ui-text-muted-foreground sk-ui-text-sm">{description}</p> : null}
      </div>
    </div>
  );
}
