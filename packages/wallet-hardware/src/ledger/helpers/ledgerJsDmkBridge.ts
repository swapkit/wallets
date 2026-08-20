import {
  Apdu,
  type ApduResponse,
  CallTaskInAppDeviceAction,
  type Command,
  CommandResultFactory,
  DmkResultFactory,
  type InternalApi,
  isSuccessCommandResult,
  UnknownDeviceExchangeError,
  UserInteractionRequired,
} from "@ledgerhq/device-management-kit";
import Transport, { TransportError } from "@ledgerhq/hw-transport";
import { type DerivationPathArray, SwapKitError } from "@swapkit/helpers";

import type { LedgerDMKSession } from "./dmk";
import { executeLedgerDeviceAction, type LedgerDeviceActionStateHandler } from "./executeDeviceAction";

const STATUS_CODE_LENGTH = 2;
const TransportBase =
  typeof Transport === "function" ? Transport : (Transport as unknown as { default: typeof Transport }).default;

interface RawApduResponse {
  response: Uint8Array;
}

class RawApduCommand implements Command<RawApduResponse> {
  readonly name = "ledgerJsRawApdu";

  constructor(private readonly apdu: Apdu) {}

  getApdu() {
    return this.apdu;
  }

  parseResponse({ data, statusCode }: ApduResponse) {
    if (statusCode.length !== STATUS_CODE_LENGTH) {
      return CommandResultFactory<RawApduResponse>({
        error: new UnknownDeviceExchangeError(new Error("Ledger returned an invalid APDU status code")),
      });
    }

    const response = new Uint8Array(data.length + statusCode.length);
    response.set(data);
    response.set(statusCode, data.length);

    return CommandResultFactory<RawApduResponse>({ data: { response } });
  }
}

function parseShortApdu(apdu: Buffer) {
  if (apdu.length < 5) {
    throw new TransportError("Ledger APDU must contain a five-byte short-APDU header", "InvalidAPDU");
  }

  const dataLength = apdu[4];
  if (dataLength === undefined || apdu.length !== dataLength + 5) {
    throw new TransportError("Ledger APDU payload length does not match its short-APDU header", "InvalidAPDU");
  }

  const cla = apdu[0];
  const ins = apdu[1];
  const p1 = apdu[2];
  const p2 = apdu[3];
  if (cla === undefined || ins === undefined || p1 === undefined || p2 === undefined) {
    throw new TransportError("Ledger APDU header is incomplete", "InvalidAPDU");
  }

  return new Apdu(cla, ins, p1, p2, apdu.subarray(5));
}

export class LedgerJsDmkTransport extends TransportBase {
  constructor(private readonly internalApi: InternalApi) {
    super();
  }

  async exchange(apdu: Buffer, { abortTimeoutMs }: { abortTimeoutMs?: number } = {}) {
    const command = new RawApduCommand(parseShortApdu(apdu));
    const result = await this.internalApi.sendCommand(command, abortTimeoutMs ?? this.exchangeTimeout);

    if (!isSuccessCommandResult(result)) throw result.error;
    return Buffer.from(result.data.response);
  }

  close() {
    return Promise.resolve();
  }
}

export interface LedgerJsClientConnection {
  dmkSession?: LedgerDMKSession;
  onDeviceActionState?: LedgerDeviceActionStateHandler;
  transport?: Transport;
}

export interface LedgerJsClientParams<Path extends DerivationPathArray | string = DerivationPathArray | string>
  extends LedgerJsClientConnection {
  derivationPath?: Path;
}

export function normalizeLedgerJsClientParams<Path extends DerivationPathArray | string>({
  paramsOrPath,
  transport,
}: {
  paramsOrPath?: LedgerJsClientParams<Path> | Path;
  transport?: Transport;
}): LedgerJsClientParams<Path> {
  if (paramsOrPath && typeof paramsOrPath === "object" && !Array.isArray(paramsOrPath)) return paramsOrPath;
  return { derivationPath: paramsOrPath as Path | undefined, transport };
}

export async function runLedgerJsOperation<App, Output>({
  appName,
  connection,
  createApp,
  operation,
  requiredUserInteraction = UserInteractionRequired.None,
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

  if (!dmkSession) {
    throw new SwapKitError("wallet_ledger_connection_error", {
      message: "A Ledger DMK session or an injected LedgerJS transport is required",
    });
  }

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
    action: dmkSession.dmk.executeDeviceAction({ deviceAction, sessionId: dmkSession.sessionId }),
    onDeviceActionState,
  });

  return result.output;
}
