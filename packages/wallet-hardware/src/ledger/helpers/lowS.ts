const SECP256K1_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_ORDER = SECP256K1_ORDER >> 1n;

function bytesToBigInt(bytes: Uint8Array) {
  return bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
}

function bigIntTo32Bytes(value: bigint) {
  const bytes = new Uint8Array(32);
  let remaining = value;
  for (let index = 31; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

/**
 * Cosmos SDK rejects high-S secp256k1 signatures. Ledger firmware should already return low-S, but
 * normalising a fixed-length `r || s` signature here removes the dependency on it.
 */
export function toLowSSignature(signature: Uint8Array) {
  const s = bytesToBigInt(signature.subarray(32, 64));
  if (s <= HALF_ORDER) return signature;

  const normalized = new Uint8Array(64);
  normalized.set(signature.subarray(0, 32), 0);
  normalized.set(bigIntTo32Bytes(SECP256K1_ORDER - s), 32);
  return normalized;
}
