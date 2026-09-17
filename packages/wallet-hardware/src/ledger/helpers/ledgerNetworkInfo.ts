import type Transport from "@ledgerhq/hw-transport";

const LEDGER_CAL_SERVICE_URL = "https://crypto-assets-service.api.ledger.com/v1";

const LEDGER_DEVICE_TO_CAL_MODEL: Record<string, string> = {
  apex: "apexp",
  europa: "flex",
  nanoS: "nanos",
  nanoSP: "nanosp",
  nanoX: "nanox",
  stax: "stax",
};

const APDU_CLA = 0xe0;
const APDU_CLA_PKI = 0xb0;
const APDU_INS_LOAD_CERTIFICATE = 0x06;
const LEDGER_KEY_USAGE_NETWORK = 0x0c;
const APDU_INS_PROVIDE_NETWORK_INFORMATION = 0x30;
const APDU_P1_FIRST_CHUNK = 0x01;
const APDU_P1_FOLLOWING_CHUNK = 0x00;
const APDU_P2_NETWORK_CONFIG = 0x00;
const APDU_P2_NETWORK_ICON = 0x01;
const APDU_P2_GET_INFO = 0x02;
const APDU_MAX_CHUNK_SIZE = 0xff;
const TLV_TAG_DER_SIGNATURE = 0x15;

export type LedgerNetworkDescriptor = { data: string; icon?: string; signature: string };

type CalNetwork = {
  chain_id: number;
  descriptors?: Record<string, { data?: string; signatures?: { prod?: string } }>;
  icons?: Record<string, string>;
};

export async function fetchLedgerNetworkCertificate(
  deviceModelId: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  const calModel = LEDGER_DEVICE_TO_CAL_MODEL[deviceModelId];
  if (!calModel) return null;

  const url = `${LEDGER_CAL_SERVICE_URL}/certificates?output=descriptor&public_key_usage=network&target_device=${calModel}`;
  const response = await fetchFn(url);
  if (!response.ok) return null;

  const certificates = (await response.json()) as Array<{
    descriptor?: { data?: string; signatures?: { prod?: string } };
  }>;
  const descriptor = certificates[0]?.descriptor;
  const signature = descriptor?.signatures?.prod;

  if (!(descriptor?.data && signature)) return null;

  return `${descriptor.data}${appendSignatureTlv(signature)}`;
}

export async function provideLedgerCertificate(transport: Transport, payloadHex: string) {
  await transport.send(
    APDU_CLA_PKI,
    APDU_INS_LOAD_CERTIFICATE,
    LEDGER_KEY_USAGE_NETWORK,
    0x00,
    Buffer.from(payloadHex, "hex"),
  );
}

export async function fetchLedgerNetworkDescriptor(
  chainId: number,
  deviceModelId: string,
  fetchFn: typeof fetch = fetch,
): Promise<LedgerNetworkDescriptor | null> {
  const calModel = LEDGER_DEVICE_TO_CAL_MODEL[deviceModelId];
  if (!calModel) return null;

  const url = `${LEDGER_CAL_SERVICE_URL}/networks?chain_id=${chainId}&output=chain_id,descriptors,icons`;
  const response = await fetchFn(url);
  if (!response.ok) return null;

  const networks = (await response.json()) as CalNetwork[];
  const network = networks.find((entry) => entry.chain_id === chainId);
  const descriptor = network?.descriptors?.[calModel];
  const signature = descriptor?.signatures?.prod;

  if (!(descriptor?.data && signature)) return null;

  return { data: descriptor.data, icon: network?.icons?.[calModel], signature };
}

function appendSignatureTlv(signature: string) {
  const length = (signature.length / 2).toString(16).padStart(2, "0");
  return `${TLV_TAG_DER_SIGNATURE.toString(16).padStart(2, "0")}${length}${signature}`;
}

function encodeTlvLength(length: number) {
  if (length < 0x80) return Buffer.from([length]);
  if (length <= 0xff) return Buffer.from([0x81, length]);

  const buffer = Buffer.alloc(3);
  buffer[0] = 0x82;
  buffer.writeUInt16BE(length, 1);
  return buffer;
}

function encodeTlv(tag: number, value: Buffer) {
  return Buffer.concat([Buffer.from([tag]), encodeTlvLength(value.length), value]);
}

function chunkBuffer(buffer: Buffer, size = APDU_MAX_CHUNK_SIZE) {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += size) {
    chunks.push(buffer.subarray(offset, offset + size));
  }
  return chunks;
}

export function encodeNetworkInfoPayload({ data, signature }: LedgerNetworkDescriptor) {
  const tlv = Buffer.concat([
    Buffer.from(data, "hex"),
    encodeTlv(TLV_TAG_DER_SIGNATURE, Buffer.from(signature, "hex")),
  ]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(tlv.length, 0);
  return Buffer.concat([length, tlv]);
}

async function sendChunked(transport: Transport, p2: number, payload: Buffer) {
  const chunks = chunkBuffer(payload);
  for (const [index, chunk] of chunks.entries()) {
    const p1 = index === 0 ? APDU_P1_FIRST_CHUNK : APDU_P1_FOLLOWING_CHUNK;
    await transport.send(APDU_CLA, APDU_INS_PROVIDE_NETWORK_INFORMATION, p1, p2, chunk);
  }
}

export async function getRegisteredLedgerNetworks(transport: Transport): Promise<number[]> {
  const response = await transport.send(
    APDU_CLA,
    APDU_INS_PROVIDE_NETWORK_INFORMATION,
    APDU_P1_FOLLOWING_CHUNK,
    APDU_P2_GET_INFO,
  );

  const count = response[0] ?? 0;
  const chainIds: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const offset = 1 + index * 8;
    if (offset + 8 > response.length) break;
    chainIds.push(Number(response.readBigUInt64BE(offset)));
  }

  return chainIds;
}

export async function provideLedgerNetworkInformation(transport: Transport, descriptor: LedgerNetworkDescriptor) {
  const payload = encodeNetworkInfoPayload(descriptor);
  await sendChunked(transport, APDU_P2_NETWORK_CONFIG, payload);

  if (!descriptor.icon) return { iconAccepted: false };

  try {
    await sendChunked(transport, APDU_P2_NETWORK_ICON, Buffer.from(descriptor.icon, "hex"));
    return { iconAccepted: true };
  } catch {
    await sendChunked(transport, APDU_P2_NETWORK_CONFIG, payload);
    return { iconAccepted: false };
  }
}
