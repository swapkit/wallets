import { hex } from "@scure/base";
import { Chain, SwapKitError } from "@swapkit/helpers";
import type { CardanoWallet } from "@swapkit/toolboxes/cardano";

// Explicit type keeps the generated declarations from pointing into the typhonjs internals
export async function getOkxCardanoWallet(): Promise<CardanoWallet & { address: string }> {
  if (!(window.okxwallet && "cardano" in window.okxwallet)) {
    throw new SwapKitError("wallet_okx_not_found", { chain: Chain.Cardano });
  }

  const api = await window.okxwallet.cardano.enable();

  if ((await api.getNetworkId()) !== 1) {
    throw new SwapKitError("wallet_okx_chain_not_supported", { chain: Chain.Cardano, message: "Mainnet only" });
  }

  const { addCardanoVkeyWitnesses, decodeCardanoWitnessSet, getCardanoAddressFromBytes, getCardanoToolbox } =
    await import("@swapkit/toolboxes/cardano");

  const changeAddress = await api.getChangeAddress();
  const address = changeAddress.startsWith("addr")
    ? changeAddress
    : await getCardanoAddressFromBytes(hex.decode(changeAddress));

  async function signTransaction(transaction: string) {
    const witnesses = await decodeCardanoWitnessSet(await api.signTx(transaction));
    return addCardanoVkeyWitnesses(transaction, witnesses);
  }

  const signer = {
    address,
    connect: () => Promise.resolve({ address }),
    disconnect: () => Promise.resolve(),
    getAddress: () => Promise.resolve(address),
    signTransaction,
  };

  return { ...getCardanoToolbox({ signer }), address };
}
