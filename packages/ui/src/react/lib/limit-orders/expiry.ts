export type LimitExpiry =
  | { kind: "preset"; seconds: number }
  | { kind: "custom"; days: string; hours: string; minutes: string };

export type LimitExpiryBounds = { max: number; min: number };

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const LIMIT_EXPIRY_LATENCY_MARGIN_SECONDS = 30;

export const DEFAULT_LIMIT_EXPIRY_BOUNDS: LimitExpiryBounds = { max: 365 * DAY, min: MINUTE };

export const LIMIT_EXPIRY_PRESETS = [HOUR, DAY, 7 * DAY, 30 * DAY] as const;

export const DEFAULT_LIMIT_EXPIRY: LimitExpiry = { kind: "preset", seconds: 7 * DAY };

function plural(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

export function formatExpiryDuration(seconds: number) {
  const days = Math.floor(seconds / DAY);
  const hours = Math.floor((seconds % DAY) / HOUR);
  const minutes = Math.floor((seconds % HOUR) / MINUTE);
  const parts = [
    days > 0 ? plural(days, "day") : null,
    hours > 0 ? plural(hours, "hour") : null,
    minutes > 0 ? `${minutes} min` : null,
  ].filter(Boolean);
  return parts.length ? parts.slice(0, 2).join(" ") : `${seconds} sec`;
}

export function formatExpiryBounds({ max, min }: LimitExpiryBounds) {
  return `${formatExpiryDuration(min)} – ${formatExpiryDuration(max)}`;
}

export function getExpiryBounds(route: { maxExpirationSeconds: number; minExpirationSeconds: number } | null) {
  if (!route || route.minExpirationSeconds <= 0 || route.maxExpirationSeconds < route.minExpirationSeconds) {
    return DEFAULT_LIMIT_EXPIRY_BOUNDS;
  }
  return { max: route.maxExpirationSeconds, min: route.minExpirationSeconds };
}

export function getVisibleExpiryPresets(bounds: LimitExpiryBounds) {
  return LIMIT_EXPIRY_PRESETS.filter((seconds) => seconds >= bounds.min && seconds <= bounds.max);
}

function parseWholeNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

export function splitExpirySeconds(seconds: number) {
  return {
    days: String(Math.floor(seconds / DAY)),
    hours: String(Math.floor((seconds % DAY) / HOUR)),
    minutes: String(Math.floor((seconds % HOUR) / MINUTE)),
  };
}

export function resolveLimitExpiry(expiry: LimitExpiry, bounds: LimitExpiryBounds) {
  if (expiry.kind === "preset") {
    const seconds = Math.min(Math.max(expiry.seconds, bounds.min), bounds.max);
    return { isValid: true, seconds };
  }
  const days = parseWholeNumber(expiry.days);
  const hours = parseWholeNumber(expiry.hours);
  const minutes = parseWholeNumber(expiry.minutes);
  if (days === null || hours === null || minutes === null) return { isValid: false, seconds: null };
  const seconds = days * DAY + hours * HOUR + minutes * MINUTE;
  return seconds >= bounds.min && seconds <= bounds.max ? { isValid: true, seconds } : { isValid: false, seconds };
}

export function getLimitExpiresAt({
  bounds,
  nowMs,
  seconds,
}: {
  bounds: LimitExpiryBounds;
  nowMs: number;
  seconds: number;
}) {
  const lower = Math.min(bounds.min + LIMIT_EXPIRY_LATENCY_MARGIN_SECONDS, bounds.max);
  const upper = Math.max(bounds.max - LIMIT_EXPIRY_LATENCY_MARGIN_SECONDS, lower);
  return Math.floor(nowMs / 1000) + Math.min(Math.max(seconds, lower), upper);
}

export function formatExpiryDateTime(unixSeconds: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(unixSeconds * 1000));
}

export function formatExpiryDate(unixSeconds: number) {
  return `Expires ${formatExpiryDateTime(unixSeconds)} — your local time`;
}
