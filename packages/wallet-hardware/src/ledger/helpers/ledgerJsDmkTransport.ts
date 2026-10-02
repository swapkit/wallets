import {
  Apdu,
  type ApduResponse,
  type Command,
  CommandResultFactory,
  type InternalApi,
  isSuccessCommandResult,
  UnknownDeviceExchangeError,
} from "@ledgerhq/device-management-kit";
import Transport, { TransportError } from "@ledgerhq/hw-transport";

// Only ever loaded through `import()` from ledgerJsDmkBridge: subclassing needs hw-transport at runtime, and its
// lib-es build pulls in @ledgerhq/errors with extensionless relative imports that Node ESM cannot resolve, so a
// static import from a package entry would break `import "@swapkit/wallet-hardware/ledger"` outside a bundler.

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

  return { cla, data: apdu.subarray(5), ins, p1, p2 };
}

export class LedgerJsDmkTransport extends TransportBase {
  constructor(private readonly internalApi: InternalApi) {
    super();
  }

  async exchange(apdu: Buffer, { abortTimeoutMs }: { abortTimeoutMs?: number } = {}) {
    const { cla, data, ins, p1, p2 } = parseShortApdu(apdu);
    const command = new RawApduCommand(new Apdu(cla, ins, p1, p2, data));
    // Forward only an explicit timeout: hw-transport's 30 s default would cut off a user still confirming
    // on the device once DMK honours the argument.
    const result = await this.internalApi.sendCommand(command, abortTimeoutMs);

    if (!isSuccessCommandResult(result)) throw result.error;
    return Buffer.from(result.data.response);
  }

  close() {
    return Promise.resolve();
  }
}
