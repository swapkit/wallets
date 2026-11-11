import type { AminoSignResponse, StdSignature, StdSignDoc } from "@cosmjs/amino";
import type { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import type { EthereumWindowProvider } from "@swapkit/helpers";
import type { OfflineAminoSigner, OfflineDirectSigner } from "@swapkit/toolboxes/cosmos";
import type { StarknetToolboxParams } from "@swapkit/toolboxes/starknet";

export type BitgetBtcProvider = {
  getNetwork?: () => Promise<string>;
  requestAccounts: () => Promise<string[]>;
  signMessage: (message: string, type?: "ecdsa" | "bip322-simple") => Promise<string>;
  signPsbt: (psbtHex: string, options: { autoFinalized?: boolean }) => Promise<string>;
};

export type BitgetKeplrProvider = {
  enable: (chainId: string | string[]) => Promise<void>;
  signAmino: (chainId: string, signer: string, signDoc: StdSignDoc, signOptions: any) => Promise<AminoSignResponse>;
  signArbitrary: (chainId: string, signer: string, data: string | Uint8Array) => Promise<StdSignature>;
  verifyArbitrary: (
    chainId: string,
    signer: string,
    data: string | Uint8Array,
    signature: StdSignature,
  ) => Promise<boolean>;
  getOfflineSignerOnlyAmino: (chainId: string) => OfflineAminoSigner;
  getOfflineSignerAuto: (chainId: string) => Promise<OfflineAminoSigner | OfflineDirectSigner>;
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

export type BitgetNearAction = { type: string; params?: Record<string, unknown> };

type BitgetNearOutcome = { transaction?: { hash?: string }; transaction_outcome?: { id?: string } };

export type BitgetNearResponse = {
  error?: string | { type?: string; message?: string };
  response?: BitgetNearOutcome[] | { error: { message: string } };
};

export type BitgetNearProvider = {
  getAccountId: () => string;
  getPublicKey: () => Promise<{ toString: () => string } | string>;
  isSignedIn: () => boolean;
  requestSignIn: (params: {
    contractId: string;
    methodNames?: string[];
  }) => Promise<{ accessKey?: unknown; error?: string | { type?: string } }>;
  signAndSendTransaction: (params: { receiverId: string; actions: BitgetNearAction[] }) => Promise<BitgetNearResponse>;
};

type StarknetAccount = NonNullable<Extract<StarknetToolboxParams, { signer?: unknown }>["signer"]>;

export type BitgetStarknetProvider = { account?: StarknetAccount; enable: () => Promise<string[]> };

export type BitgetXrpProvider = {
  connect: () => Promise<unknown>;
  sendTransaction: (transaction: Record<string, unknown>) => Promise<unknown>;
};

export type BitgetProviders = BitgetTronProvider & {
  aptos: unknown;
  ethereum: EthereumWindowProvider;
  keplr: BitgetKeplrProvider;
  near: BitgetNearProvider;
  solana: BitgetSolanaProvider;
  suiWallet: BitgetSuiProvider;
  unisat: BitgetBtcProvider;
  xrp: BitgetXrpProvider;
};
