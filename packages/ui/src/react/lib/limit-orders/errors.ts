import { isUserRejectedRequest } from "@swapkit/helpers";
import { getErrorKey, getErrorStatus } from "../api-errors";
import { getErrorMessage } from "../error-message";

const NETWORK_SWITCH_ERROR_KEY = "helpers_failed_to_switch_network";

export const LIMIT_BUILD_ERROR_KEYS = {
  buildFailed: "limitOrderBuildFailed",
  makerBlacklisted: "limitOrderMakerBlacklisted",
  providerError: "limitOrderProviderError",
  quoteNotFound: "limitOrderQuoteNotFound",
} as const;

export const LIMIT_SIGN_ERROR_KEYS = {
  invalidBuild: "plugin_swapkit_limit_order_invalid_build",
  unsupportedSignShape: "plugin_swapkit_limit_order_unsupported_sign_shape",
  walletCannotSign: "plugin_swapkit_limit_order_wallet_cannot_sign",
} as const;

export const LIMIT_SUBMIT_ERROR_KEYS = {
  insufficientAllowance: "limitOrderInsufficientAllowance",
  maxOrdersExceeded: "limitOrderMaxOrdersExceeded",
} as const;

export function getLimitErrorKey(error: unknown) {
  return getErrorKey(error) ?? "unknown";
}

export function getLimitErrorMessage(error: unknown) {
  const message = (error as { info?: { message?: unknown } } | null)?.info?.message;
  return typeof message === "string" && message ? message : getErrorMessage(error);
}

export function isLimitUserRejection(error: unknown) {
  if (isUserRejectedRequest(error)) return true;
  if (getLimitErrorKey(error) !== NETWORK_SWITCH_ERROR_KEY) return false;
  const cause = (error as { cause?: { error?: unknown; reason?: unknown } }).cause;
  return (
    (typeof cause?.reason === "string" && cause.reason.startsWith("user rejected")) ||
    isUserRejectedRequest(cause?.error)
  );
}

export function isInvalidState(error: unknown) {
  return getErrorKey(error) === "limitOrderInvalidState" || getErrorStatus(error) === 409;
}

export function isActionUnavailable(error: unknown) {
  return getErrorKey(error) === "limitOrderActionUnavailable" || getErrorStatus(error) === 503;
}

export function isNotFound(error: unknown) {
  return getErrorKey(error) === "limitOrderNotFound" || getErrorStatus(error) === 404;
}
