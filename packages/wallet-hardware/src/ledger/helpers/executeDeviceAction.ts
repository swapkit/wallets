import type {
  DeviceActionIntermediateValue,
  DeviceActionState,
  ExecuteDeviceActionReturnType,
} from "@ledgerhq/device-management-kit";
import { SwapKitError } from "@swapkit/helpers";

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

        if (state.status === "completed") {
          settle(() => resolve(state.output));
        } else if (state.status === "error") {
          settle(() => reject(state.error));
        } else if (state.status === "stopped") {
          settle(() => reject(new SwapKitError("wallet_ledger_connection_error")));
        }
      },
    });

    if (settled) subscription.unsubscribe();
  });
}
