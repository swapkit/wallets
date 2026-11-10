import type { LimitOrderStatus } from "@swapkit/helpers";
import {
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleX,
  Clock,
  LoaderCircle,
  type LucideIcon,
  Timer,
} from "lucide-react";

export const ACTIVE_LIMIT_ORDER_STATUSES = [
  "SUBMITTED",
  "OPEN",
  "PARTIAL",
] as const satisfies readonly LimitOrderStatus[];

export const HISTORY_LIMIT_ORDER_STATUSES = [
  "FILLED",
  "CANCELLED",
  "EXPIRED",
  "FAILED",
] as const satisfies readonly LimitOrderStatus[];

export const LIMIT_ORDER_SCOPE_STATUSES = {
  active: ACTIVE_LIMIT_ORDER_STATUSES,
  history: HISTORY_LIMIT_ORDER_STATUSES,
} as const;

export type LimitOrderScope = keyof typeof LIMIT_ORDER_SCOPE_STATUSES;

export type LimitOrderStatusMeta = {
  label: string | null;
  icon: LucideIcon | null;
  iconClass?: string;
  textClass: string | null;
  cancellable: boolean;
};

export const LIMIT_ORDER_LIVE_BAR_CLASS = "sk-ui-bg-warning-foreground";
export const LIMIT_ORDER_TERMINAL_BAR_CLASS = "sk-ui-bg-muted-foreground";

export const LIMIT_ORDER_STATUS_META = {
  CANCELLED: { cancellable: false, icon: CircleX, label: "Cancelled", textClass: "sk-ui-text-muted-foreground" },
  EXPIRED: { cancellable: false, icon: Clock, label: "Expired", textClass: "sk-ui-text-muted-foreground" },
  FAILED: { cancellable: false, icon: CircleX, label: "Failed", textClass: "sk-ui-text-error-foreground" },
  FILLED: { cancellable: false, icon: CircleCheck, label: "Completed", textClass: "sk-ui-text-success-foreground" },
  OPEN: { cancellable: true, icon: Timer, label: "Open", textClass: "sk-ui-text-muted-foreground" },
  PARTIAL: { cancellable: true, icon: CircleDashed, label: "In Progress", textClass: "sk-ui-text-warning-foreground" },
  PENDING: { cancellable: false, icon: null, label: null, textClass: null },
  SUBMITTED: {
    cancellable: true,
    icon: LoaderCircle,
    iconClass: "sk-ui-animate-spin",
    label: "Submitting",
    textClass: "sk-ui-text-warning-foreground",
  },
} as const satisfies Record<LimitOrderStatus, LimitOrderStatusMeta>;

function isKnownLimitOrderStatus(status: string): status is LimitOrderStatus {
  return Object.hasOwn(LIMIT_ORDER_STATUS_META, status);
}

function formatUnknownStatus(status: string) {
  const words = status.replaceAll(/[_-]+/g, " ").trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown";
}

export function getLimitOrderStatusMeta(status: string): LimitOrderStatusMeta {
  if (isKnownLimitOrderStatus(status)) return LIMIT_ORDER_STATUS_META[status];
  return {
    cancellable: false,
    icon: CircleHelp,
    label: formatUnknownStatus(status),
    textClass: "sk-ui-text-muted-foreground",
  };
}

export function isLiveLimitOrderStatus(status: string) {
  return (ACTIVE_LIMIT_ORDER_STATUSES as readonly string[]).includes(status);
}

export function isTerminalLimitOrderStatus(status: string) {
  return (HISTORY_LIMIT_ORDER_STATUSES as readonly string[]).includes(status);
}

export function isUiCancellableStatus(status: string) {
  return getLimitOrderStatusMeta(status).cancellable;
}
