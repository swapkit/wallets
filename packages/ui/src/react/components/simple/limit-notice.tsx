"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

const TONE_CLASSES = {
  error: "sk-ui-text-error-foreground",
  neutral: "sk-ui-text-muted-foreground",
  warning: "sk-ui-text-warning-foreground",
} as const;

export function LimitNotice({
  body,
  icon: Icon,
  title,
  tone,
}: {
  body: ReactNode;
  icon: LucideIcon;
  title?: ReactNode;
  tone: keyof typeof TONE_CLASSES;
}) {
  return (
    <div className="sk-ui-flex sk-ui-items-start sk-ui-gap-2 sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-bg-card sk-ui-p-3">
      <Icon className={cn("sk-ui-mt-px sk-ui-size-4 sk-ui-shrink-0", TONE_CLASSES[tone])} />
      <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-col sk-ui-gap-1">
        {title && <span className="sk-ui-font-medium sk-ui-text-foreground sk-ui-text-xs">{title}</span>}
        <span className="sk-ui-text-muted-foreground sk-ui-text-xs">{body}</span>
      </div>
    </div>
  );
}
