import { Chain, type DerivationPathArray, derivationPathToString, SwapKitError } from "@swapkit/helpers";
import type { StellarSigner, StellarTransaction } from "@swapkit/toolboxes/stellar";

type StellarAssetLike = { getAssetType: () => string; getCode: () => string; getIssuer: () => string };
type StellarOperationLike = Record<string, unknown> & { type: string; source?: string };
type StellarTransactionLike = {
  extraSigners?: unknown[];
  fee: string;
  ledgerBounds?: unknown;
  memo: { type: string; value: unknown };
  minAccountSequence?: string;
  minAccountSequenceAge?: unknown;
  minAccountSequenceLedgerGap?: number;
  networkPassphrase: string;
  operations: StellarOperationLike[];
  sequence: string;
  source: string;
  timeBounds?: { maxTime: string; minTime: string };
};

const STELLAR_DECIMALS = 7;
const ASSET_TYPES: Record<string, "NATIVE" | "ALPHANUM4" | "ALPHANUM12"> = {
  credit_alphanum4: "ALPHANUM4",
  credit_alphanum12: "ALPHANUM12",
  native: "NATIVE",
};
const MEMO_TYPES = { hash: 3, id: 2, none: 0, return: 4, text: 1 } as const;

function notSupported(reason: string) {
  return new SwapKitError({ errorKey: "wallet_trezor_method_not_supported", info: { chain: Chain.Stellar, reason } });
}

function toStroops(amount: unknown) {
  const match = typeof amount === "string" ? /^(\d+)(?:\.(\d{1,7}))?$/.exec(amount) : null;
  if (!match) throw notSupported(`Invalid Stellar amount: ${String(amount)}`);

  const [, whole = "0", fraction = ""] = match;
  return BigInt(`${whole}${fraction.padEnd(STELLAR_DECIMALS, "0")}`).toString();
}

function toTrezorAsset(value: unknown) {
  const asset = value as StellarAssetLike;
  const type = ASSET_TYPES[asset.getAssetType()];
  if (!type) throw notSupported("Trezor does not support liquidity pool assets");

  return type === "NATIVE" ? { type } : { code: asset.getCode(), issuer: asset.getIssuer(), type };
}

function toTrezorOperation({ source, ...operation }: StellarOperationLike) {
  const withSource = source ? { source } : {};

  switch (operation.type) {
    case "payment":
      return {
        ...withSource,
        amount: toStroops(operation.amount),
        asset: toTrezorAsset(operation.asset),
        destination: operation.destination as string,
        type: "payment" as const,
      };
    case "createAccount":
      return {
        ...withSource,
        destination: operation.destination as string,
        startingBalance: toStroops(operation.startingBalance),
        type: "createAccount" as const,
      };
    case "changeTrust":
      return {
        ...withSource,
        limit: toStroops(operation.limit),
        line: toTrezorAsset(operation.line),
        type: "changeTrust" as const,
      };
    default:
      throw notSupported(`Unsupported Stellar operation: ${operation.type}`);
  }
}

function decodeTextMemo(value: unknown) {
  if (typeof value === "string") return value;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value as Uint8Array);
  } catch {
    throw notSupported("Trezor only signs UTF-8 text memos");
  }
}

function toTrezorMemo({ type, value }: StellarTransactionLike["memo"]) {
  switch (type) {
    case "none":
      return undefined;
    case "text":
      return { text: decodeTextMemo(value), type: MEMO_TYPES.text };
    case "id":
      return { id: String(value), type: MEMO_TYPES.id };
    case "hash":
    case "return":
      return { hash: Buffer.from(value as Uint8Array).toString("hex"), type: MEMO_TYPES[type] };
    default:
      throw notSupported(`Unsupported Stellar memo type: ${type}`);
  }
}

export function toTrezorStellarTransaction(transaction: StellarTransaction, address: string) {
  if ("innerTransaction" in transaction) throw notSupported("Trezor cannot sign fee bump transactions");

  const tx = transaction as unknown as StellarTransactionLike;

  if (tx.source !== address) throw notSupported("Transaction source does not match the Trezor address");
  if (!tx.timeBounds) throw notSupported("Trezor requires transaction time bounds");
  const hasPreconditions =
    tx.ledgerBounds || tx.minAccountSequence || tx.minAccountSequenceAge || tx.minAccountSequenceLedgerGap;
  if (hasPreconditions || tx.extraSigners?.length) {
    throw notSupported("Trezor cannot sign Stellar transactions with extra preconditions");
  }

  return {
    networkPassphrase: tx.networkPassphrase,
    transaction: {
      fee: Number(tx.fee),
      memo: toTrezorMemo(tx.memo),
      operations: tx.operations.map(toTrezorOperation),
      sequence: tx.sequence,
      source: tx.source,
      timebounds: { maxTime: Number(tx.timeBounds.maxTime), minTime: Number(tx.timeBounds.minTime) },
    },
  };
}

export function getStellarSigner({ derivationPath }: { derivationPath: DerivationPathArray }): StellarSigner {
  const path = derivationPathToString(derivationPath.slice(0, 3) as [number, number, number]);
  let address = "";

  async function getAddress() {
    if (address) return address;

    const TrezorConnect = (await import("@trezor/connect-web")).default;
    const result = await TrezorConnect.stellarGetAddress({ path, showOnTrezor: true });

    if (!result.success) {
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_get_address",
        info: { chain: Chain.Stellar, derivationPath, error: result.payload.error },
      });
    }

    address = result.payload.address;
    return address;
  }

  async function signTransaction(transaction: StellarTransaction) {
    const params = toTrezorStellarTransaction(transaction, await getAddress());
    const TrezorConnect = (await import("@trezor/connect-web")).default;
    const result = await TrezorConnect.stellarSignTransaction({ path, ...params });

    if (!result.success) {
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_sign_transaction",
        info: { chain: Chain.Stellar, error: result.payload.error },
      });
    }

    try {
      transaction.addSignature(address, Buffer.from(result.payload.signature, "hex").toString("base64"));
    } catch (error) {
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_sign_transaction",
        info: { chain: Chain.Stellar, error },
      });
    }

    return transaction;
  }

  return { getAddress, signTransaction };
}
