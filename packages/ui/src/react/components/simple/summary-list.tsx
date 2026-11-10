import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

export type SummaryListItem = { title: string; value: ReactNode };

export function SummaryList({ className, items }: { className?: string; items: SummaryListItem[] }) {
  return (
    <ul className={cn("sk-ui-flex sk-ui-flex-col sk-ui-gap-3", className)}>
      {items.map((item) => (
        <li className="sk-ui-flex sk-ui-items-start sk-ui-justify-between sk-ui-gap-1" key={item.title}>
          <span className="sk-ui-text-muted-foreground">{item.title}</span>
          <span className="sk-ui-max-w-[60%] sk-ui-break-words sk-ui-text-right sk-ui-font-medium">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
