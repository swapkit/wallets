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
        settle(() => reject(error));
      },
      next: (state) => {
        try {
          onDeviceActionState?.(state);
        } catch (error) {
          void error;
        }

        match(state)
          .with({ status: DEVICE_ACTION_STATUS.Completed }, ({ output }) => settle(() => resolve(output)))
          .with({ status: DEVICE_ACTION_STATUS.Error }, ({ error }) => settle(() => reject(error)))
          .with({ status: DEVICE_ACTION_STATUS.Stopped }, () =>
            settle(() => reject(new SwapKitError("wallet_ledger_connection_error"))),
          )
          .otherwise(() => undefined);
      },
    });

    if (settled) subscription.unsubscribe();
  });
}
