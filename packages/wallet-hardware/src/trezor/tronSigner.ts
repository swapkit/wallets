import { Chain, type DerivationPathArray, derivationPathToString, SwapKitError } from "@swapkit/helpers";
import {
  type TronSignedTransaction,
  type TronSigner,
  type TronTransaction,
  tronAddressToHex,
} from "@swapkit/toolboxes/tron";

type TronContractValue = Record<string, unknown>;

function getStringField(value: TronContractValue, field: string) {
  const fieldValue = value[field];
  if (typeof fieldValue !== "string" || !fieldValue) {
    throw new SwapKitError({
      errorKey: "wallet_trezor_method_not_supported",
      info: { chain: Chain.Tron, reason: `Missing ${field} in Tron contract` },
    });
  }
  return fieldValue;
}

export function toTrezorTronContract(transaction: TronTransaction) {
  const [contract, ...rest] = transaction.raw_data.contract;
  if (!contract || rest.length > 0) {
    throw new SwapKitError({
      errorKey: "wallet_trezor_method_not_supported",
      info: { chain: Chain.Tron, reason: "Trezor signs Tron transactions with exactly one contract" },
    });
  }

  const value = contract.parameter.value;
  const owner_address = tronAddressToHex(getStringField(value, "owner_address"));

  switch (contract.type) {
    case "TransferContract":
      return {
        parameter: {
          value: {
            amount: String(value.amount),
            owner_address,
            to_address: tronAddressToHex(getStringField(value, "to_address")),
          },
        },
        type: "TransferContract" as const,
      };

    case "TriggerSmartContract": {
      // Trezor cannot sign TRX attached to a contract call, the signature would not match the tx
      if (value.call_value || value.call_token_value) {
        throw new SwapKitError({
          errorKey: "wallet_trezor_method_not_supported",
          info: { chain: Chain.Tron, reason: "Trezor does not support call_value on Tron contract calls" },
        });
      }

      return {
        parameter: {
          value: {
            contract_address: tronAddressToHex(getStringField(value, "contract_address")),
            data: getStringField(value, "data"),
            owner_address,
          },
        },
        type: "TriggerSmartContract" as const,
      };
    }

    default:
      throw new SwapKitError({
        errorKey: "wallet_trezor_method_not_supported",
        info: { chain: Chain.Tron, reason: `Unsupported Tron contract type: ${contract.type}` },
      });
  }
}

export function getTronSigner({ derivationPath }: { derivationPath: DerivationPathArray }): TronSigner {
  const path = derivationPathToString(derivationPath);
  let address = "";

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
      const TrezorConnect = (await import("@trezor/connect-web")).default;
      const { data, expiration, fee_limit, ref_block_bytes, ref_block_hash, timestamp } = transaction.raw_data;

      const result = await TrezorConnect.tronSignTransaction({
        contract: [toTrezorTronContract(transaction)],
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
