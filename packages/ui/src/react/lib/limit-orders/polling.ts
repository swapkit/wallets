import { getRetryAfterMs, isRateLimited } from "../api-errors";
import { isNotFound } from "./errors";

export const MAX_POLL_INTERVAL_MS = 300_000;

export function getPollInterval({ baseMs, error }: { baseMs: number; error: unknown }) {
  if (!error) return baseMs;
  if (isNotFound(error)) return false;
  const backoff = baseMs * 2;
  const delay = isRateLimited(error) ? Math.max(getRetryAfterMs(error) ?? 0, backoff) : backoff;
  return Math.min(delay, Math.max(MAX_POLL_INTERVAL_MS, baseMs));
}
