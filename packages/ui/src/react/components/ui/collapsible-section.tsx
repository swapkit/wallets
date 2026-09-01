"use client";

import { ChevronDownIcon } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { cn } from "../../../lib/utils";
import { Button } from "./button";

type CollapsibleSectionProps = { title: string; defaultOpen?: boolean; children: React.ReactNode; className?: string };

export function CollapsibleSection({ title, defaultOpen = false, children, className }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn("sk-ui-rounded-lg sk-ui-border sk-ui-border-border", className)}>
      <Button
        className="sk-ui-w-full sk-ui-justify-between sk-ui-rounded-b-none sk-ui-px-4 sk-ui-py-3 hover:sk-ui-bg-white/[0.04]"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        variant="ghost">
        <span className="sk-ui-font-medium">{title}</span>

        <ChevronDownIcon
          className={cn("sk-ui-size-4 sk-ui-transition-transform sk-ui-duration-200", isOpen && "sk-ui-rotate-180")}
        />
      </Button>

      {isOpen && <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-4 sk-ui-p-4">{children}</div>}
    </div>
  );
}
