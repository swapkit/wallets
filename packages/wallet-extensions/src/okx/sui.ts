import { base64 } from "@scure/base";
import { Chain, SwapKitError } from "@swapkit/helpers";
import type { SuiWallet } from "@swapkit/toolboxes/sui";

const SUI_MAINNET = "sui:mainnet";

type SuiAccount = { address: string; chains: readonly string[] };
type SuiSignInput = { account: SuiAccount; chain: string; transaction: unknown };
type OkxSuiFeatures = {
  "standard:connect"?: { connect: () => Promise<{ accounts: readonly SuiAccount[] }> };
  "sui:signTransaction"?: { signTransaction: (input: SuiSignInput) => Promise<{ bytes: string; signature: string }> };
};

export async function getOkxSuiWallet(): Promise<SuiWallet & { address: string }> {
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
    throw new SwapKitError("wallet_okx_not_found", { chain: Chain.Sui, message: "No Sui signing feature" });
  }

  const { accounts } = await connect.connect();
  const account = accounts.find(({ chains }) => chains.includes(SUI_MAINNET));

  if (!account) {
    throw new SwapKitError("wallet_okx_chain_not_supported", { chain: Chain.Sui, message: "Mainnet only" });
  }

  const signTransaction = async (txBytes: Uint8Array) => {
    const serialized = base64.encode(txBytes);
    const transaction = { serialize: () => serialized, toJSON: () => Promise.resolve(serialized) };
    const signed = await signFeature.signTransaction({ account, chain: SUI_MAINNET, transaction });

    if (signed.bytes !== serialized) {
      throw new SwapKitError("wallet_okx_chain_not_supported", {
        chain: Chain.Sui,
        message: "Wallet modified the transaction",
      });
    }

    return signed;
  };

  const { getSuiToolbox } = await import("@swapkit/toolboxes/sui");
  const signer = { getAddress: () => account.address, signTransaction, toSuiAddress: () => account.address };

  return { ...getSuiToolbox({ signer }), address: account.address };
}
