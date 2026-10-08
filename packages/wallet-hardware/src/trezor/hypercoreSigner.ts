import { Chain, type DerivationPathArray, derivationPathToString, SwapKitError } from "@swapkit/helpers";
import type { TypedDataDomain, TypedDataField } from "ethers";

type HyperCoreTypedDataTypes = Record<string, TypedDataField[]>;

const USER_SIGNED_DOMAIN = {
  name: "HyperliquidSignTransaction",
  verifyingContract: "0x0000000000000000000000000000000000000000",
  version: "1",
} as const;
const DOMAIN_FIELDS = new Set(["chainId", "name", "verifyingContract", "version"]);
const EIP712_DOMAIN_TYPE: TypedDataField[] = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];
// User-signed actions Trezor shows field by field; L1 `Agent` actions carry an opaque hash and are refused
const USER_SIGNED_ACTION_TYPES: HyperCoreTypedDataTypes = {
  "HyperliquidTransaction:ApproveAgent": [
    { name: "hyperliquidChain", type: "string" },
    { name: "agentAddress", type: "address" },
    { name: "agentName", type: "string" },
    { name: "nonce", type: "uint64" },
  ],
  "HyperliquidTransaction:ApproveBuilderFee": [
    { name: "hyperliquidChain", type: "string" },
    { name: "maxFeeRate", type: "string" },
    { name: "builder", type: "address" },
    { name: "nonce", type: "uint64" },
  ],
  "HyperliquidTransaction:SendAsset": [
    { name: "hyperliquidChain", type: "string" },
    { name: "destination", type: "string" },
    { name: "sourceDex", type: "string" },
    { name: "destinationDex", type: "string" },
    { name: "token", type: "string" },
    { name: "amount", type: "string" },
    { name: "fromSubAccount", type: "string" },
    { name: "nonce", type: "uint64" },
  ],
  "HyperliquidTransaction:SpotSend": [
    { name: "hyperliquidChain", type: "string" },
    { name: "destination", type: "string" },
    { name: "token", type: "string" },
    { name: "amount", type: "string" },
    { name: "time", type: "uint64" },
  ],
  "HyperliquidTransaction:TokenDelegate": [
    { name: "hyperliquidChain", type: "string" },
    { name: "validator", type: "address" },
    { name: "wei", type: "uint64" },
    { name: "isUndelegate", type: "bool" },
    { name: "nonce", type: "uint64" },
  ],
  "HyperliquidTransaction:UsdClassTransfer": [
    { name: "hyperliquidChain", type: "string" },
    { name: "amount", type: "string" },
    { name: "toPerp", type: "bool" },
    { name: "nonce", type: "uint64" },
  ],
};
const MESSAGE_VALUE_TYPES = new Set(["bigint", "boolean", "number", "string"]);

function notSupported(reason: string) {
  return new SwapKitError({ errorKey: "wallet_trezor_method_not_supported", info: { chain: Chain.Hype, reason } });
}

function assertUserSignedDomain(domain: TypedDataDomain) {
  const domainFields = domain as Record<string, unknown>;
  const unknown = Object.keys(domainFields).filter((field) => !DOMAIN_FIELDS.has(field) && domainFields[field] != null);
  if (unknown.length > 0) throw notSupported(`Trezor cannot sign HyperCore actions with domain ${unknown.join(", ")}`);

  for (const [field, expected] of Object.entries(USER_SIGNED_DOMAIN)) {
    if (domainFields[field] !== expected) throw notSupported(`Unsupported HyperCore signing domain: ${field}`);
  }
  if (domain.chainId == null) throw notSupported("Missing chainId in HyperCore signing domain");
}

export function toTrezorHyperCoreTypedData(
  domain: TypedDataDomain,
  types: HyperCoreTypedDataTypes,
  message: Record<string, unknown>,
) {
  const { EIP712Domain: _, ...actionTypes } = types;
  const [primaryType, ...otherTypes] = Object.keys(actionTypes);
  if (!primaryType || otherTypes.length > 0) throw notSupported("Trezor signs HyperCore actions with exactly one type");

  const expectedFields = USER_SIGNED_ACTION_TYPES[primaryType];
  if (!expectedFields) throw notSupported(`Unsupported HyperCore action type: ${primaryType}`);

  const fields = actionTypes[primaryType] ?? [];
  const sameStruct =
    fields.length === expectedFields.length &&
    fields.every(
      (field, index) => field.name === expectedFields[index]?.name && field.type === expectedFields[index]?.type,
    );
  if (!sameStruct) throw notSupported(`Unexpected struct for HyperCore ${primaryType}`);

  assertUserSignedDomain(domain);

  const fieldNames = expectedFields.map(({ name }) => name);
  const unknown = Object.keys(message).filter((field) => !fieldNames.includes(field));
  if (unknown.length > 0) throw notSupported(`Trezor cannot sign HyperCore ${primaryType} with ${unknown.join(", ")}`);

  for (const name of fieldNames) {
    if (!MESSAGE_VALUE_TYPES.has(typeof message[name]))
      throw notSupported(`Invalid ${name} in HyperCore ${primaryType}`);
  }

  return { domain, message, primaryType, types: { EIP712Domain: EIP712_DOMAIN_TYPE, [primaryType]: fields } };
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

    signTypedData: async (
      domain: TypedDataDomain,
      types: HyperCoreTypedDataTypes,
      message: Record<string, unknown>,
    ) => {
      const data = toTrezorHyperCoreTypedData(domain, types, message);
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
