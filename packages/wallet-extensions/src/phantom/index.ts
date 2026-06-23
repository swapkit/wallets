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
  directSigningSupport: { [Chain.Bitcoin]: true, [Chain.Ethereum]: true, [Chain.Monad]: true, [Chain.Solana]: true },
  name: "connectPhantom",
  supportedChains: [Chain.Bitcoin, Chain.Ethereum, Chain.Monad, Chain.Solana],
  walletType: WalletOption.PHANTOM,
});

export const PHANTOM_SUPPORTED_CHAINS = getWalletSupportedChains(phantomWallet);
export type PhantomSupportedChain = (typeof PHANTOM_SUPPORTED_CHAINS)[number];

type BitcoinAccess = { address: string; signPsbt: (psbt: Uint8Array, signingIndexes: number[]) => Promise<Uint8Array> };

// Minimal shape of the Bitcoin Wallet Standard features Phantom registers.
// See https://github.com/MetaMask/bitcoin-wallet-standard
type WalletStandardAccount = { readonly address: string };
type BitcoinStandardWallet = {
  readonly name: string;
  readonly features: {
    "bitcoin:connect"?: {
      connect: (input: {
        purposes: ("payment" | "ordinals")[];
      }) => Promise<{ accounts: readonly WalletStandardAccount[] }>;
    };
    "bitcoin:signTransaction"?: {
      signTransaction: (
        ...inputs: { psbt: Uint8Array; inputsToSign: { account: WalletStandardAccount; signingIndexes: number[] }[] }[]
      ) => Promise<readonly { signedPsbt: Uint8Array }[]>;
    };
  };
};

/**
 * Resolves a Bitcoin signing surface for Phantom.
 *
 * Phantom has deprecated the injected `window.phantom.bitcoin` provider and newer builds expose
 * Bitcoin only through the Wallet Standard registry (Solana/EVM are still injected, which is why
 * those chains keep working). We therefore prefer the legacy injected provider when present to
 * avoid changing behaviour for existing users, and fall back to Wallet Standard discovery.
 */
export async function getBitcoinAccess(phantom: any): Promise<BitcoinAccess> {
  const injected = phantom?.bitcoin;
  if (injected?.isPhantom) {
    const [{ address }] = await injected.requestAccounts();

    return {
      address,
      signPsbt: async (psbt, signingIndexes) =>
        new Uint8Array(await injected.signPSBT(psbt, { inputsToSign: [{ address, signingIndexes }] })),
    };
  }

  const { getWallets } = await import("@wallet-standard/app");
  const wallet = getWallets()
    .get()
    .find(
      (candidate) =>
        candidate.name === "Phantom" &&
        "bitcoin:connect" in candidate.features &&
        "bitcoin:signTransaction" in candidate.features,
    ) as unknown as BitcoinStandardWallet | undefined;

  const connectFeature = wallet?.features["bitcoin:connect"];
  const signFeature = wallet?.features["bitcoin:signTransaction"];
  if (!(connectFeature && signFeature)) {
    throw new SwapKitError("wallet_phantom_not_found");
  }

  const { accounts } = await connectFeature.connect({ purposes: ["payment"] });
  const [account] = accounts;
  if (!account) {
    throw new SwapKitError("wallet_phantom_not_found");
  }

  return {
    address: account.address,
    signPsbt: async (psbt, signingIndexes) => {
      const [result] = await signFeature.signTransaction({ inputsToSign: [{ account, signingIndexes }], psbt });
      if (!result) {
        throw new SwapKitError("core_transaction_failed");
      }

      return result.signedPsbt;
    },
  };
}

async function getWalletMethods(chain: PhantomSupportedChain) {
  const phantom: any = window?.phantom;

  switch (chain) {
    case Chain.Bitcoin: {
      const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");
      const { Transaction } = await import("@swapkit/utxo-signer");
      const { address, signPsbt } = await getBitcoinAccess(phantom);

      async function signTransaction(tx: InstanceType<typeof Transaction>) {
        const signedPsbtBytes = await signPsbt(
          tx.toPSBT(),
          Array.from({ length: tx.inputsLength }, (_, i) => i),
        );

        return Transaction.fromPSBT(new Uint8Array(signedPsbtBytes));
      }

      const signer = { getAddress: () => Promise.resolve(address), signTransaction };
      const toolbox = getUtxoToolbox(chain, { signer });

      return { ...toolbox, address };
    }

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
