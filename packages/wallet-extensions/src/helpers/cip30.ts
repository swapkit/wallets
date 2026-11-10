import { hex } from "@scure/base";
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

export async function getCip30PaymentAddress(
  api: Pick<Cip30Api, "getChangeAddress" | "getUnusedAddresses" | "getUsedAddresses">,
) {
  // A multi-address wallet can hand out a fresh, unfunded change address on every call
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
    signTransaction: async (transaction: string) =>
      addCardanoVkeyWitnesses(transaction, await decodeCardanoWitnessSet(await api.signTx(transaction))),
  };

  return { ...getCardanoToolbox({ signer }), address };
}
