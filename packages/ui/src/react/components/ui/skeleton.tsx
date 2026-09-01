"use client";

import { cn } from "../../../lib/utils";

export function Skeleton({
  className,
  isLoading,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { isLoading?: boolean }) {
  if (!isLoading) return children;

  return (
    <div className={cn("sk-ui-animate-pulse sk-ui-rounded-sm sk-ui-bg-secondary", className)} {...props}>
      <div className="sk-ui-invisible">{children}</div>
    </div>
  );
}
