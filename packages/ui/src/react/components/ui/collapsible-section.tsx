"use client";

import { ChevronDownIcon } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { cn } from "../../../lib/utils";
import { Button } from "./button";

type CollapsibleSectionProps = {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function CollapsibleSection({ title, defaultOpen = false, children, className }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn("sk-ui-rounded-lg sk-ui-border sk-ui-border-border", className)}>
      <Button
        className="sk-ui-h-auto sk-ui-min-h-10 sk-ui-w-full sk-ui-justify-between sk-ui-gap-3 sk-ui-rounded-b-none sk-ui-px-4 sk-ui-py-3"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        variant="ghost">
        <span className="sk-ui-min-w-0 sk-ui-flex-1 sk-ui-text-left sk-ui-font-medium">{title}</span>

        <ChevronDownIcon
          className={cn("sk-ui-size-4 sk-ui-transition-transform sk-ui-duration-200", isOpen && "sk-ui-rotate-180")}
        />
      </Button>

      {isOpen && <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-4 sk-ui-p-4">{children}</div>}
    </div>
  );
}
