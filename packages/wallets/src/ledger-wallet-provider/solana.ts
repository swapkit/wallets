import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import { SwapKitError } from "@swapkit/helpers";
import type { SolanaWallet } from "@swapkit/toolboxes/solana";

import { discoverAfterInitialization } from "./helpers";
import type {
  ConnectLedgerWalletProviderOptions,
  LedgerSolanaWallet,
  LedgerSolanaWalletAccount,
  LedgerSolanaWalletFeatures,
  StandardWallet,
} from "./types";

const LEDGER_SOLANA_WALLET_NAME = "Ledger";
const SOLANA_MAINNET = "solana:mainnet";

function isLedgerSolanaWallet(wallet: StandardWallet): wallet is LedgerSolanaWallet {
  return (
    wallet.name === LEDGER_SOLANA_WALLET_NAME &&
    wallet.chains.includes(SOLANA_MAINNET) &&
    "standard:connect" in wallet.features &&
    "solana:signTransaction" in wallet.features
  );
}

async function discoverLedgerSolanaWallet({ timeout }: { timeout: number }): Promise<LedgerSolanaWallet | undefined> {
  if (typeof window === "undefined") return undefined;

  const { getWallets } = await import("@wallet-standard/app");
  const wallets = getWallets();
  const registered = wallets.get().find(isLedgerSolanaWallet);
  if (registered) return registered;

  return new Promise((resolve) => {
    const timer = setTimeout(() => settle(undefined), timeout);
    const off = wallets.on("register", (...added) => {
      const wallet = added.find(isLedgerSolanaWallet);
      if (wallet) settle(wallet);
    });

    function settle(wallet: LedgerSolanaWallet | undefined) {
      clearTimeout(timer);
      off();
      resolve(wallet);
    }
  });
}

function resolveLedgerSolanaWallet(options: Omit<ConnectLedgerWalletProviderOptions, "provider"> = {}) {
  return discoverAfterInitialization({
    discover: discoverLedgerSolanaWallet,
    notAnnouncedMessage: "Ledger Solana wallet did not register; Solana may be disabled for this dApp.",
    notInitializedMessage: "No Ledger Solana wallet registered; initialize the SDK first.",
    options,
  });
}

function getLedgerSolanaAccount(accounts: readonly LedgerSolanaWalletAccount[]): LedgerSolanaWalletAccount | undefined {
  return accounts.find(({ chains }) => chains.includes(SOLANA_MAINNET));
}

function isEmptySignature(signature: Uint8Array | null | undefined) {
  return !signature || signature.every((byte) => byte === 0);
}

function createLedgerSolanaSigner({
  account,
  disconnect,
  features,
  isConnected,
  web3: { PublicKey, Transaction, VersionedTransaction },
}: {
  account: LedgerSolanaWalletAccount;
  disconnect: () => Promise<void>;
  features: LedgerSolanaWalletFeatures;
  isConnected: () => boolean;
  web3: typeof import("@solana/web3.js");
}) {
  const publicKey = new PublicKey(account.address);

  function getSignature(transaction: Transaction | VersionedTransaction) {
    if (transaction instanceof VersionedTransaction) {
      const { header, staticAccountKeys } = transaction.message;
      const index = staticAccountKeys.slice(0, header.numRequiredSignatures).findIndex((key) => key.equals(publicKey));

      return index === -1 ? undefined : transaction.signatures[index];
    }

    return transaction.signatures.find((entry) => entry.publicKey.equals(publicKey))?.signature;
  }

  async function signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    if (!isConnected()) {
      throw new SwapKitError("wallet_ledger_wallet_provider_no_accounts", {
        message: "Ledger Wallet no longer gives access to this Solana account; connect it again.",
      });
    }

    const serialized =
      transaction instanceof VersionedTransaction
        ? transaction.serialize()
        : transaction.serialize({ requireAllSignatures: false, verifySignatures: false });

    const [result] = await features["solana:signTransaction"].signTransaction({
      account,
      chain: SOLANA_MAINNET,
      transaction: new Uint8Array(serialized),
    });

    if (!result) throw new SwapKitError("wallet_ledger_wallet_provider_signing_failed");

    const signed = (
      transaction instanceof VersionedTransaction
        ? VersionedTransaction.deserialize(result.signedTransaction)
        : Transaction.from(result.signedTransaction)
    ) as T;

    // Guard in case the wallet hands the transaction back without our signature
    if (isEmptySignature(getSignature(signed))) {
      throw new SwapKitError("wallet_ledger_wallet_provider_signing_failed", {
        message: "Ledger Wallet returned an unsigned Solana transaction.",
      });
    }

    return signed;
  }

  return { connect: () => Promise.resolve({ publicKey }), disconnect, publicKey, signTransaction };
}

export async function connectLedgerSolana({
  onAccount,
  options,
}: {
  onAccount: (wallet: { address: string; disconnect: () => Promise<void>; toolbox: SolanaWallet }) => void;
  options: Omit<ConnectLedgerWalletProviderOptions, "provider">;
}) {
  const [{ getSolanaToolbox }, web3] = await Promise.all([
    import("@swapkit/toolboxes/solana"),
    import("@solana/web3.js"),
  ]);
  const wallet = await resolveLedgerSolanaWallet(options);
  const { accounts } = await wallet.features["standard:connect"].connect();
  const account = getLedgerSolanaAccount(accounts);

  if (!account) throw new SwapKitError("wallet_ledger_wallet_provider_no_accounts");

  let connectedAddress = account.address;
  let connected = true;

  function release() {
    connected = false;
    offChange?.();
  }

  function addAccount(nextAccount: LedgerSolanaWalletAccount) {
    connectedAddress = nextAccount.address;
    const signer = createLedgerSolanaSigner({
      account: nextAccount,
      disconnect: disconnectLedgerSolana,
      features: wallet.features,
      isConnected: () => connected,
      web3,
    });

    onAccount({
      address: nextAccount.address,
      disconnect: disconnectLedgerSolana,
      toolbox: getSolanaToolbox({ signer }),
    });
  }

  async function disconnectLedgerSolana() {
    release();
    await wallet.features["standard:disconnect"]?.disconnect();
  }

  const offChange = wallet.features["standard:events"]?.on("change", ({ accounts: nextAccounts }) => {
    if (!(connected && nextAccounts)) return;

    const nextAccount = getLedgerSolanaAccount(nextAccounts);
    // Ledger reports lost access as an account list without a Solana account
    if (!nextAccount) release();
    else if (nextAccount.address !== connectedAddress) addAccount(nextAccount);
  });

  addAccount(account);
}
