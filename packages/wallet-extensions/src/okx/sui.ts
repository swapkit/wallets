import { Chain, SwapKitError } from "@swapkit/helpers";

const SUI_MAINNET = "sui:mainnet";

type SuiAccount = { address: string; chains: readonly string[] };
type SignInput = { account: SuiAccount; chain: string; transaction?: unknown; transactionBlock?: unknown };
type OkxSuiFeatures = {
  "standard:connect"?: { connect: () => Promise<{ accounts: readonly SuiAccount[] }> };
  "sui:signTransaction"?: { signTransaction: (input: SignInput) => Promise<{ bytes: string; signature: string }> };
  "sui:signTransactionBlock"?: {
    signTransactionBlock: (input: SignInput) => Promise<{ transactionBlockBytes: string; signature: string }>;
  };
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

  const { accounts } = await connect.connect();
  const account = accounts.find(({ chains }) => chains.includes(SUI_MAINNET)) ?? accounts[0];

  if (!account) {
    throw new SwapKitError("wallet_okx_no_accounts", { chain: Chain.Sui });
  }

  const signTransaction = async (txBytes: Uint8Array) => {
    const serialized = Buffer.from(txBytes).toString("base64");
    const transaction = { serialize: () => serialized, toJSON: () => Promise.resolve(serialized) };
    const signFeature = features?.["sui:signTransaction"];

    if (signFeature) {
      const { bytes, signature } = await signFeature.signTransaction({ account, chain: SUI_MAINNET, transaction });
      return { bytes, signature };
    }

    const legacyFeature = features?.["sui:signTransactionBlock"];
    if (!legacyFeature) {
      throw new SwapKitError("wallet_okx_chain_not_supported", { chain: Chain.Sui });
    }

    const { transactionBlockBytes, signature } = await legacyFeature.signTransactionBlock({
      account,
      chain: SUI_MAINNET,
      transactionBlock: transaction,
    });
    return { bytes: transactionBlockBytes, signature };
  };

  const signer = { getAddress: () => account.address, signTransaction, toSuiAddress: () => account.address };

  const { getSuiToolbox } = await import("@swapkit/toolboxes/sui");

  return { ...getSuiToolbox({ signer }), address: account.address };
}
