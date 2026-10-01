import type { UnknownDeviceExchangeError, UserInteractionRequired } from "@ledgerhq/device-management-kit";
import type Transport from "@ledgerhq/hw-transport";
import { type DerivationPathArray, SwapKitError } from "@swapkit/helpers";

import { getLedgerDMKSession, type LedgerDMKSession } from "./dmk";
import {
  executeLedgerDeviceAction,
  LEDGER_USER_INTERACTION_REQUIRED,
  type LedgerDeviceActionStateHandler,
} from "./executeDeviceAction";

export { LEDGER_USER_INTERACTION_REQUIRED };

export interface LedgerJsClientConnection {
  dmkSession?: LedgerDMKSession;
  onDeviceActionState?: LedgerDeviceActionStateHandler;
  transport?: Transport;
}

export interface LedgerJsClientParams<Path extends DerivationPathArray | string = DerivationPathArray | string>
  extends LedgerJsClientConnection {
  derivationPath?: Path;
}

// `Array.isArray` does not narrow the readonly `DerivationPathArray` tuples out of the union.
function isLedgerJsClientParams<Path extends DerivationPathArray | string>(
  value: LedgerJsClientParams<Path> | Path | undefined,
): value is LedgerJsClientParams<Path> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeLedgerJsClientParams<Path extends DerivationPathArray | string>({
  paramsOrPath,
  transport,
}: {
  paramsOrPath?: LedgerJsClientParams<Path> | Path;
  transport?: Transport;
}): LedgerJsClientParams<Path> {
  if (isLedgerJsClientParams(paramsOrPath)) return paramsOrPath;
  return { derivationPath: paramsOrPath as Path | undefined, transport };
}

export async function runLedgerJsOperation<App, Output>({
  appName,
  connection,
  createApp,
  operation,
  requiredUserInteraction = LEDGER_USER_INTERACTION_REQUIRED.None,
}: {
  appName: string;
  connection: LedgerJsClientConnection;
  createApp: (transport: Transport) => App;
  operation: (app: App) => Promise<Output> | Output;
  requiredUserInteraction?: UserInteractionRequired;
}) {
  const { dmkSession, onDeviceActionState, transport } = connection;

  if (dmkSession && transport) {
    throw new SwapKitError("wallet_ledger_invalid_params", {
      message: "Provide either a Ledger DMK session or a LedgerJS transport, not both",
    });
  }

  if (transport) return operation(createApp(transport));

  const session = dmkSession ?? (await getLedgerDMKSession());

  // Loaded before the action is built, so a chunk that fails to load rejects before the app opens. The bridge
  // transport stays lazy because its hw-transport base class does not load under Node ESM (see its module).
  const [{ CallTaskInAppDeviceAction, DmkResultFactory, UnknownDeviceExchangeError }, { LedgerJsDmkTransport }] =
    await Promise.all([import("@ledgerhq/device-management-kit"), import("./ledgerJsDmkTransport")]);

  const deviceAction = new CallTaskInAppDeviceAction<
    { output: Output },
    UnknownDeviceExchangeError,
    UserInteractionRequired
  >({
    input: {
      appName,
      requiredUserInteraction,
      skipOpenApp: false,
      task: async (internalApi) => {
        try {
          const output = await operation(createApp(new LedgerJsDmkTransport(internalApi)));
          return DmkResultFactory<{ output: Output }, UnknownDeviceExchangeError>({ data: { output } });
        } catch (error) {
          return DmkResultFactory<{ output: Output }, UnknownDeviceExchangeError>({
            error: new UnknownDeviceExchangeError(error),
          });
        }
      },
    },
  });

  const result = await executeLedgerDeviceAction({
    action: session.dmk.executeDeviceAction({ deviceAction, sessionId: session.sessionId }),
    onDeviceActionState,
  });

  return result.output;
}
