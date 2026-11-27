import type { PublicKey as WalletSelectorPublicKey } from "@near-js/crypto";
import type {
  AccessKey as WalletSelectorAccessKey,
  Action as WalletSelectorAction,
  Signature as WalletSelectorSignature,
  Transaction as WalletSelectorTransaction,
} from "@near-js/transactions";
import type { Wallet, WalletModuleFactory } from "@near-wallet-selector/core";
import "@near-wallet-selector/modal-ui-js/styles.css";
import { Chain, filterSupportedChains, SKConfig, SwapKitError, WalletOption } from "@swapkit/helpers";
import { getNearToolbox, type NearSigner } from "@swapkit/toolboxes/near";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { Transaction } from "near-api-js";

type NearJsCrypto = typeof import("@near-js/crypto");
type NearJsTransactions = typeof import("@near-js/transactions");

// Borsh decoding yields plain objects and number arrays, while Wallet Selector and its modules call into the 2.x
// classes (a KeyPairSigner compares `publicKey.toString()`), so the decoded transaction is rebuilt from them.
function rebuildWalletSelectorTransaction(
  { KeyType, PublicKey }: NearJsCrypto,
  nearJs: NearJsTransactions,
  decoded: WalletSelectorTransaction,
) {
  const {
    AccessKey,
    Action,
    actionCreators,
    DelegateAction,
    GlobalContractDeployMode,
    GlobalContractIdentifier,
    Signature,
    UseGlobalContract,
  } = nearJs;
  const bytes = (value: ArrayLike<number>) => Uint8Array.from(value);
  const keyed = (ed25519?: { data: Uint8Array }, secp256k1?: { data: Uint8Array }) => ({
    data: bytes((ed25519 ?? secp256k1)?.data ?? []),
    keyType: ed25519 ? KeyType.ED25519 : KeyType.SECP256K1,
  });

  const toPublicKey = ({ ed25519Key, secp256k1Key }: WalletSelectorPublicKey) =>
    new PublicKey(keyed(ed25519Key, secp256k1Key));

  const toSignature = ({ ed25519Signature, secp256k1Signature }: WalletSelectorSignature) =>
    new Signature(keyed(ed25519Signature, secp256k1Signature));

  const toAccessKey = ({ nonce, permission: { functionCall } }: WalletSelectorAccessKey) => {
    const { permission } = functionCall
      ? actionCreators.functionCallAccessKey(
          functionCall.receiverId,
          functionCall.methodNames,
          functionCall.allowance ?? undefined,
        )
      : actionCreators.fullAccessKey();

    return new AccessKey({ nonce, permission });
  };

  const toAction = (action: WalletSelectorAction): WalletSelectorAction => {
    const {
      addKey,
      deleteKey,
      deployContract,
      deployGlobalContract,
      functionCall,
      signedDelegate,
      stake,
      useGlobalContract,
    } = action;

    if (action.createAccount) return actionCreators.createAccount();
    if (deployContract) return actionCreators.deployContract(bytes(deployContract.code));
    if (functionCall) {
      const { args, deposit, gas, methodName } = functionCall;
      return actionCreators.functionCall(methodName, bytes(args), gas, deposit);
    }
    if (action.transfer) return actionCreators.transfer(action.transfer.deposit);
    if (stake) return actionCreators.stake(stake.stake, toPublicKey(stake.publicKey));
    if (addKey) return actionCreators.addKey(toPublicKey(addKey.publicKey), toAccessKey(addKey.accessKey));
    if (deleteKey) return actionCreators.deleteKey(toPublicKey(deleteKey.publicKey));
    if (action.deleteAccount) return actionCreators.deleteAccount(action.deleteAccount.beneficiaryId);
    if (signedDelegate) {
      const { delegateAction, signature } = signedDelegate;
      return actionCreators.signedDelegate({
        delegateAction: new DelegateAction({
          ...delegateAction,
          actions: delegateAction.actions.map(toAction),
          publicKey: toPublicKey(delegateAction.publicKey),
        }),
        signature: toSignature(signature),
      });
    }
    if (deployGlobalContract) {
      const { code, deployMode } = deployGlobalContract;
      return actionCreators.deployGlobalContract(bytes(code), new GlobalContractDeployMode(deployMode));
    }
    if (useGlobalContract) {
      const { AccountId, CodeHash } = useGlobalContract.contractIdentifier;
      const contractIdentifier = new GlobalContractIdentifier(CodeHash ? { CodeHash: bytes(CodeHash) } : { AccountId });
      return new Action({ useGlobalContract: new UseGlobalContract({ contractIdentifier }) });
    }

    throw new Error(`Unknown @near-js 2.x action ${Object.keys(action)[0]}`);
  };

  return new nearJs.Transaction({
    actions: decoded.actions.map(toAction),
    blockHash: bytes(decoded.blockHash),
    nonce: decoded.nonce,
    publicKey: toPublicKey(decoded.publicKey),
    receiverId: decoded.receiverId,
    signerId: decoded.signerId,
  });
}

// Wallet Selector 10 signs @near-js 2.x transactions, so near-api-js 7 transactions cross over as borsh bytes.
// A transaction the 2.x schema cannot carry byte for byte is refused rather than signed in an altered form.
async function toWalletSelectorTransaction(transaction: Transaction) {
  const [{ encodeTransaction }, nearJsCrypto, nearJsTransactions] = await Promise.all([
    import("near-api-js"),
    import("@near-js/crypto"),
    import("@near-js/transactions"),
  ]);
  const bytes = encodeTransaction(transaction);

  try {
    const walletSelectorTransaction = rebuildWalletSelectorTransaction(
      nearJsCrypto,
      nearJsTransactions,
      nearJsTransactions.Transaction.decode(bytes),
    );
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
