import { Chain, type DerivationPathArray, derivationPathToString, SwapKitError } from "@swapkit/helpers";
import type { TypedDataDomain, TypedDataField } from "ethers";

type TypedDataTypes = Record<string, TypedDataField[]>;
type TypedDataValue = Record<string, unknown>;

function notSupported(reason: string) {
  return new SwapKitError({ errorKey: "wallet_trezor_method_not_supported", info: { chain: Chain.Hype, reason } });
}

export async function toTrezorHyperCoreTypedData(
  domain: TypedDataDomain,
  types: TypedDataTypes,
  message: TypedDataValue,
) {
  const { TypedDataEncoder } = await import("ethers");
  const { EIP712Domain: _, ...structTypes } = types;

  try {
    // ethers checks the domain, the type graph and every value; the device still gets the caller's own data
    const payload: { primaryType: string; types: TypedDataTypes } = TypedDataEncoder.getPayload(
      domain,
      structTypes,
      message,
    );
    return {
      domain,
      message,
      primaryType: payload.primaryType,
      types: { EIP712Domain: payload.types.EIP712Domain, ...structTypes },
    };
  } catch (error) {
    throw notSupported(`Invalid HyperCore typed data: ${(error as Error).message}`);
  }
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

      // Hyperliquid takes the account from the signature, so a stale known address would act from another account
      if (result.payload.address.toLowerCase() !== address.toLowerCase()) {
        throw new SwapKitError({
          errorKey: "wallet_trezor_failed_to_sign_transaction",
          info: { chain: Chain.Hype, error: "Trezor signed with a different address", signer: result.payload.address },
        });
      }

      return result.payload.signature.startsWith("0x") ? result.payload.signature : `0x${result.payload.signature}`;
    },
  };
}
