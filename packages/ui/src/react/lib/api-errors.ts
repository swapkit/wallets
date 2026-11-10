type ErrorLike = {
  errorKey?: unknown;
  cause?: { status?: unknown; data?: { retryAfter?: unknown } };
  info?: { status?: unknown; data?: { retryAfter?: unknown } };
};

function asErrorLike(error: unknown) {
  return error && typeof error === "object" ? (error as ErrorLike) : null;
}

export function getErrorKey(error: unknown) {
  const key = asErrorLike(error)?.errorKey;
  return typeof key === "string" ? key : undefined;
}

export function getErrorStatus(error: unknown) {
  const target = asErrorLike(error);
  const status = target?.cause?.status ?? target?.info?.status;
  return typeof status === "number" ? status : undefined;
}

export function isRateLimited(error: unknown) {
  return getErrorStatus(error) === 429 || getErrorKey(error) === "rateLimitExceeded";
}

export function getRetryAfterMs(error: unknown) {
  const target = asErrorLike(error);
  const raw = target?.cause?.data?.retryAfter ?? target?.info?.data?.retryAfter;
  const seconds = typeof raw === "string" ? Number(raw) : raw;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
