"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../../lib/utils";

const labelVariants = cva(
  "sk-ui-text-sm sk-ui-font-medium sk-ui-leading-none peer-disabled:sk-ui-cursor-not-allowed peer-disabled:sk-ui-opacity-70",
);

const Label = ({
  className,
  ref,
  ...props
}: (React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>) & {
  ref?: React.Ref<React.ElementRef<typeof LabelPrimitive.Root>>;
}) => <LabelPrimitive.Root className={cn(labelVariants(), className)} ref={ref} {...props} />;
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
