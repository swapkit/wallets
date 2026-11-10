import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMergeWithPrefix = extendTailwindMerge({ prefix: "sk-ui-" });

export function cn(...inputs: ClassValue[]) {
  return twMergeWithPrefix(clsx(...inputs));
}

export function formatCurrency(amount: number | null) {
  return Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(amount ?? 0);
}

type FormatTokenAmountOptions = { maximumSignificantDigits?: number };

/**
 * Format token amounts with appropriate precision based on value magnitude.
 * - Large amounts (>= 1000): no decimals
 * - Medium amounts (>= 1): up to 4 decimals
 * - Small amounts (>= 0.0001): up to 6 decimals
 * - Very small amounts: up to 8 decimals
 */
export function formatTokenAmount(
  amount: number | string | null | undefined,
  options?: FormatTokenAmountOptions,
): string {
  if (amount === null || amount === undefined) return "0";

  const num = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (Number.isNaN(num)) return "0";

  const absNum = Math.abs(num);

  if (absNum === 0) return "0";

  if (options?.maximumSignificantDigits) {
    return num.toLocaleString("en-US", { maximumSignificantDigits: options.maximumSignificantDigits });
  }

  if (absNum >= 1000) return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (absNum >= 1) return num.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (absNum >= 0.0001) return num.toLocaleString("en-US", { maximumFractionDigits: 6 });

  return num.toLocaleString("en-US", { maximumFractionDigits: 8 });
}
