"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import type * as React from "react";
import type { ComponentPropsWithoutRef, ComponentRef } from "react";
import { cn } from "../../../lib/utils";

const Accordion: React.FC<ComponentPropsWithoutRef<typeof AccordionPrimitive.Root>> = AccordionPrimitive.Root;

const AccordionItem = ({
  className,
  ref,
  ...props
}: ComponentPropsWithoutRef<typeof AccordionPrimitive.Item> & {
  ref?: React.Ref<ComponentRef<typeof AccordionPrimitive.Item>>;
}) => <AccordionPrimitive.Item className={cn("", className)} ref={ref} {...props} />;
AccordionItem.displayName = "AccordionItem";

const AccordionTrigger = ({
  className,
  children,
  showChevron = true,
  ref,
  ...props
}: (ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & { showChevron?: boolean }) & {
  ref?: React.Ref<ComponentRef<typeof AccordionPrimitive.Trigger>>;
}) => (
  <AccordionPrimitive.Header className="sk-ui-flex">
    <AccordionPrimitive.Trigger
      className={cn(
        "sk-ui-flex sk-ui-flex-1 sk-ui-items-center sk-ui-justify-between sk-ui-py-4 sk-ui-font-medium sk-ui-transition-all hover:sk-ui-underline [&[data-state=open]>svg]:sk-ui-rotate-180",
        className,
      )}
      ref={ref}
      {...props}>
      {children}
      {showChevron && (
        <ChevronDown className="sk-ui-h-4 sk-ui-w-4 sk-ui-shrink-0 sk-ui-transition-transform sk-ui-duration-200" />
      )}
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
);
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = ({
  className,
  children,
  ref,
  ...props
}: ComponentPropsWithoutRef<typeof AccordionPrimitive.Content> & {
  ref?: React.Ref<ComponentRef<typeof AccordionPrimitive.Content>>;
}) => (
  <AccordionPrimitive.Content
    className="sk-ui-overflow-hidden sk-ui-text-sm sk-ui-transition-all data-[state=closed]:sk-ui-animate-accordion-up data-[state=open]:sk-ui-animate-accordion-down"
    ref={ref}
    {...props}>
    <div className={cn("sk-ui-pt-0 sk-ui-pb-4", className)}>{children}</div>
  </AccordionPrimitive.Content>
);

AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
