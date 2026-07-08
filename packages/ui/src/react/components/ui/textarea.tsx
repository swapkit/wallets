"use client";

import type * as React from "react";

import { cn } from "../../../lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = ({ className, ref, ...props }: TextareaProps & { ref?: React.Ref<HTMLTextAreaElement> }) => {
  return (
    <textarea
      className={cn(
        "sk-ui-flex sk-ui-min-h-20 sk-ui-w-full sk-ui-rounded-md sk-ui-border sk-ui-border-input sk-ui-bg-background sk-ui-px-3 sk-ui-py-2 sk-ui-text-sm sk-ui-ring-offset-background placeholder:sk-ui-text-muted-foreground disabled:sk-ui-cursor-not-allowed disabled:sk-ui-opacity-50 focus-visible:sk-ui-ring-2 focus-visible:sk-ui-ring-ring focus-visible:sk-ui-ring-offset-2 focus-visible:sk-ui-outline-none",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
};
Textarea.displayName = "Textarea";

export { Textarea };
