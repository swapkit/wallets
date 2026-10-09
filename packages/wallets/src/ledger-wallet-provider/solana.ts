import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import { SwapKitError } from "@swapkit/helpers";
import type { SolanaWallet } from "@swapkit/toolboxes/solana";

import { initializeLedgerWalletProvider } from "./helpers";
import type {
  ConnectLedgerWalletProviderOptions,
  LedgerSolanaWallet,
  LedgerSolanaWalletAccount,
  LedgerSolanaWalletFeatures,
} from "./types";

const LEDGER_SOLANA_WALLET_NAME = "Ledger";
const SOLANA_MAINNET = "solana:mainnet";
const DEFAULT_DISCOVERY_TIMEOUT = 10_000;
const REGISTERED_WALLET_PROBE_TIMEOUT = 250;

const REGISTER_WALLET_EVENT = "wallet-standard:register-wallet";
const APP_READY_EVENT = "wallet-standard:app-ready";

type RegisterWalletCallback = (api: { register: (...wallets: unknown[]) => () => void }) => void;

function isLedgerSolanaWallet(wallet: unknown): wallet is LedgerSolanaWallet {
  if (typeof wallet !== "object" || wallet === null) return false;

  const { chains, features, name } = wallet as Partial<LedgerSolanaWallet>;
  if (!(Array.isArray(chains) && features)) return false;

  return (
    name === LEDGER_SOLANA_WALLET_NAME &&
    chains.includes(SOLANA_MAINNET) &&
    "standard:connect" in features &&
    "solana:signTransaction" in features
  );
}

// Same handshake as @wallet-standard/app's getWallets: already registered wallets answer app-ready, late ones dispatch register-wallet
export function discoverLedgerSolanaWallet({
  timeout = DEFAULT_DISCOVERY_TIMEOUT,
}: {
  timeout?: number;
} = {}): Promise<LedgerSolanaWallet | undefined> {
  if (typeof window === "undefined") return Promise.resolve(undefined);

  return new Promise((resolve) => {
    let settled = false;
    const api = {
      register: (...wallets: unknown[]) => {
        const wallet = wallets.find(isLedgerSolanaWallet);
        if (wallet) settle(wallet);
        return () => {};
      },
    };

    function onRegisterWallet(event: Event) {
      (event as CustomEvent<RegisterWalletCallback>).detail?.(api);
    }

    function settle(wallet: LedgerSolanaWallet | undefined) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener(REGISTER_WALLET_EVENT, onRegisterWallet);
      resolve(wallet);
    }

    const timer = setTimeout(() => settle(undefined), timeout);

    window.addEventListener(REGISTER_WALLET_EVENT, onRegisterWallet);
    window.dispatchEvent(new CustomEvent(APP_READY_EVENT, { detail: api }));
  });
}

export async function resolveLedgerSolanaWallet({
  initialize = true,
  discoveryTimeout = DEFAULT_DISCOVERY_TIMEOUT,
  ...initializeOptions
}: Omit<ConnectLedgerWalletProviderOptions, "provider"> = {}) {
  const registered = await discoverLedgerSolanaWallet({
    timeout: initialize ? REGISTERED_WALLET_PROBE_TIMEOUT : discoveryTimeout,
  });
  if (registered) return registered;

  if (!initialize) {
    throw new SwapKitError("wallet_ledger_wallet_provider_not_announced", {
      message: "No Ledger Solana wallet registered; initialize the SDK first.",
    });
  }

  await initializeLedgerWalletProvider(initializeOptions);

  const initialized = await discoverLedgerSolanaWallet({ timeout: discoveryTimeout });

  if (!initialized) {
    throw new SwapKitError("wallet_ledger_wallet_provider_not_announced", {
      message: "Ledger Solana wallet did not register; Solana may be disabled for this dApp.",
    });
  }

  return initialized;
}

export function getLedgerSolanaAccount(
  accounts: readonly LedgerSolanaWalletAccount[],
): LedgerSolanaWalletAccount | undefined {
  return accounts.find(({ chains }) => chains.includes(SOLANA_MAINNET));
}

function isEmptySignature(signature: Uint8Array | null | undefined) {
  return !signature || signature.every((byte) => byte === 0);
}

export async function createLedgerSolanaSigner({
  account,
  features,
}: {
  account: LedgerSolanaWalletAccount;
  features: LedgerSolanaWalletFeatures;
}) {
  const { PublicKey, Transaction, VersionedTransaction } = await import("@solana/web3.js");
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
    const serialized =
      transaction instanceof VersionedTransaction
        ? transaction.serialize()
        : transaction.serialize({ requireAllSignatures: false, verifySignatures: false });

    const [result] = await features["solana:signTransaction"].signTransaction({
      account,
      chain: SOLANA_MAINNET,
      transaction: new Uint8Array(serialized),
    });

    if (!result) throw new SwapKitError("wallet_ledger_wallet_provider_signing_unsupported");

    const signed = (
      transaction instanceof VersionedTransaction
        ? VersionedTransaction.deserialize(result.signedTransaction)
        : Transaction.from(result.signedTransaction)
    ) as T;

    // Ledger's SDK still stubs Solana transaction signing and echoes the unsigned bytes back
    if (isEmptySignature(getSignature(signed))) {
      throw new SwapKitError("wallet_ledger_wallet_provider_signing_unsupported", {
        message: "Ledger Wallet returned an unsigned Solana transaction.",
      });
    }

    return signed;
  }

  return {
    connect: () => Promise.resolve({ publicKey }),
    disconnect: () => features["standard:disconnect"]?.disconnect() ?? Promise.resolve(),
    publicKey,
    signTransaction,
  };
}

export async function connectLedgerSolana({
  onAccount,
  options,
}: {
  onAccount: (wallet: { address: string; toolbox: SolanaWallet }) => void;
  options: Omit<ConnectLedgerWalletProviderOptions, "provider">;
}) {
  const wallet = await resolveLedgerSolanaWallet(options);
  const { accounts } = await wallet.features["standard:connect"].connect();
  const account = getLedgerSolanaAccount(accounts);

  if (!account) throw new SwapKitError("wallet_ledger_wallet_provider_no_accounts");

  const { getSolanaToolbox } = await import("@swapkit/toolboxes/solana");
  let connectedAddress = account.address;

  async function addAccount(nextAccount: LedgerSolanaWalletAccount) {
    const signer = await createLedgerSolanaSigner({ account: nextAccount, features: wallet.features });
    if (nextAccount.address !== connectedAddress) return;

    onAccount({ address: nextAccount.address, toolbox: getSolanaToolbox({ signer }) });
  }

  await addAccount(account);

  const offChange = wallet.features["standard:events"]?.on("change", ({ accounts: nextAccounts }) => {
    const nextAccount = nextAccounts && getLedgerSolanaAccount(nextAccounts);
    if (!nextAccount || nextAccount.address === connectedAddress) return;

    connectedAddress = nextAccount.address;
    void addAccount(nextAccount);
  });

  return async function disconnectLedgerSolana() {
    offChange?.();
    await wallet.features["standard:disconnect"]?.disconnect();
  };
}
