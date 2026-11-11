import { hex } from "@scure/base";
import { Chain, SwapKitError } from "@swapkit/helpers";
import type { CardanoWallet } from "@swapkit/toolboxes/cardano";

export type Cip30Api = {
  getChangeAddress: () => Promise<string>;
  getNetworkId: () => Promise<number>;
  getUnusedAddresses: () => Promise<string[]>;
  getUsedAddresses: () => Promise<string[]>;
  signTx: (transaction: string, partialSign?: boolean) => Promise<string>;
};

export type Cip30Provider = {
  apiVersion: string;
  enable: () => Promise<Cip30Api>;
  icon: string;
  isEnabled: () => Promise<boolean>;
  name: string;
};

export const CARDANO_MAINNET_NETWORK_ID = 1;
export const CIP30_REFUSED = -3;
const CIP30_SIGN_DECLINED = 2;

export function getCip30ErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

export function toCip30SwapKitError(
  error: unknown,
  errorKey: "core_wallet_connection_failed" | "toolbox_cardano_sign_transaction_failed",
  info: Record<string, unknown> = {},
) {
  if (error instanceof SwapKitError) return error;

  const message = error instanceof Error ? error.message : (error as { info?: unknown } | undefined)?.info;
  return new SwapKitError(errorKey, { ...info, code: getCip30ErrorCode(error), message });
}

export async function getCip30PaymentAddress(
  api: Pick<Cip30Api, "getChangeAddress" | "getUnusedAddresses" | "getUsedAddresses">,
) {
  const [usedAddress] = await api.getUsedAddresses();
  if (usedAddress) return usedAddress;

  const [unusedAddress] = await api.getUnusedAddresses();
  return unusedAddress ?? api.getChangeAddress();
}

export async function getCip30Toolbox(
  api: Pick<Cip30Api, "signTx">,
  walletAddress: string,
): Promise<CardanoWallet & { address: string }> {
  const { addCardanoVkeyWitnesses, decodeCardanoWitnessSet, getCardanoAddressFromBytes, getCardanoToolbox } =
    await import("@swapkit/toolboxes/cardano");

  const address = walletAddress.startsWith("addr")
    ? walletAddress
    : await getCardanoAddressFromBytes(hex.decode(walletAddress));

  const signer = {
    address,
    connect: () => Promise.resolve({ address }),
    disconnect: () => Promise.resolve(),
    getAddress: () => Promise.resolve(address),
    signTransaction: async (transaction: string) => {
      const witnessSet = await api.signTx(transaction).catch((error: unknown) => {
        throw getCip30ErrorCode(error) === CIP30_SIGN_DECLINED
          ? new SwapKitError("core_transaction_user_rejected", { chain: Chain.Cardano })
          : toCip30SwapKitError(error, "toolbox_cardano_sign_transaction_failed");
      });

      return addCardanoVkeyWitnesses(transaction, await decodeCardanoWitnessSet(witnessSet));
    },
  };

  return { ...getCardanoToolbox({ signer }), address };
}
