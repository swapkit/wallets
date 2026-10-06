import { Chain, type DerivationPathArray, derivationPathToString, SwapKitError } from "@swapkit/helpers";
import type { RippleTransaction } from "@swapkit/toolboxes/ripple";

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

// Read by SwapKit core to discard routes before signing; the field checks below still guard the signer
export const TREZOR_RIPPLE_SIGNING_CAPABILITIES = { memoBytes: 0, tokenTransfer: false };

function notSupported(reason: string) {
  return new SwapKitError({ errorKey: "wallet_trezor_method_not_supported", info: { chain: Chain.Ripple, reason } });
}

export function toTrezorRippleTransaction(transaction: RippleTransaction, address: string) {
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

  const { Account, Amount, Destination, DestinationTag, Fee, Flags, LastLedgerSequence, Sequence } = tx;

  if (Account !== address) throw notSupported("Transaction account does not match the Trezor address");
  if (typeof Amount !== "string" || !/^\d+$/.test(Amount)) throw notSupported("Trezor only signs native XRP amounts");
  if (typeof Destination !== "string") throw notSupported("Missing destination");
  if (typeof Fee !== "string" || typeof Sequence !== "number") throw notSupported("Transaction is not autofilled");
  if (Flags !== undefined && typeof Flags !== "number") throw notSupported("Flags must be numeric");

  return {
    fee: Fee,
    flags: Flags as number | undefined,
    maxLedgerVersion: LastLedgerSequence as number | undefined,
    payment: { amount: Amount, destination: Destination, destinationTag: DestinationTag as number | undefined },
    sequence: Sequence,
  };
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
    const trezorTransaction = toTrezorRippleTransaction(transaction, await getAddress());
    const [TrezorConnect, { hashes }] = await Promise.all([
      import("@trezor/connect-web").then((module) => module.default),
      import("xrpl"),
    ]);

    const result = await TrezorConnect.rippleSignTransaction({ path, transaction: trezorTransaction });

    if (!result.success) {
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_sign_transaction",
        info: { chain: Chain.Ripple, error: result.payload.error },
      });
    }

    const tx_blob = result.payload.serializedTx.toUpperCase();
    return { hash: hashes.hashSignedTx(tx_blob), tx_blob };
  }

  return { getAddress, signTransaction };
}
