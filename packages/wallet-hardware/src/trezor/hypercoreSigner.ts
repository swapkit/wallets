import { Chain, type DerivationPathArray, derivationPathToString, SwapKitError } from "@swapkit/helpers";
import type { TypedDataDomain, TypedDataField } from "ethers";

type TypedDataTypes = Record<string, TypedDataField[]>;
type TypedDataValue = Record<string, unknown>;

const ARRAY_TYPE = /^(.*)\[\d*\]$/;

function notSupported(reason: string) {
  return new SwapKitError({ errorKey: "wallet_trezor_method_not_supported", info: { chain: Chain.Hype, reason } });
}

// Trezor asks for each value by the names in `types`, so a field not declared there would be signed away unseen
function assertNoHiddenFields(types: TypedDataTypes, typeName: string, value: unknown, path: string) {
  const arrayMatch = ARRAY_TYPE.exec(typeName);
  if (arrayMatch) {
    if (!Array.isArray(value)) throw notSupported(`Invalid ${path}`);
    for (const [index, entry] of value.entries()) {
      assertNoHiddenFields(types, arrayMatch[1] ?? "", entry, `${path}[${index}]`);
    }
    return;
  }

  const fields = types[typeName];
  if (!fields) {
    if (typeof value === "object") throw notSupported(`Invalid ${path}`);
    return;
  }

  if (typeof value !== "object" || value === null) throw notSupported(`Invalid ${path}`);
  const struct = value as TypedDataValue;
  const hidden = Object.keys(struct).filter((key) => struct[key] != null && !fields.some(({ name }) => name === key));
  if (hidden.length > 0) throw notSupported(`Trezor cannot sign HyperCore ${typeName} with ${hidden.join(", ")}`);

  for (const field of fields) assertNoHiddenFields(types, field.type, struct[field.name], `${path}.${field.name}`);
}

export async function toTrezorHyperCoreTypedData(
  domain: TypedDataDomain,
  types: TypedDataTypes,
  message: TypedDataValue,
) {
  const { TypedDataEncoder } = await import("ethers");
  const { EIP712Domain: _, ...structTypes } = types;

  let payload: { primaryType: string; types: TypedDataTypes };
  try {
    // ethers checks the domain, the type graph and every value; the device still gets the caller's own data
    payload = TypedDataEncoder.getPayload(domain, structTypes, message);
  } catch (error) {
    throw notSupported(`Invalid HyperCore typed data: ${(error as Error).message}`);
  }

  const { EIP712Domain: domainType = [], ...encodedTypes } = payload.types;
  assertNoHiddenFields({ EIP712Domain: domainType }, "EIP712Domain", domain, "domain");
  assertNoHiddenFields(encodedTypes, payload.primaryType, message, "message");

  return { domain, message, primaryType: payload.primaryType, types: { EIP712Domain: domainType, ...structTypes } };
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
