import {
  type DeviceActionIntermediateValue,
  type DeviceActionState,
  DeviceActionStatus,
  type ExecuteDeviceActionReturnType,
} from "@ledgerhq/device-management-kit";
import { SwapKitError } from "@swapkit/helpers";
import { match } from "ts-pattern";

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
          .with({ status: DeviceActionStatus.Completed }, ({ output }) => settle(() => resolve(output)))
          .with({ status: DeviceActionStatus.Error }, ({ error }) => settle(() => reject(error)))
          .with({ status: DeviceActionStatus.Stopped }, () =>
            settle(() => reject(new SwapKitError("wallet_ledger_connection_error"))),
          )
          .otherwise(() => undefined);
      },
    });

    if (settled) subscription.unsubscribe();
  });
}
