import { base64 } from "@scure/base";
import { Chain, SwapKitError } from "@swapkit/helpers";

const SUI_MAINNET = "sui:mainnet";

type SuiAccount = { address: string; chains: readonly string[] };
type SuiSignInput = { account: SuiAccount; chain: string; transaction: unknown };
type OkxSuiFeatures = {
  "standard:connect"?: { connect: () => Promise<{ accounts: readonly SuiAccount[] }> };
  "sui:signTransaction"?: { signTransaction: (input: SuiSignInput) => Promise<{ bytes: string; signature: string }> };
};

export async function getOkxSuiWallet() {
  const { getWallets } = await import("@wallet-standard/app");
  const wallet = getWallets()
    .get()
    .find(({ chains, name }) => name === "OKX Wallet" && chains.includes(SUI_MAINNET));
  const features = wallet?.features as OkxSuiFeatures | undefined;
  const connect = features?.["standard:connect"];

  if (!(features && connect)) {
    throw new SwapKitError("wallet_okx_not_found", { chain: Chain.Sui });
  }

  const signFeature = features["sui:signTransaction"];

  if (!signFeature) {
    throw new SwapKitError("wallet_okx_chain_not_supported", { chain: Chain.Sui });
  }

  const { accounts } = await connect.connect();
  const account = accounts.find(({ chains }) => chains.includes(SUI_MAINNET));

  if (!account) {
    throw new SwapKitError("wallet_okx_chain_not_supported", { chain: Chain.Sui, message: "Mainnet only" });
  }

  const signTransaction = (txBytes: Uint8Array) => {
    const serialized = base64.encode(txBytes);
    const transaction = { serialize: () => serialized, toJSON: () => Promise.resolve(serialized) };
    return signFeature.signTransaction({ account, chain: SUI_MAINNET, transaction });
  };

  const { getSuiToolbox } = await import("@swapkit/toolboxes/sui");
  const signer = { getAddress: () => account.address, signTransaction, toSuiAddress: () => account.address };

  return { ...getSuiToolbox({ signer }), address: account.address };
}
