"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type * as React from "react";

import { cn } from "../../../lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = ({
  className,
  sideOffset = 6,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
  ref?: React.Ref<React.ElementRef<typeof TooltipPrimitive.Content>>;
}) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      className={cn(
        "swapkit-ui-preflight sk-ui-z-50 sk-ui-overflow-hidden sk-ui-rounded-lg sk-ui-border sk-ui-border-white/[0.12] sk-ui-bg-card sk-ui-px-3 sk-ui-py-2 sk-ui-text-card-foreground sk-ui-text-sm sk-ui-font-medium sk-ui-shadow-none",
        "sk-ui-animate-in sk-ui-fade-in-0 sk-ui-zoom-in-95 data-[state=closed]:sk-ui-animate-out data-[state=closed]:sk-ui-fade-out-0 data-[state=closed]:sk-ui-zoom-out-95",
        "data-[side=bottom]:sk-ui-slide-in-from-top-2 data-[side=left]:sk-ui-slide-in-from-right-2 data-[side=right]:sk-ui-slide-in-from-left-2 data-[side=top]:sk-ui-slide-in-from-bottom-2",
        className,
      )}
      ref={ref}
      sideOffset={sideOffset}
      {...props}
    />
  </TooltipPrimitive.Portal>
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
