import { type AssetValue, Chain, filterSupportedChains, SKConfig, SwapKitError, WalletOption } from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";

export const radixWallet = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectRadixWallet(chains: Chain[]) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });
      const radixConfig = SKConfig.get("integrations").radix;

      if (!radixConfig) {
        throw new SwapKitError("wallet_radix_not_found");
      }

      await Promise.all(
        filteredChains.map(async (chain) => {
          const walletMethods = await getWalletMethods();

          addChain({ ...walletMethods, chain, walletType });
        }),
      );

      return true;
    },
  // Radix is not in V3 swap chain list
  directSigningSupport: {},
  name: "connectRadixWallet",
  supportedChains: [Chain.Radix],
  walletType: WalletOption.RADIX_WALLET,
});

export const RADIX_SUPPORTED_CHAINS = getWalletSupportedChains(radixWallet);

async function getWalletMethods() {
  const { RadixDappToolkit } = await import("@radixdlt/radix-dapp-toolkit");
  const { getRadixToolbox } = await import("@swapkit/toolboxes/radix");

  const dappConfig = SKConfig.get("integrations").radix;
  const rdt = RadixDappToolkit({ ...dappConfig, networkId: dappConfig.network.networkId });
  const toolbox = getRadixToolbox({ dappConfig });

  function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // TODO: @Towan - Wat is dat?
  await delay(400);

  function getAddress() {
    const existingWalletData = rdt.walletApi.getWalletData();
    const account = existingWalletData?.accounts?.[0];

    return account?.address;
  }

  async function getNewAddress() {
    const { DataRequestBuilder } = await import("@radixdlt/radix-dapp-toolkit");
    rdt.walletApi.setRequestData(DataRequestBuilder.accounts().exactly(1));
    const res = await rdt.walletApi.sendRequest();

    if (!res) {
      throw new SwapKitError("wallet_radix_no_account");
    }

    const newAddress = res.unwrapOr(null)?.accounts[0]?.address;

    if (!newAddress) {
      throw new SwapKitError("wallet_radix_no_account");
    }

    return newAddress;
  }

  const address = getAddress() || (await getNewAddress());

  return {
    address,
    getAddress,
    getBalance: () => toolbox.getBalance(address),
    radixDappToolkit: rdt,
    signAndBroadcast: async ({ manifest, message }: { manifest: string; message: string }) => {
      const tx = await rdt.walletApi.sendTransaction({ message, transactionManifest: manifest });

      const txResult = tx.unwrapOr(null)?.transactionIntentHash;

      if (!txResult) {
        throw new SwapKitError("wallet_radix_transaction_failed");
      }

      return txResult;
    },
    transfer: (_params: { assetValue: AssetValue; recipient: string; from: string }) => {
      throw new SwapKitError("wallet_radix_method_not_supported", { method: "transfer" });
    },
  };
}
