"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../../lib/utils";

const tabsTriggerVariants = cva(
  "sk-ui-inline-flex sk-ui-items-center sk-ui-justify-center sk-ui-whitespace-nowrap sk-ui-rounded-sm sk-ui-px-3 sk-ui-py-1.5 sk-ui-font-medium sk-ui-text-sm sk-ui-ring-offset-background sk-ui-transition-all focus-visible:sk-ui-outline-none focus-visible:sk-ui-ring-2 focus-visible:sk-ui-ring-ring focus-visible:sk-ui-ring-offset-2 disabled:sk-ui-pointer-events-none disabled:sk-ui-opacity-50 sk-ui-w-full",
  {
    defaultVariants: { variant: "default" },
    variants: {
      variant: {
        default:
          "sk-ui-bg-white/[0.16] sk-ui-h-full data-[state=active]:sk-ui-white/[0.24] data-[state=active]:sk-ui-text-foreground sk-ui-text-muted-foreground",
        stepper: "!sk-ui-h-1 sk-ui-flex-auto sk-ui-bg-white/[0.16] !sk-ui-p-0 data-[state=active]:sk-ui-bg-accent",
      },
    },
  },
);

export const Tabs = TabsPrimitive.Root;

export const TabsList = ({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  ref?: React.Ref<React.ComponentRef<typeof TabsPrimitive.List>>;
}) => (
  <TabsPrimitive.List
    className={cn(
      "sk-ui-inline-flex sk-ui-h-8 sk-ui-items-center sk-ui-justify-center sk-ui-gap-0.5 sk-ui-rounded-md sk-ui-px-0.5 sk-ui-text-white/[0.92]",
      className,
    )}
    ref={ref}
    {...props}
  />
);
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = ({
  className,
  variant,
  ref,
  ...props
}: (React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & VariantProps<typeof tabsTriggerVariants>) & {
  ref?: React.Ref<React.ComponentRef<typeof TabsPrimitive.Trigger>>;
}) => <TabsPrimitive.Trigger className={cn(tabsTriggerVariants({ variant }), className)} ref={ref} {...props} />;
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = ({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> & {
  ref?: React.Ref<React.ComponentRef<typeof TabsPrimitive.Content>>;
}) => (
  // - `data-[state=inactive]:sk-ui-hidden` keeps inactive panels from claiming layout
  //   space when consumers override the default `hidden` styling with `display:flex`.
  // - `sk-ui-min-h-0` lets the panel honour `flex-1` inside a `flex-col` parent so an
  //   inner `overflow-y-auto` actually scrolls instead of growing to content height.
  <TabsPrimitive.Content
    className={cn(
      "sk-ui-min-h-0 sk-ui-ring-offset-background focus-visible:sk-ui-ring-2 focus-visible:sk-ui-ring-ring focus-visible:sk-ui-outline-none focus-visible:sk-ui-ring-offset-2 data-[state=inactive]:sk-ui-hidden",
      className,
    )}
    ref={ref}
    {...props}
  />
);
TabsContent.displayName = TabsPrimitive.Content.displayName;
