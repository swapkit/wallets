import type { Wallet, WalletModuleFactory } from "@near-wallet-selector/core";
import "@near-wallet-selector/modal-ui-js/styles.css";
import { Chain, filterSupportedChains, SKConfig, SwapKitError, WalletOption } from "@swapkit/helpers";
import { getNearToolbox, type NearSigner } from "@swapkit/toolboxes/near";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { Transaction } from "near-api-js";

// Wallet Selector 10 signs @near-js 2.x transactions, so near-api-js 7 transactions cross over as borsh bytes.
// A transaction the 2.x schema cannot carry byte for byte is refused rather than signed in an altered form.
async function toWalletSelectorTransaction(transaction: Transaction) {
  const [{ encodeTransaction }, { Transaction: WalletSelectorTransaction }] = await Promise.all([
    import("near-api-js"),
    import("@near-js/transactions"),
  ]);
  const bytes = encodeTransaction(transaction);

  try {
    const walletSelectorTransaction = WalletSelectorTransaction.decode(bytes);
    const roundTrip = walletSelectorTransaction.encode();

    if (roundTrip.length !== bytes.length || roundTrip.some((byte, index) => byte !== bytes[index])) {
      throw new Error("The @near-js 2.x encoding differs from the near-api-js 7 encoding");
    }

    return walletSelectorTransaction;
  } catch (error) {
    throw new SwapKitError(
      {
        errorKey: "wallet_near_method_not_supported",
        info: { reason: "Wallet Selector cannot sign this transaction", wallet: WalletOption.WALLET_SELECTOR },
      },
      error,
    );
  }
}

function createNearSigner(wallet: Wallet): NearSigner {
  return {
    getAddress: async () => {
      const accounts = await wallet.getAccounts();
      const accountId = accounts[0]?.accountId;

      if (!accountId) {
        throw new SwapKitError("wallet_connection_rejected_by_user");
      }

      return accountId;
    },

    getPublicKey: () => {
      throw new SwapKitError("wallet_near_method_not_supported");
    },
    signAndSendTransactions: async ({ transactions }: { transactions: Transaction[] }) => {
      const result = await wallet.signAndSendTransactions({
        transactions: await Promise.all(transactions.map(toWalletSelectorTransaction)),
      });
      return result?.[0]?.transaction_outcome.id || "";
    },

    signDelegateAction: () => {
      throw new SwapKitError("wallet_near_method_not_supported");
    },

    signNep413Message: () => {
      throw new SwapKitError("wallet_near_method_not_supported");
    },

    signTransaction: async (transaction: Transaction) => {
      if (!wallet.signTransaction) {
        throw new SwapKitError("wallet_near_method_not_supported");
      }

      const [hash, signedTransaction] = await wallet.signTransaction(await toWalletSelectorTransaction(transaction));
      const { decodeSignedTransaction } = await import("near-api-js");

      return [hash, decodeSignedTransaction(signedTransaction.encode())];
    },
  };
}

function waitForWalletSelection(selector: any, modal: any) {
  return new Promise<void>((resolve) => {
    const subscription = selector.store.observable.subscribe((state: any) => {
      if (state.selectedWalletId) {
        subscription.unsubscribe();
        modal.hide();
        resolve();
      }
    });

    modal.show();
  });
}

async function getWalletMethods(walletFactories?: WalletModuleFactory[]) {
  const { setupWalletSelector } = await import("@near-wallet-selector/core");
  const { setupModal } = await import("@near-wallet-selector/modal-ui-js");

  const contractId = SKConfig.get("integrations")?.nearWalletSelector?.contractId || "";
  const selector = await setupWalletSelector({ modules: [...(walletFactories || [])], network: "mainnet" });

  const isSignedIn = selector.isSignedIn();

  if (!isSignedIn) {
    // Only show modal if not already connected
    const modal = setupModal(selector, { contractId, description: "Connect your NEAR wallet to SwapKit" });

    await waitForWalletSelection(selector, modal);
  }

  const wallet = await selector.wallet();
  const signer = createNearSigner(wallet);
  const toolbox = await getNearToolbox({ signer });
  const address = await signer.getAddress();

  const disconnect = async () => {
    try {
      await wallet.signOut();
    } catch (error) {
      throw new SwapKitError("wallet_connection_rejected_by_user", error);
    }
  };

  return { ...toolbox, address, disconnect };
}

export const walletSelectorWallet = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectWalletSelector(chains: Chain[], walletFactories?: WalletModuleFactory[]) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });

      if (filteredChains.length === 0) {
        throw new SwapKitError("wallet_chain_not_supported", {
          chain: chains[0],
          wallet: WalletOption.WALLET_SELECTOR,
        });
      }

      const walletMethods = await getWalletMethods(walletFactories);

      addChain({ ...walletMethods, balance: [], chain: Chain.Near, walletType });

      return true;
    },
  name: "connectWalletSelector",
  signingSupport: { [Chain.Near]: { direct: true } },
  supportedChains: [Chain.Near],
  walletType: WalletOption.WALLET_SELECTOR,
});

export const WALLET_SELECTOR_SUPPORTED_CHAINS = getWalletSupportedChains(walletSelectorWallet);
