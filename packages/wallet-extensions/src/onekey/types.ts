import type { SolanaProvider } from "@swapkit/toolboxes/solana";
import type { TronSignedTransaction, TronTransaction } from "@swapkit/toolboxes/tron";
import type { Eip1193Provider } from "ethers";
import type { TonConnectBridge } from "../types";

export type OneKeyJsBridge = {
  request: (payload: {
    data: { method: string; params?: unknown };
    scope: string;
  }) => Promise<{ result?: unknown } | undefined>;
};

export type OneKeyBtcProvider = {
  getNetwork: () => Promise<string>;
  requestAccounts: () => Promise<string[]>;
  signPsbt: (psbtHex: string, options: { autoFinalized: boolean }) => Promise<string>;
};

export type OneKeySuiAccount = { address: string; publicKey: string };

export type OneKeySuiProvider = {
  getAccounts: () => Promise<OneKeySuiAccount[]>;
  signTransaction: (input: {
    account: OneKeySuiAccount;
    chain: string;
    transaction: { serialize: () => string };
  }) => Promise<{ bytes: string; signature: string }>;
};

export type OneKeyTronProvider = {
  request: {
    (args: { method: "tron_requestAccounts" }): Promise<{ code: number; message: string }>;
    (args: { method: "tron_accounts" }): Promise<string[]>;
  };
  sign: (transaction: TronTransaction) => Promise<TronSignedTransaction>;
};

export type OneKeyStellarProvider = {
  getAddress: () => Promise<{ address: string }>;
  getNetwork: () => Promise<{ network: string; networkPassphrase: string }>;
  signTransaction: (
    xdr: string,
    options: { networkPassphrase: string },
  ) => Promise<{ signedTxXdr: string; signerAddress?: string }>;
};

export type OneKeyProviders = {
  btc?: OneKeyBtcProvider;
  ethereum?: Eip1193Provider;
  jsBridge?: OneKeyJsBridge;
  solana?: SolanaProvider;
  stellar?: OneKeyStellarProvider;
  sui?: OneKeySuiProvider;
  tonconnect?: TonConnectBridge;
  tron?: OneKeyTronProvider;
};
