"use client";

import { CheckIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "../../../lib/utils";

export type ChipProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  /** Whether the chip is in its "on" state. Drives styling and the trailing checkmark. */
  selected?: boolean;
  /** Optional leading element (icon, swatch, dot). Sized 12–16px to match chip metrics. */
  leading?: React.ReactNode;
};

export const Chip = ({
  className,
  selected = false,
  leading,
  children,
  ref,
  ...props
}: ChipProps & { ref?: React.Ref<HTMLButtonElement> }) => (
  <button
    aria-pressed={selected}
    className={cn(
      "sk-ui-inline-flex sk-ui-items-center sk-ui-gap-1.5 sk-ui-h-8 sk-ui-px-2.5 sk-ui-rounded-md sk-ui-border sk-ui-text-xs sk-ui-leading-none sk-ui-transition-colors focus-visible:sk-ui-outline-none focus-visible:sk-ui-ring-2 focus-visible:sk-ui-ring-ring",
      selected
        ? "sk-ui-bg-bg-active sk-ui-border-accent/60 sk-ui-text-foreground hover:sk-ui-bg-bg-active"
        : "sk-ui-bg-card sk-ui-border-border sk-ui-text-muted-foreground hover:sk-ui-bg-bg-hover hover:sk-ui-text-foreground",
      className,
    )}
    ref={ref}
    type="button"
    {...props}>
    {leading}
    <span className="sk-ui-truncate">{children}</span>
    {selected && <CheckIcon className="sk-ui-w-3 sk-ui-h-3 sk-ui-text-accent" />}
  </button>
);
Chip.displayName = "Chip";
