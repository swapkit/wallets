import { Chain, filterSupportedChains, SwapKitError, WalletOption } from "@swapkit-dev/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit-dev/wallet-core";

export const petraWallet = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectPetra(chains: Chain[]) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });

      try {
        await Promise.all(
          filteredChains.map(async (chain) => {
            const { address, ...methods } = await getWalletMethods(chain);

            addChain({ ...methods, address, chain, walletType });
          }),
        );

        return true;
      } catch (error) {
        if (error instanceof SwapKitError) throw error;

        throw new SwapKitError("wallet_connection_rejected_by_user", error);
      }
    },
  name: "connectPetra",
  supportedChains: [Chain.Aptos],
  walletType: WalletOption.PETRA,
});

export const PETRA_SUPPORTED_CHAINS = getWalletSupportedChains(petraWallet);
export type PetraSupportedChain = (typeof PETRA_SUPPORTED_CHAINS)[number];

async function getWalletMethods(_chain: PetraSupportedChain) {
  const petra = (window as { aptos?: unknown }).aptos as
    | {
        connect: () => Promise<{ address: string; publicKey: string }>;
        signAndSubmitTransaction: (payload: unknown) => Promise<{ hash: string }>;
        disconnect: () => Promise<void>;
      }
    | undefined;

  if (!petra) {
    throw new SwapKitError("wallet_provider_not_found");
  }

  const { createAptosExtensionTransfer, getAptosToolbox, validateAptosAddress } = await import(
    "@swapkit-dev/toolboxes/aptos"
  );
  const { address } = await petra.connect();

  if (!validateAptosAddress(address)) {
    throw new SwapKitError("wallet_petra_not_found");
  }

  const toolbox = getAptosToolbox();

  return {
    ...toolbox,
    address,
    disconnect: async () => {
      await petra.disconnect();
    },
    transfer: createAptosExtensionTransfer({ provider: petra }),
  };
}
