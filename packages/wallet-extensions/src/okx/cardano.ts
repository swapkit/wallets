import { bech32, hex } from "@scure/base";
import { Chain, SwapKitError } from "@swapkit/helpers";

export async function getOkxCardanoWallet() {
  if (!(window.okxwallet && "cardano" in window.okxwallet)) {
    throw new SwapKitError("wallet_okx_not_found", { chain: Chain.Cardano });
  }

  const api = await window.okxwallet.cardano.enable();

  if ((await api.getNetworkId()) !== 1) {
    throw new SwapKitError("wallet_okx_chain_not_supported", { chain: Chain.Cardano, message: "Mainnet only" });
  }

  const address = toBech32Address(await api.getChangeAddress());
  const { getCardanoToolbox } = await import("@swapkit/toolboxes/cardano");

  const signer = {
    address,
    connect: () => Promise.resolve({ address }),
    disconnect: () => Promise.resolve(),
    getAddress: () => Promise.resolve(address),
    signTransaction: async (transaction: string) => addWitnesses(transaction, await api.signTx(transaction)),
  };

  return { ...getCardanoToolbox({ signer }), address };
}

function toBech32Address(address: string) {
  if (address.startsWith("addr")) return address;
  return bech32.encode("addr", bech32.toWords(hex.decode(address)), 1023);
}

// CIP-30 signTx returns only the witness set, the toolbox broadcasts the full transaction
async function addWitnesses(transaction: string, signed: string) {
  const { Decoder, Encoder } = await import("@stricahq/cbors");
  const signedValue = Decoder.decode(Buffer.from(signed, "hex")).value;
  if (Array.isArray(signedValue)) return signed;

  const [body, witnesses, isValid, auxiliaryData] = Decoder.decode(Buffer.from(transaction, "hex")).value;
  const witnessMap: Map<unknown, unknown> = witnesses instanceof Map ? witnesses : new Map();

  for (const [key, value] of signedValue as Map<unknown, unknown>) {
    const existing = witnessMap.get(key);
    witnessMap.set(key, Array.isArray(existing) && Array.isArray(value) ? [...existing, ...value] : value);
  }

  return Encoder.encode([body, witnessMap, isValid, auxiliaryData]).toString("hex");
}
