import type {
  DeviceActionIntermediateValue,
  DeviceActionState,
  DeviceActionStatus,
  ExecuteDeviceActionReturnType,
  UserInteractionRequired,
} from "@ledgerhq/device-management-kit";
import { SwapKitError } from "@swapkit/helpers";
import { match } from "ts-pattern";

const DEVICE_ACTION_STATUS = {
  Completed: "completed" as DeviceActionStatus.Completed,
  Error: "error" as DeviceActionStatus.Error,
  Stopped: "stopped" as DeviceActionStatus.Stopped,
} as const;

export const LEDGER_USER_INTERACTION_REQUIRED = {
  None: "none" as UserInteractionRequired.None,
  SignTransaction: "sign-transaction" as UserInteractionRequired.SignTransaction,
  VerifyAddress: "verify-address" as UserInteractionRequired.VerifyAddress,
} as const;

export type LedgerDeviceActionState = DeviceActionState<unknown, unknown, DeviceActionIntermediateValue>;
export type LedgerDeviceActionStateHandler = (state: LedgerDeviceActionState) => void;

const USER_REFUSED_STATUS_WORDS = new Set(["6985", "5501"]);
/**
 * Zondax-built apps (Cosmos, THORChain) reject a request on the device with COMMAND_NOT_ALLOWED. The Zcash app uses
 * the same word to refuse a request, so only the clients for the Zondax apps treat it as a user rejection.
 */
export const ZONDAX_USER_REFUSED_STATUS_WORDS: readonly string[] = ["6986"];
const LOCKED_STATUS_WORDS = new Set(["5515"]);
const WRONG_APP_STATUS_WORDS = new Set(["6511", "6807", "6d00", "6e00"]);
const DISCONNECTED_ERROR_TAGS = new Set([
  "DeviceDisconnectedBeforeSendingApdu",
  "DeviceDisconnectedWhileSendingError",
  "DeviceNotRecognizedError",
  "DeviceSessionNotFound",
  "NoAccessibleDeviceError",
  "ReconnectionFailedError",
]);
// DMK nests causes in `originalError` and the LedgerJS bridge wraps once more, so real chains are two or three
// levels deep; the bound stops a malformed or cyclic chain.
const MAX_NESTED_ERROR_DEPTH = 4;
const STATUS_WORD_PATTERN = /^(?:0x)?([0-9a-f]{4})$/i;

type DeviceErrorLike = {
  _tag?: unknown;
  errorCode?: unknown;
  message?: unknown;
  originalError?: unknown;
  statusCode?: unknown;
};

export interface LedgerDeviceErrorOptions {
  /** App-specific status words that also mean the user rejected the request on the device. */
  userRefusedStatusWords?: readonly string[];
}

function errorChainOf(error: unknown) {
  const errors: DeviceErrorLike[] = [];
  let current = error;

  while (errors.length < MAX_NESTED_ERROR_DEPTH && typeof current === "object" && current !== null) {
    const deviceError: DeviceErrorLike = current;
    errors.push(deviceError);
    current = deviceError.originalError;
  }

  return errors;
}

// DMK command errors carry the word as an `errorCode` string (the Cosmos signer kit keys its own table "0x6986");
// hw-transport status errors carry it as a numeric `statusCode`.
function statusWordOf({ errorCode, statusCode }: DeviceErrorLike) {
  const fromErrorCode = typeof errorCode === "string" ? STATUS_WORD_PATTERN.exec(errorCode)?.[1] : undefined;
  if (fromErrorCode) return fromErrorCode.toLowerCase();
  return typeof statusCode === "number" ? statusCode.toString(16).padStart(4, "0") : undefined;
}

/**
 * DMK rejects with plain tagged objects (and the LedgerJS bridge nests hw-app status errors inside
 * them), so callers could not tell a user rejection from a wrong app or a disconnected device.
 */
export function toLedgerDeviceError(error: unknown, { userRefusedStatusWords = [] }: LedgerDeviceErrorOptions = {}) {
  const errorChain = errorChainOf(error);
  // A SwapKitError thrown inside a bridged LedgerJS operation (input validation) already says what failed.
  const swapKitError = errorChain.find((nested): nested is SwapKitError => nested instanceof SwapKitError);
  if (swapKitError) return swapKitError;

  const errorTags = errorChain.flatMap(({ _tag }) => (typeof _tag === "string" ? [_tag] : []));
  const statusWord = errorChain.map(statusWordOf).find((word) => word !== undefined);
  // The innermost cause says what failed; DMK and the bridge wrap it in generic "device exchange" messages.
  const message = errorChain
    .map((nested) => nested.message)
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .at(-1);
  const refusedStatusWords = new Set([...USER_REFUSED_STATUS_WORDS, ...userRefusedStatusWords]);

  const errorKey = match({ errorTags, statusWord })
    .when(
      ({ errorTags, statusWord }) =>
        errorTags.includes("RefusedByUserDAError") || (!!statusWord && refusedStatusWords.has(statusWord)),
      () => "wallet_connection_rejected_by_user" as const,
    )
    .when(
      ({ errorTags, statusWord }) =>
        errorTags.includes("DeviceLockedError") || (!!statusWord && LOCKED_STATUS_WORDS.has(statusWord)),
      () => "wallet_ledger_device_locked" as const,
    )
    .when(
      ({ errorTags, statusWord }) =>
        errorTags.includes("UnsupportedApplicationDAError") || (!!statusWord && WRONG_APP_STATUS_WORDS.has(statusWord)),
      () => "wallet_ledger_app_not_open" as const,
    )
    .when(
      ({ errorTags }) => errorTags.some((errorTag) => DISCONNECTED_ERROR_TAGS.has(errorTag)),
      () => "wallet_ledger_connection_error" as const,
    )
    .otherwise(() => "wallet_ledger_transport_error" as const);

  return new SwapKitError({ errorKey, info: { errorTag: errorTags[0], message, statusWord } }, error);
}

export function executeLedgerDeviceAction<
  Output,
  ActionError,
  IntermediateValue extends DeviceActionIntermediateValue,
>({
  action,
  onDeviceActionState,
  userRefusedStatusWords,
}: {
  action: ExecuteDeviceActionReturnType<Output, ActionError, IntermediateValue>;
  onDeviceActionState?: LedgerDeviceActionStateHandler;
} & LedgerDeviceErrorOptions) {
  return new Promise<Output>((resolve, reject) => {
    let settled = false;
    let subscription: { unsubscribe: () => void } | undefined;

    function settle(callback: () => void) {
      if (settled) return;
      settled = true;
      subscription?.unsubscribe();
      callback();
    }

    subscription = action.observable.subscribe({
      complete: () => {
        settle(() => reject(new SwapKitError("wallet_ledger_invalid_response")));
      },
      error: (error) => {
        settle(() => reject(toLedgerDeviceError(error, { userRefusedStatusWords })));
      },
      next: (state) => {
        try {
          onDeviceActionState?.(state);
        } catch (error) {
          void error;
        }

        match(state)
          .with({ status: DEVICE_ACTION_STATUS.Completed }, ({ output }) => settle(() => resolve(output)))
          .with({ status: DEVICE_ACTION_STATUS.Error }, ({ error }) =>
            settle(() => reject(toLedgerDeviceError(error, { userRefusedStatusWords }))),
          )
          .with({ status: DEVICE_ACTION_STATUS.Stopped }, () =>
            settle(() => reject(new SwapKitError("wallet_ledger_connection_error"))),
          )
          .otherwise(() => undefined);
      },
    });

    if (settled) subscription.unsubscribe();
  });
}
