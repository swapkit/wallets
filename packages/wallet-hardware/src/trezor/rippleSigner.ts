import { Chain, type DerivationPathArray, derivationPathToString, SwapKitError } from "@swapkit/helpers";
import type { RippleTransaction } from "@swapkit/toolboxes/ripple";
import { decode } from "ripple-binary-codec";
import { GlobalFlags, hashes, isValidClassicAddress } from "xrpl";

// Fields Trezor serializes itself; anything else would be dropped from the signed transaction
const TREZOR_RIPPLE_FIELDS = new Set([
  "Account",
  "Amount",
  "Destination",
  "DestinationTag",
  "Fee",
  "Flags",
  "LastLedgerSequence",
  "Sequence",
  "SigningPubKey",
  "TransactionType",
]);

const UINT32_MAX = 0xffffffff;
const UINT64_MAX = 2n ** 64n - 1n;
const MAX_XRP_DROPS = 10n ** 17n;
const TF_FULLY_CANONICAL_SIG = 0x80000000;
const SIGNED_FIELDS = [
  "Account",
  "Amount",
  "Destination",
  "DestinationTag",
  "Fee",
  "Sequence",
  "LastLedgerSequence",
  "TransactionType",
];

function notSupported(reason: string) {
  return new SwapKitError({ errorKey: "wallet_trezor_method_not_supported", info: { chain: Chain.Ripple, reason } });
}

function signMismatch(field: string) {
  return new SwapKitError({
    errorKey: "wallet_trezor_failed_to_sign_transaction",
    info: { chain: Chain.Ripple, reason: `Trezor signed a different ${field} than requested` },
  });
}

function assertUint32(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw notSupported(`${field} must be an integer between 0 and ${UINT32_MAX}`);
  }
}

function assertDrops(value: unknown, field: string, max: bigint) {
  if (typeof value !== "string" || !/^\d+$/.test(value) || BigInt(value) > max) {
    throw notSupported(`${field} must be a whole number of drops up to ${max}`);
  }
}

export function toTrezorRippleTransaction(transaction: RippleTransaction) {
  const tx = transaction as unknown as Record<string, unknown>;

  if (tx.TransactionType !== "Payment") {
    throw notSupported(`Trezor only signs XRP payments, got ${String(tx.TransactionType)}`);
  }

  const unsupportedFields = Object.keys(tx).filter(
    (field) => tx[field] !== undefined && tx[field] !== null && !TREZOR_RIPPLE_FIELDS.has(field),
  );
  if (unsupportedFields.length > 0) {
    throw notSupported(`Trezor cannot sign XRP payments with ${unsupportedFields.join(", ")}`);
  }

  const { Amount, Destination, DestinationTag, Fee, Flags, LastLedgerSequence, Sequence, SigningPubKey } = tx;

  if (typeof Amount !== "string") throw notSupported("Trezor only signs native XRP amounts");
  assertDrops(Amount, "Amount", MAX_XRP_DROPS);
  if (typeof Destination !== "string") throw notSupported("Missing destination");
  if (!isValidClassicAddress(Destination)) throw notSupported("Destination must be a classic XRP address");
  if (Fee === undefined || Sequence === undefined) throw notSupported("Transaction is not autofilled");
  assertDrops(Fee, "Fee", UINT64_MAX);
  assertUint32(Sequence, "Sequence");
  if (Flags !== undefined) assertUint32(Flags, "Flags");
  if (LastLedgerSequence !== undefined) assertUint32(LastLedgerSequence, "LastLedgerSequence");
  if (DestinationTag !== undefined) assertUint32(DestinationTag, "DestinationTag");
  if (SigningPubKey !== undefined && (typeof SigningPubKey !== "string" || !SigningPubKey)) {
    throw notSupported("Trezor cannot sign multisig XRP transactions");
  }
  if (((Flags as number | undefined) ?? 0) & GlobalFlags.tfInnerBatchTxn) {
    throw notSupported("Trezor cannot sign Batch inner XRP transactions");
  }

  return {
    fee: Fee as string,
    flags: Flags as number | undefined,
    maxLedgerVersion: LastLedgerSequence as number | undefined,
    payment: { amount: Amount, destination: Destination, destinationTag: DestinationTag as number | undefined },
    sequence: Sequence as number,
  };
}

function assertSignedAsRequested(transaction: RippleTransaction, txBlob: string) {
  const requested = transaction as unknown as Record<string, unknown>;
  const signed = decode(txBlob) as Record<string, unknown>;

  for (const field of SIGNED_FIELDS) {
    if (signed[field] !== requested[field]) throw signMismatch(field);
  }
  // Ignore tfFullyCanonicalSig: unverified whether the firmware adds it
  const flagsOf = (value: unknown) => (((value as number | undefined) ?? 0) & ~TF_FULLY_CANONICAL_SIG) >>> 0;
  if (flagsOf(signed.Flags) !== flagsOf(requested.Flags)) throw signMismatch("Flags");

  const { SigningPubKey } = requested;
  if (typeof SigningPubKey === "string" && SigningPubKey.toUpperCase() !== String(signed.SigningPubKey)) {
    throw signMismatch("SigningPubKey");
  }
}

export function getRippleSigner({ derivationPath }: { derivationPath: DerivationPathArray }) {
  const path = derivationPathToString(derivationPath);
  let address = "";

  async function getAddress() {
    if (address) return address;

    const TrezorConnect = (await import("@trezor/connect-web")).default;
    const result = await TrezorConnect.rippleGetAddress({ path, showOnTrezor: true });

    if (!result.success) {
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_get_address",
        info: { chain: Chain.Ripple, derivationPath, error: result.payload.error },
      });
    }

    address = result.payload.address;
    return address;
  }

  async function signTransaction(transaction: RippleTransaction) {
    const trezorTransaction = toTrezorRippleTransaction(transaction);
    if (transaction.Account !== (await getAddress())) {
      throw notSupported("Transaction account does not match the Trezor address");
    }

    const TrezorConnect = (await import("@trezor/connect-web")).default;

    const result = await TrezorConnect.rippleSignTransaction({ path, transaction: trezorTransaction });

    if (!result.success) {
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_sign_transaction",
        info: { chain: Chain.Ripple, error: result.payload.error },
      });
    }

    const tx_blob = result.payload.serializedTx.toUpperCase();
    assertSignedAsRequested(transaction, tx_blob);

    return { hash: hashes.hashSignedTx(tx_blob), tx_blob };
  }

  return { getAddress, signTransaction };
}
