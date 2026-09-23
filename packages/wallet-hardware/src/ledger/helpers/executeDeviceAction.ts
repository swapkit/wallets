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

type DeviceErrorLike = {
  _tag?: unknown;
  errorCode?: unknown;
  message?: unknown;
  originalError?: { message?: unknown; statusCode?: unknown };
};

function statusWordOf(error: DeviceErrorLike) {
  if (typeof error.errorCode === "string") return error.errorCode.toLowerCase();
  const statusCode = error.originalError?.statusCode;
  return typeof statusCode === "number" ? statusCode.toString(16).padStart(4, "0") : undefined;
}

/**
 * DMK rejects with plain tagged objects (and the LedgerJS bridge nests hw-app status errors inside
 * them), so callers could not tell a user rejection from a wrong app or a disconnected device.
 */
export function toLedgerDeviceError(error: unknown) {
  if (error instanceof SwapKitError) return error;

  const deviceError: DeviceErrorLike = typeof error === "object" && error !== null ? error : {};
  const errorTag = typeof deviceError._tag === "string" ? deviceError._tag : undefined;
  const statusWord = statusWordOf(deviceError);
  const message = [deviceError.message, deviceError.originalError?.message].find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  const errorKey = match({ errorTag, statusWord })
    .when(
      ({ errorTag, statusWord }) =>
        errorTag === "RefusedByUserDAError" || (!!statusWord && USER_REFUSED_STATUS_WORDS.has(statusWord)),
      () => "wallet_connection_rejected_by_user" as const,
    )
    .when(
      ({ errorTag, statusWord }) =>
        errorTag === "DeviceLockedError" || (!!statusWord && LOCKED_STATUS_WORDS.has(statusWord)),
      () => "wallet_ledger_device_locked" as const,
    )
    .when(
      ({ errorTag, statusWord }) =>
        errorTag === "UnsupportedApplicationDAError" || (!!statusWord && WRONG_APP_STATUS_WORDS.has(statusWord)),
      () => "wallet_ledger_app_not_open" as const,
    )
    .when(
      ({ errorTag }) => !!errorTag && DISCONNECTED_ERROR_TAGS.has(errorTag),
      () => "wallet_ledger_connection_error" as const,
    )
    .otherwise(() => "wallet_ledger_transport_error" as const);

  return new SwapKitError({ errorKey, info: { errorTag, message, statusWord } }, error);
}

export function executeLedgerDeviceAction<
  Output,
  ActionError,
  IntermediateValue extends DeviceActionIntermediateValue,
>({
  action,
  onDeviceActionState,
}: {
  action: ExecuteDeviceActionReturnType<Output, ActionError, IntermediateValue>;
  onDeviceActionState?: LedgerDeviceActionStateHandler;
}) {
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
        settle(() => reject(toLedgerDeviceError(error)));
      },
      next: (state) => {
        try {
          onDeviceActionState?.(state);
        } catch (error) {
          void error;
        }

        match(state)
          .with({ status: DEVICE_ACTION_STATUS.Completed }, ({ output }) => settle(() => resolve(output)))
          .with({ status: DEVICE_ACTION_STATUS.Error }, ({ error }) => settle(() => reject(toLedgerDeviceError(error))))
          .with({ status: DEVICE_ACTION_STATUS.Stopped }, () =>
            settle(() => reject(new SwapKitError("wallet_ledger_connection_error"))),
          )
          .otherwise(() => undefined);
      },
    });

    if (settled) subscription.unsubscribe();
  });
}
