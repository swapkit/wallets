/** Tolerance in effect when nothing has been picked, in percent. */
export const DEFAULT_SLIPPAGE_PERCENT = 1;

/** Presets offered next to the custom input, in percent. */
export const SLIPPAGE_PRESETS_PERCENT = [0.25, 1] as const;

/** Tightest tolerance accepted from the custom input, in percent. */
export const MIN_SLIPPAGE_PERCENT = 0.25;

/** Widest tolerance accepted from the custom input, in percent. */
export const MAX_SLIPPAGE_PERCENT = 50;

/** Round to the 0.01% granularity the input accepts, without float noise. */
function roundPercent(percent: number): number {
  return Number(percent.toFixed(2));
}

/** Display form of a tolerance, without float noise. */
export function formatSlippagePercent(percent: number): string {
  return `${roundPercent(percent)}%`;
}

/**
 * Evaluate the custom input as the user types. Digits typed on the way to a
 * real value ("", "0", "0.") are `incomplete` rather than `invalid` so the
 * field doesn't flash an error at every keystroke; only `valid` commits.
 */
export function evaluateSlippageInput(
  raw: string,
): { status: "incomplete" } | { status: "invalid"; error: string } | { status: "valid"; percent: number } {
  const trimmed = raw.trim();

  if (!trimmed) return { status: "incomplete" };

  if (!/^\d*\.?\d*$/.test(trimmed)) return { error: "Enter a percentage, e.g. 0.5", status: "invalid" };

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return { error: "Enter a percentage, e.g. 0.5", status: "invalid" };

  // A bare "0" / "0." / "0.00" is a prefix of every sub-1% tolerance.
  if (parsed === 0) return { status: "incomplete" };

  const rounded = roundPercent(parsed);
  if (rounded < MIN_SLIPPAGE_PERCENT) return { error: `Minimum is ${MIN_SLIPPAGE_PERCENT}%`, status: "invalid" };
  if (rounded > MAX_SLIPPAGE_PERCENT) return { error: `Maximum is ${MAX_SLIPPAGE_PERCENT}%`, status: "invalid" };

  return { percent: rounded, status: "valid" };
}
