import { Chain, type DerivationPathArray, derivationPathToString, SwapKitError } from "@swapkit/helpers";
import {
  type TronSignedTransaction,
  type TronSigner,
  type TronTransaction,
  tronAddressToHex,
} from "@swapkit/toolboxes/tron";

type TronFields = Record<string, unknown>;

const TRON_HEX_ADDRESS = /^41[0-9a-f]{40}$/i;
// Fields Trezor rebuilds itself; anything else would change the bytes it signs
const RAW_DATA_FIELDS = new Set([
  "contract",
  "data",
  "expiration",
  "fee_limit",
  "ref_block_bytes",
  "ref_block_hash",
  "timestamp",
]);
const CONTRACT_FIELDS = new Set(["parameter", "type"]);
const CONTRACT_VALUE_FIELDS: Record<string, Set<string>> = {
  TransferContract: new Set(["amount", "owner_address", "to_address"]),
  TriggerSmartContract: new Set(["contract_address", "data", "owner_address"]),
};
const PROTOBUF_DEFAULTS: unknown[] = [undefined, null, 0, "", false];

function notSupported(reason: string) {
  return new SwapKitError({ errorKey: "wallet_trezor_method_not_supported", info: { chain: Chain.Tron, reason } });
}

function assertKnownFields(fields: TronFields, allowed: Set<string>, scope: string) {
  const unknown = Object.keys(fields).filter(
    (field) => !allowed.has(field) && !PROTOBUF_DEFAULTS.includes(fields[field]),
  );
  if (unknown.length > 0) throw notSupported(`Trezor cannot sign Tron ${scope} with ${unknown.join(", ")}`);
}

function getStringField(value: TronFields, field: string) {
  const fieldValue = value[field];
  if (typeof fieldValue !== "string" || !fieldValue) throw notSupported(`Missing ${field} in Tron contract`);
  return fieldValue;
}

function getAmount(value: TronFields) {
  const { amount } = value;
  const isValid =
    (typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0) ||
    (typeof amount === "string" && /^[1-9]\d*$/.test(amount));

  if (!isValid) throw notSupported("Invalid amount in Tron contract");
  return String(amount);
}

export function toTrezorTronContract(transaction: TronTransaction) {
  const [contract, ...rest] = transaction.raw_data.contract;
  if (!contract || rest.length > 0) throw notSupported("Trezor signs Tron transactions with exactly one contract");

  const value = contract.parameter.value;
  const allowedValueFields = CONTRACT_VALUE_FIELDS[contract.type];
  if (!allowedValueFields) throw notSupported(`Unsupported Tron contract type: ${contract.type}`);

  assertKnownFields(transaction.raw_data as unknown as TronFields, RAW_DATA_FIELDS, "transactions");
  assertKnownFields(contract as unknown as TronFields, CONTRACT_FIELDS, "contracts");
  assertKnownFields(value, allowedValueFields, contract.type);

  // `visible: false` means the node already returned the addresses in hex
  const toHexAddress = (field: string) => {
    const address = getStringField(value, field);
    if (transaction.visible !== false) return tronAddressToHex(address);
    if (TRON_HEX_ADDRESS.test(address)) return address.toLowerCase();

    throw notSupported(`Invalid hex ${field} in Tron contract`);
  };

  const owner_address = toHexAddress("owner_address");

  if (contract.type === "TransferContract") {
    return {
      parameter: { value: { amount: getAmount(value), owner_address, to_address: toHexAddress("to_address") } },
      type: "TransferContract" as const,
    };
  }

  return {
    parameter: {
      value: { contract_address: toHexAddress("contract_address"), data: getStringField(value, "data"), owner_address },
    },
    type: "TriggerSmartContract" as const,
  };
}

export function getTronSigner({
  address: knownAddress,
  derivationPath,
}: {
  address?: string;
  derivationPath: DerivationPathArray;
}): TronSigner {
  const path = derivationPathToString(derivationPath);
  let address = knownAddress ?? "";

  return {
    getAddress: async () => {
      if (address) return address;

      const TrezorConnect = (await import("@trezor/connect-web")).default;
      const result = await TrezorConnect.tronGetAddress({ path, showOnTrezor: true });

      if (!result.success) {
        throw new SwapKitError({
          errorKey: "wallet_trezor_failed_to_get_address",
          info: { chain: Chain.Tron, derivationPath, error: result.payload.error },
        });
      }

      address = result.payload.address;
      return address;
    },

    signTransaction: async (transaction: TronTransaction): Promise<TronSignedTransaction> => {
      const contract = toTrezorTronContract(transaction);
      const TrezorConnect = (await import("@trezor/connect-web")).default;
      const { data, expiration, fee_limit, ref_block_bytes, ref_block_hash, timestamp } = transaction.raw_data;

      const result = await TrezorConnect.tronSignTransaction({
        contract: [contract],
        data,
        expiration,
        fee_limit,
        path,
        ref_block_bytes,
        ref_block_hash,
        timestamp,
      });

      if (!result.success) {
        throw new SwapKitError({
          errorKey: "wallet_trezor_failed_to_sign_transaction",
          info: { chain: Chain.Tron, error: result.payload.error },
        });
      }

      return { ...transaction, signature: [result.payload.signature.replace(/^0x/, "")] };
    },
  };
}
