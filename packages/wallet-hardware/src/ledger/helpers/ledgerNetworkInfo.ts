import type Transport from "@ledgerhq/hw-transport";

/**
 * Dynamic network support for the Ledger Ethereum app (>= 1.13.0).
 *
 * The app only accepts clear-signing metadata for chains it knows. Chains missing from its
 * hardcoded table (ARC, Monad, Aurora...) must be registered at runtime with a Ledger-signed
 * network descriptor published on the Crypto Assets List (CAL). Without it the app rejects
 * the ERC20 descriptor, the internal ERC20 plugin falls back, and the device demands blind
 * signing. Ledger Live registers the network the same way before signing.
 *
 * The descriptor is device-specific because it embeds the hash of the icon rendered on that
 * screen. APDU layout is stable since app 1.13.0; see `provide_network_info` in
 * LedgerHQ/app-ethereum.
 */

const LEDGER_CAL_SERVICE_URL = "https://crypto-assets-service.api.ledger.com/v1";

/**
 * `@ledgerhq/devices` DeviceModelId -> CAL descriptor key, mirroring the mapping in
 * Ledger's own context-module (`HttpDynamicNetworkDataSource`). Not every network publishes
 * a descriptor for every model, so a mapped model can still resolve to none.
 */
const LEDGER_DEVICE_TO_CAL_MODEL: Record<string, string> = {
  apex: "apexp",
  europa: "flex",
  nanoS: "nanos",
  nanoSP: "nanosp",
  nanoX: "nanox",
  stax: "stax",
};

const APDU_CLA = 0xe0;
// OS-level class used to load PKI certificates, outside the Ethereum app's own class.
const APDU_CLA_PKI = 0xb0;
const APDU_INS_LOAD_CERTIFICATE = 0x06;
/** CERTIFICATE_PUBLIC_KEY_USAGE_NETWORK in the app's PKI key usage table. */
const LEDGER_KEY_USAGE_NETWORK = 0x0c;
const APDU_INS_PROVIDE_NETWORK_INFORMATION = 0x30;
const APDU_P1_FIRST_CHUNK = 0x01;
const APDU_P1_FOLLOWING_CHUNK = 0x00;
const APDU_P2_NETWORK_CONFIG = 0x00;
const APDU_P2_NETWORK_ICON = 0x01;
const APDU_P2_GET_INFO = 0x02;
const APDU_MAX_CHUNK_SIZE = 0xff;
const TLV_TAG_DER_SIGNATURE = 0x15;

export type LedgerNetworkDescriptor = {
  /** Hex encoded TLV payload (structure type, chain id, name, ticker, icon hash). */
  data: string;
  /** Hex encoded device icon bitmap, when the CAL publishes one for this model. */
  icon?: string;
  /** Hex encoded DER signature over `data`, produced with Ledger's production key. */
  signature: string;
};

type CalNetwork = {
  chain_id: number;
  descriptors?: Record<string, { data?: string; signatures?: { prod?: string } }>;
  icons?: Record<string, string>;
};

/**
 * Fetches the PKI certificate carrying the public key the app verifies network descriptors
 * with. Recent app versions (1.2x) check the descriptor signature against a certificate
 * loaded at runtime rather than a key baked into the firmware, so without this the device
 * rejects even a perfectly formed descriptor with INCORRECT_DATA.
 *
 * Returns the hex payload `<certificate data> <0x15 len signature>`, or null when Ledger
 * publishes no certificate for that device (e.g. Nano S).
 */
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

/** Loads the certificate so the app can verify the network descriptor that follows. */
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

/** `<0x15> <len> <signature>`, the TLV the CAL descriptors expect appended to their data. */
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

/** `<u16 BE tlv length> <tlv data> <0x15 len signature>` — same layout as Ledger's client. */
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

/**
 * Asks the device which chains are currently registered as dynamic networks.
 * Response layout: `<count> <count x uint64 BE chain id>`, then the status word.
 */
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

/**
 * Registers a network on the connected Ethereum app so it can clear-sign that chain.
 *
 * The icon is optional (the app only requires type, version, family, chain id, name, ticker
 * and signature) but a rejected icon makes the app drop the network it just registered, so
 * we re-send the configuration to restore it and carry on without the logo.
 */
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
