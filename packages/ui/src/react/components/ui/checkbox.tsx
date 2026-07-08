"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "../../../lib/utils";

const Checkbox = ({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
  ref?: React.Ref<React.ElementRef<typeof CheckboxPrimitive.Root>>;
}) => (
  <CheckboxPrimitive.Root
    className={cn(
      "sk-ui-peer sk-ui-h-4 sk-ui-w-4 sk-ui-shrink-0 sk-ui-rounded sk-ui-border sk-ui-border-white/20 sk-ui-bg-transparent",
      "focus-visible:sk-ui-outline-none focus-visible:sk-ui-ring-2 focus-visible:sk-ui-ring-accent focus-visible:sk-ui-ring-offset-2",
      "disabled:sk-ui-cursor-not-allowed disabled:sk-ui-opacity-50",
      "data-[state=checked]:sk-ui-bg-accent data-[state=checked]:sk-ui-border-accent data-[state=checked]:sk-ui-text-background",
      className,
    )}
    ref={ref}
    {...props}>
    <CheckboxPrimitive.Indicator
      className={cn("sk-ui-flex sk-ui-items-center sk-ui-justify-center sk-ui-text-current")}>
      <CheckIcon className="sk-ui-h-3 sk-ui-w-3" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
);

Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
