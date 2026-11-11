import type { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import type { EthereumWindowProvider } from "@swapkit/helpers";

export type BitgetBtcProvider = {
  getNetwork?: () => Promise<string>;
  requestAccounts: () => Promise<string[]>;
  signMessage: (message: string, type?: "ecdsa" | "bip322-simple") => Promise<string>;
  signPsbt: (psbtHex: string, options: { autoFinalized?: boolean }) => Promise<string>;
};

export type BitgetSolanaTransaction = Transaction | VersionedTransaction;

// Bitget answers either like Phantom or in the Wallet Standard shape, depending on the wallet version
export type BitgetSolanaProvider = {
  connect: () => Promise<{ publicKey?: PublicKey; accounts?: { address: string }[] } | undefined>;
  disconnect: () => Promise<void>;
  publicKey: PublicKey | null;
  signTransaction: (
    transaction: BitgetSolanaTransaction,
  ) => Promise<BitgetSolanaTransaction | { signedTransaction: Uint8Array }[]>;
};

export type BitgetTronProvider = {
  tronLink: { request: (args: { method: string; params?: any }) => Promise<any>; ready: boolean };
  tronWeb: {
    defaultAddress: { base58: string; hex: string };
    trx: {
      sign: (transaction: any) => Promise<any>;
      sendRawTransaction: (signedTransaction: any) => Promise<any>;
      getAccount: (address: string) => Promise<any>;
      getBalance: (address: string) => Promise<number>;
    };
  };
};

export type BitgetSuiAccount = { address: string; chains?: readonly string[] };

export type BitgetSuiProvider = {
  connect: () => Promise<{ accounts: readonly BitgetSuiAccount[] }>;
  signTransaction: (input: {
    account: BitgetSuiAccount;
    chain: string;
    transaction: { serialize: () => string; toJSON: () => Promise<string> };
  }) => Promise<{ bytes: string; signature: string }>;
};

export type BitgetXrpProvider = {
  connect: () => Promise<unknown>;
  signTransaction: (transaction: Record<string, unknown>) => Promise<unknown>;
};

export type BitgetProviders = BitgetTronProvider & {
  aptos: unknown;
  ethereum: EthereumWindowProvider;
  solana: BitgetSolanaProvider;
  suiWallet: BitgetSuiProvider;
  unisat: BitgetBtcProvider;
  xrp: BitgetXrpProvider;
};
