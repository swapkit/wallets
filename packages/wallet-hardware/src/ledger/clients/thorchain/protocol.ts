import {
  ApduBuilder,
  type ApduResponse,
  type Command,
  CommandResultFactory,
  InvalidResponseFormatError,
  InvalidStatusWordError,
} from "@ledgerhq/device-management-kit";
import type Transport from "@ledgerhq/hw-transport";
import { SwapKitError } from "@swapkit/helpers";

const CLA = 0x55;
const INS_GET_ADDRESS = 0x04;
const INS_GET_VERSION = 0x00;
const INS_SIGN = 0x02;
const P1_INIT = 0x00;
const P1_ADD = 0x01;
const P1_LAST = 0x02;
const STATUS_OK = 0x9000;
const SIGN_CHUNK_SIZE = 250;

interface ThorCommandParams {
  data?: Uint8Array;
  ins: number;
  p1?: number;
  p2?: number;
}

export class ThorCommand implements Command<Uint8Array> {
  readonly name = "THORChainCommand";
  private readonly params: ThorCommandParams;

  constructor(params: ThorCommandParams) {
    this.params = params;
  }

  getApdu() {
    const { data = new Uint8Array(), ins, p1 = 0, p2 = 0 } = this.params;
    return new ApduBuilder({ cla: CLA, ins, p1, p2 }).addBufferToData(data).build();
  }

  parseResponse(response: ApduResponse) {
    const status = (response.statusCode[0] ?? 0) * 0x100 + (response.statusCode[1] ?? 0);
    if (status !== STATUS_OK) {
      return CommandResultFactory<Uint8Array>({
        error: new InvalidStatusWordError(`THORChain app returned status 0x${status.toString(16).padStart(4, "0")}`),
      });
    }

    return CommandResultFactory<Uint8Array>({ data: response.data });
  }
}

export function serializeThorPath({ path }: { path: readonly (number | undefined)[] }) {
  if (path.length !== 5) {
    throw new SwapKitError("wallet_ledger_invalid_params", { reason: "THORChain path must contain five elements" });
  }

  const serialized = new Uint8Array(20);
  const view = new DataView(serialized.buffer);

  path.forEach((segment, index) => {
    if (typeof segment !== "number" || !Number.isInteger(segment) || segment < 0 || segment > 0xffffffff) {
      throw new SwapKitError("wallet_ledger_invalid_params", { reason: `Invalid THORChain path segment ${index}` });
    }

    const normalized = segment & 0x7fffffff;
    const value = index < 3 ? (normalized | 0x80000000) >>> 0 : normalized;
    view.setUint32(index * 4, value, true);
  });

  return serialized;
}

export function serializeThorAddressPayload({ hrp, path }: { hrp: string; path: readonly (number | undefined)[] }) {
  const encodedHrp = new TextEncoder().encode(hrp);
  if (encodedHrp.length < 1 || encodedHrp.length > 83) {
    throw new SwapKitError("wallet_ledger_invalid_params", { reason: "Invalid THORChain address prefix" });
  }

  const serializedPath = serializeThorPath({ path });
  return Uint8Array.from([encodedHrp.length, ...encodedHrp, ...serializedPath]);
}

export function getThorAddressCommand({
  checkOnDevice,
  hrp,
  path,
}: {
  checkOnDevice: boolean;
  hrp: string;
  path: readonly (number | undefined)[];
}) {
  return new ThorCommand({
    data: serializeThorAddressPayload({ hrp, path }),
    ins: INS_GET_ADDRESS,
    p1: checkOnDevice ? 1 : 0,
  });
}

export function getThorSignCommands({ message, path }: { message: Uint8Array; path: readonly (number | undefined)[] }) {
  const commands = [new ThorCommand({ data: serializeThorPath({ path }), ins: INS_SIGN, p1: P1_INIT })];

  if (message.length === 0) {
    commands.push(new ThorCommand({ data: new Uint8Array(), ins: INS_SIGN, p1: P1_LAST }));
    return commands;
  }

  for (let offset = 0; offset < message.length; offset += SIGN_CHUNK_SIZE) {
    const end = Math.min(offset + SIGN_CHUNK_SIZE, message.length);
    commands.push(
      new ThorCommand({
        data: message.slice(offset, end),
        ins: INS_SIGN,
        p1: end === message.length ? P1_LAST : P1_ADD,
      }),
    );
  }

  return commands;
}

function parseTransportResponse({ response }: { response: Uint8Array }) {
  if (response.length < 2) {
    throw new SwapKitError("wallet_ledger_invalid_response", { reason: "THORChain response is missing status bytes" });
  }

  return response.slice(0, -2);
}

export async function getThorLegacyVersion({ transport }: { transport: Transport }) {
  const response = await transport.send(CLA, INS_GET_VERSION, 0, 0, Buffer.alloc(0), [STATUS_OK]);
  const data = parseTransportResponse({ response });
  if (data.length < 4) {
    throw new SwapKitError("wallet_ledger_invalid_response", { reason: "Invalid THORChain version response" });
  }

  return `${data[1]}.${data[2]}.${data[3]}`;
}

export async function sendThorLegacyCommand({ command, transport }: { command: ThorCommand; transport: Transport }) {
  const apdu = command.getApdu();
  const response = await transport.send(apdu.cla, apdu.ins, apdu.p1, apdu.p2, Buffer.from(apdu.data), [STATUS_OK]);
  return parseTransportResponse({ response });
}

export function parseThorAddressResponse({ response }: { response: Uint8Array }) {
  if (response.length < 34) {
    throw new SwapKitError("wallet_ledger_invalid_response", { reason: "Invalid THORChain address response" });
  }

  const publicKey = response.slice(0, 33);
  const address = new TextDecoder().decode(response.slice(33));
  if (!address) {
    throw new SwapKitError("wallet_ledger_invalid_response", { reason: "THORChain address is empty" });
  }

  return { address, publicKey };
}

export function invalidThorAppVersion({ version }: { version?: string }) {
  return new InvalidResponseFormatError(`THORChain Ledger app major 2 is required, received ${version || "unknown"}`);
}
