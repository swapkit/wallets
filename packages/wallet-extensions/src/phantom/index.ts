import {
  type AssetValue,
  Chain,
  filterSupportedChains,
  type GenericTransferParams,
  SwapKitError,
  WalletOption,
} from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { ExtensionWallet } from "../walletTypes";

export const phantomWallet: ExtensionWallet<"connectPhantom"> = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectPhantom(chains: Chain[]) {
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
  directSigningSupport: { [Chain.Ethereum]: true, [Chain.Monad]: true, [Chain.Solana]: true },
  name: "connectPhantom",
  supportedChains: [Chain.Ethereum, Chain.Monad, Chain.Solana],
  walletType: WalletOption.PHANTOM,
});

export const PHANTOM_SUPPORTED_CHAINS = getWalletSupportedChains(phantomWallet);
export type PhantomSupportedChain = (typeof PHANTOM_SUPPORTED_CHAINS)[number];

async function getWalletMethods(chain: PhantomSupportedChain) {
  const phantom: any = window?.phantom;

  switch (chain) {
    case Chain.Ethereum:
    case Chain.Monad: {
      const { getEvmToolboxAsync } = await import("@swapkit/toolboxes/evm");
      const { prepareNetworkSwitch } = await import("@swapkit/helpers");
      const { BrowserProvider } = await import("ethers");

      const provider = new BrowserProvider(phantom?.ethereum, "any");
      const [address] = await provider.send("eth_requestAccounts", []);

      const signer = await provider.getSigner();
      const toolbox = await getEvmToolboxAsync(chain, { provider, signer });

      return { ...prepareNetworkSwitch({ chain, provider, toolbox }), address };
    }

    case Chain.Solana: {
      const { getSolanaToolbox } = await import("@swapkit/toolboxes/solana");
      const provider = phantom?.solana;
      if (!provider?.isPhantom) {
        throw new SwapKitError("wallet_phantom_not_found");
      }

      const providerConnection = await provider.connect();
      const address: string = providerConnection.publicKey.toString();
      const toolbox = getSolanaToolbox({ signer: provider });

      const transfer = async ({
        recipient,
        assetValue,
        isProgramDerivedAddress,
        memo,
      }: GenericTransferParams & { assetValue: AssetValue; isProgramDerivedAddress?: boolean }) => {
        const { PublicKey } = await import("@solana/web3.js");

        if (!(isProgramDerivedAddress || toolbox.validateAddress(recipient))) {
          throw new SwapKitError("core_transaction_invalid_recipient_address");
        }

        const fromPubkey = new PublicKey(address);
        const connection = await toolbox.getConnection();

        const transaction = await toolbox.createTransaction({
          assetValue,
          isProgramDerivedAddress,
          memo,
          recipient,
          sender: address,
        });

        if (!transaction) {
          throw new SwapKitError("core_transaction_invalid_sender_address");
        }

        const blockHash = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockHash.blockhash;
        transaction.feePayer = fromPubkey;

        const signedTransaction = await provider.signTransaction(transaction);

        const txid = await connection.sendRawTransaction(signedTransaction.serialize());

        return txid;
      };

      return { ...toolbox, address, transfer };
    }

    default: {
      throw new SwapKitError("wallet_chain_not_supported", { chain, wallet: WalletOption.PHANTOM });
    }
  }
}
