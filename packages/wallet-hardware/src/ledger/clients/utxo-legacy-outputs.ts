import type Transport from "@ledgerhq/hw-transport";
import { SwapKitError } from "@swapkit/helpers";

/**
 * lib-app-bitcoin, behind the Bitcoin Cash, Dash, Dogecoin and Litecoin apps, collects the output it is checking in a
 * 100-byte buffer (MAX_OUTPUT_TO_CHECK) while signing the first input. It tests every HASH_INPUT_FINALIZE_FULL payload
 * against the room left in that buffer before appending it, and rejects one that does not fit with 0x6a80 ("Output is
 * too long to be checked"); a complete output leaves the buffer once the user has approved it.
 */
const LEGACY_APP_MAX_OUTPUT_LENGTH = 100;

const HASH_INPUT_FINALIZE_FULL = { cla: 0xe0, ins: 0x4a } as const;
const FINALIZE_P1_MORE = 0x00;
const FINALIZE_P1_LAST = 0x80;
// The app's own reply to a FINALIZE_P1_MORE APDU: a zero byte and 0x9000.
const FINALIZE_MORE_RESPONSE = [0x00, 0x90, 0x00];

// Bitcoin CompactSize. The 8-byte form describes nothing the app accepts, so it reads as malformed.
function readCompactSize(bytes: Uint8Array, offset: number): { size: number; value: number } | undefined {
  const marker = bytes[offset];
  if (marker === undefined || marker === 0xff) return undefined;
  if (marker < 0xfd) return { size: 1, value: marker };

  const width = marker === 0xfd ? 2 : 4;
  if (offset + 1 + width > bytes.length) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, width);
  return { size: 1 + width, value: width === 2 ? view.getUint16(0, true) : view.getUint32(0, true) };
}

/**
 * Splits serialised transaction outputs (the output count, then each output) into one piece per output, the first
 * carrying the count, so that every piece the legacy app receives ends on an output boundary. Rejects a malformed
 * stream and any piece the app cannot buffer.
 */
export function splitOutputsForLegacyApp(outputs: Uint8Array, chain: string): Uint8Array[] {
  const invalidOutputs = (reason: string, info: Record<string, number> = {}) =>
    new SwapKitError({
      errorKey: "wallet_ledger_invalid_params",
      info: {
        chain,
        maxLength: LEGACY_APP_MAX_OUTPUT_LENGTH,
        operation: "splitOutputsForLegacyApp",
        outputsLength: outputs.length,
        reason,
        ...info,
      },
    });

  const count = readCompactSize(outputs, 0);
  if (!count?.value) throw invalidOutputs("Transaction outputs do not start with a readable non-zero output count");

  const pieces: Uint8Array[] = [];
  let offset = count.size;
  for (let outputIndex = 0; outputIndex < count.value; outputIndex += 1) {
    // An output is an 8-byte amount, the script length and the script; the first piece also carries the count.
    const pieceStart = outputIndex === 0 ? 0 : offset;
    const scriptLength = readCompactSize(outputs, offset + 8);
    const outputEnd = scriptLength ? offset + 8 + scriptLength.size + scriptLength.value : undefined;
    if (!outputEnd || outputEnd > outputs.length) {
      throw invalidOutputs("Transaction output is truncated", { outputIndex });
    }

    const pieceLength = outputEnd - pieceStart;
    if (pieceLength > LEGACY_APP_MAX_OUTPUT_LENGTH) {
      throw invalidOutputs("Output is longer than the Ledger app can check; shorten the memo", {
        outputIndex,
        pieceLength,
      });
    }

    pieces.push(outputs.subarray(pieceStart, outputEnd));
    offset = outputEnd;
  }

  if (offset !== outputs.length) {
    throw invalidOutputs("Transaction outputs are followed by trailing bytes", {
      trailingBytes: outputs.length - offset,
    });
  }

  return pieces;
}

/**
 * hw-app-btc streams the outputs in fixed 50-byte HASH_INPUT_FINALIZE_FULL chunks. Each chunk has to fit the app's
 * buffer beside whatever unfinished output earlier chunks left there, which fails for longer memo outputs (in the
 * SDK's [vault, memo, change] order, from a 56-byte memo with P2PKH outputs and a 59-byte memo on Litecoin). Collect
 * the chunks of each stream and resend it one output per APDU: each APDU then meets an empty buffer, so any output of
 * up to 100 bytes (the first together with the output count) fits, and the bytes, and so the hashes, stay the same.
 * hw-app-btc ignores every response to these APDUs, so a collected chunk gets the app's own reply and the last one
 * returns the device's. The change-path APDU (P1 0xff) and every other APDU pass straight through.
 */
export function withOutputAlignedFinalize(transport: Transport, chain: string): Transport {
  let chunks: Buffer[] = [];

  const send: Transport["send"] = async (cla, ins, p1, p2, data = Buffer.alloc(0), ...rest) => {
    const isOutputChunk =
      cla === HASH_INPUT_FINALIZE_FULL.cla &&
      ins === HASH_INPUT_FINALIZE_FULL.ins &&
      (p1 === FINALIZE_P1_MORE || p1 === FINALIZE_P1_LAST);
    if (!isOutputChunk) return transport.send(cla, ins, p1, p2, data, ...rest);

    chunks.push(data);
    if (p1 === FINALIZE_P1_MORE) return Buffer.from(FINALIZE_MORE_RESPONSE);

    const outputs = Buffer.concat(chunks);
    chunks = [];
    const pieces = splitOutputsForLegacyApp(outputs, chain);

    let response: Buffer = Buffer.alloc(0);
    for (const [index, piece] of pieces.entries()) {
      const pieceP1 = index === pieces.length - 1 ? FINALIZE_P1_LAST : FINALIZE_P1_MORE;
      response = await transport.send(cla, ins, pieceP1, p2, Buffer.from(piece), ...rest);
    }
    return response;
  };

  // A Proxy rather than a copy, so the app-API lock and every other field stay on the caller's transport.
  return new Proxy(transport, {
    get: (target, property, receiver) => (property === "send" ? send : Reflect.get(target, property, receiver)),
  });
}
