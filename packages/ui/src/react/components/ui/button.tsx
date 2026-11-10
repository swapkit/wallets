"use client";

import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2Icon } from "lucide-react";
import type * as React from "react";
import { cn } from "../../../lib/utils";

const buttonVariants = cva(
  "sk-ui-inline-flex sk-ui-items-center sk-ui-justify-center sk-ui-whitespace-nowrap sk-ui-rounded-md sk-ui-text-sm sk-ui-font-medium sk-ui-ring-offset-background sk-ui-transition-colors focus-visible:sk-ui-outline-none focus-visible:sk-ui-ring-2 focus-visible:sk-ui-ring-ring focus-visible:sk-ui-ring-offset-0 disabled:sk-ui-pointer-events-none disabled:sk-ui-opacity-50 sk-ui-cursor-pointer",
  {
    defaultVariants: { size: "default", variant: "default" },
    variants: {
      // biome-ignore assist/source/useSortedKeys: sort by size, not alphabetically
      size: {
        xs: "sk-ui-h-7 sk-ui-text-sm sk-ui-rounded-md sk-ui-px-2 sk-ui-gap-1.5",
        sm: "sk-ui-h-9 sk-ui-rounded-md sk-ui-px-3 sk-ui-gap-1.5",
        default: "sk-ui-h-10 sk-ui-px-4 sk-ui-py-2 sk-ui-gap-2",
        lg: "sk-ui-h-12 sk-ui-font-medium sk-ui-text-base sk-ui-rounded-lg sk-ui-px-4",
        xl: "sk-ui-h-11 sk-ui-font-medium sk-ui-text-base sk-ui-rounded-xl sk-ui-px-8",
        icon: "sk-ui-size-10",
        unstyled: "sk-ui-p-0 sk-ui-m-0 sk-ui-h-auto sk-ui-w-auto",
      },
      // biome-ignore assist/source/useSortedKeys: sort by role, not alphabetically
      variant: {
        default: "sk-ui-bg-secondary sk-ui-text-muted-foreground hover:sk-ui-bg-bg-hover active:sk-ui-bg-bg-active",
        ghost: "hover:sk-ui-bg-bg-hover sk-ui-bg-transparent hover:sk-ui-text-foreground sk-ui-text-muted-foreground",
        link: "sk-ui-text-primary-foreground sk-ui-underline-offset-4 hover:sk-ui-underline sk-ui-p-0 sk-ui-h-auto sk-ui-w-auto sk-ui-display-inline",
        outline:
          "sk-ui-border sk-ui-border-input sk-ui-bg-background hover:sk-ui-bg-accent hover:sk-ui-text-accent-foreground",

        primary:
          "sk-ui-bg-primary-button sk-ui-text-primary-button-foreground hover:sk-ui-opacity-80 sk-ui-transition-opacity",
        secondary: "sk-ui-bg-secondary sk-ui-text-secondary-foreground hover:sk-ui-opacity-80 sk-ui-transition-opacity",
        tertiary: "sk-ui-bg-tertiary sk-ui-text-tertiary-foreground hover:sk-ui-opacity-80 sk-ui-transition-opacity",

        destructive: "sk-ui-bg-destructive sk-ui-text-destructive-foreground hover:sk-ui-bg-destructive/90",
        unstyled: "sk-ui-p-0 sk-ui-m-0 sk-ui-h-auto sk-ui-w-auto",
      },
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
}

const Button = ({
  className,
  variant,
  size,
  isLoading,
  asChild = false,
  disabled,
  children,
  ref,
  ...props
}: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) => {
  const Comp = asChild ? Slot : "button";
  // While a button is loading it must also be unclickable — otherwise mobile
  // double-taps reach the click handler twice and any in-flight provider call
  // (e.g. MetaMask's eth_requestAccounts) errors with -32002 "already processing".
  const isDisabled = disabled || isLoading;
  return (
    <Comp
      className={cn(buttonVariants({ size, variant }), className)}
      ref={ref}
      {...(asChild ? {} : { disabled: isDisabled })}
      aria-busy={isLoading || undefined}
      {...props}>
      {isLoading ? (
        <div className="sk-ui-relative">
          <div className="sk-ui-absolute sk-ui-inset-0 sk-ui-flex sk-ui-items-center sk-ui-justify-center">
            <Loader2Icon className="sk-ui-size-5 sk-ui-animate-spin" />
          </div>

          <div className="sk-ui-invisible">
            <Slottable>{children}</Slottable>
          </div>
        </div>
      ) : (
        children
      )}
    </Comp>
  );
};
Button.displayName = "Button";

export { Button, buttonVariants };
