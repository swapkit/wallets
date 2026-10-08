import { Chain, type DerivationPathArray, derivationPathToString, SwapKitError } from "@swapkit/helpers";
import type { TypedDataDomain, TypedDataField } from "ethers";

type TypedDataTypes = Record<string, TypedDataField[]>;
type TypedDataValue = Record<string, unknown>;

// EIP-712 domain fields Trezor can show; any other key would be left out of what the device signs
const DOMAIN_TYPE: TypedDataField[] = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
  { name: "salt", type: "bytes32" },
];
const ARRAY_TYPE = /^(.*)\[(\d*)\]$/;
const PRIMITIVE_VALUE_TYPES = new Set(["bigint", "boolean", "number", "string"]);

function notSupported(reason: string) {
  return new SwapKitError({ errorKey: "wallet_trezor_method_not_supported", info: { chain: Chain.Hype, reason } });
}

function toDomainType(domain: TypedDataDomain) {
  const domainFields = domain as TypedDataValue;
  const unknown = Object.keys(domainFields).filter(
    (key) => domainFields[key] != null && !DOMAIN_TYPE.some(({ name }) => name === key),
  );
  if (unknown.length > 0) throw notSupported(`Trezor cannot sign a HyperCore domain with ${unknown.join(", ")}`);

  return DOMAIN_TYPE.filter(({ name }) => domainFields[name] != null);
}

// Trezor asks for each value by the names in `types`, so anything not declared there would be signed away unseen
function assertStructValue(types: TypedDataTypes, typeName: string, value: unknown, path: string) {
  const arrayMatch = ARRAY_TYPE.exec(typeName);
  if (arrayMatch) {
    const [, entryType = "", size] = arrayMatch;
    if (!Array.isArray(value) || (size && value.length !== Number(size))) throw notSupported(`Invalid ${path}`);
    for (const [index, entry] of value.entries()) assertStructValue(types, entryType, entry, `${path}[${index}]`);
    return;
  }

  const fields = types[typeName];
  if (!fields) {
    if (!PRIMITIVE_VALUE_TYPES.has(typeof value)) throw notSupported(`Invalid ${path}`);
    return;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) throw notSupported(`Invalid ${path}`);
  const struct = value as TypedDataValue;
  const unknown = Object.keys(struct).filter((key) => struct[key] != null && !fields.some(({ name }) => name === key));
  if (unknown.length > 0) throw notSupported(`Trezor cannot sign HyperCore ${typeName} with ${unknown.join(", ")}`);

  for (const field of fields) assertStructValue(types, field.type, struct[field.name], `${path}.${field.name}`);
}

export async function toTrezorHyperCoreTypedData(
  domain: TypedDataDomain,
  types: TypedDataTypes,
  message: TypedDataValue,
) {
  const { TypedDataEncoder } = await import("ethers");
  const { EIP712Domain: _, ...structTypes } = types;
  const domainType = toDomainType(domain);

  let primaryType: string;
  try {
    primaryType = TypedDataEncoder.from(structTypes).primaryType;
  } catch (error) {
    throw notSupported(`Invalid HyperCore typed data: ${(error as Error).message}`);
  }

  assertStructValue({ EIP712Domain: domainType }, "EIP712Domain", domain, "domain");
  assertStructValue(structTypes, primaryType, message, "message");

  return { domain, message, primaryType, types: { EIP712Domain: domainType, ...structTypes } };
}

export function getHyperCoreSigner({
  address: knownAddress,
  derivationPath,
}: {
  address?: string;
  derivationPath: DerivationPathArray;
}) {
  const path = derivationPathToString(derivationPath);
  let address = knownAddress ?? "";

  return {
    getAddress: async () => {
      if (address) return address;

      const TrezorConnect = (await import("@trezor/connect-web")).default;
      const result = await TrezorConnect.ethereumGetAddress({ path, showOnTrezor: true });

      if (!result.success) {
        throw new SwapKitError({
          errorKey: "wallet_trezor_failed_to_get_address",
          info: { chain: Chain.Hype, derivationPath, error: result.payload.error },
        });
      }

      address = result.payload.address;
      return address;
    },

    // HyperCore has no transactions: every action goes through signTypedData
    signTransaction: () => Promise.reject(notSupported("HyperCore actions are signed with signTypedData")),

    signTypedData: async (domain: TypedDataDomain, types: TypedDataTypes, message: TypedDataValue) => {
      const data = await toTrezorHyperCoreTypedData(domain, types, message);
      const TrezorConnect = (await import("@trezor/connect-web")).default;

      const result = await TrezorConnect.ethereumSignTypedData({
        data: data as Parameters<typeof TrezorConnect.ethereumSignTypedData>[0]["data"],
        metamask_v4_compat: true,
        path,
      });

      if (!result.success) {
        throw new SwapKitError({
          errorKey: "wallet_trezor_failed_to_sign_transaction",
          info: { chain: Chain.Hype, error: result.payload.error },
        });
      }

      return result.payload.signature.startsWith("0x") ? result.payload.signature : `0x${result.payload.signature}`;
    },
  };
}
