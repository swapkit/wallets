import type { SolanaProvider } from "@swapkit/toolboxes/solana";
import type { TronSignedTransaction, TronTransaction } from "@swapkit/toolboxes/tron";
import type { Eip1193Provider } from "ethers";
import type { OkxTonConnectEvent } from "../types";

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
  request: (args: { method: string }) => Promise<{ code: number; message: string }>;
  tronWeb?: {
    defaultAddress?: { base58?: string | false };
    trx: { sign: (transaction: TronTransaction) => Promise<TronSignedTransaction> };
  };
};

export type OneKeyTonConnectBridge = {
  connect: (
    protocolVersion: number,
    request: { manifestUrl: string; items: { name: string }[] },
  ) => Promise<OkxTonConnectEvent>;
  restoreConnection: () => Promise<OkxTonConnectEvent>;
  send: (request: {
    id: string;
    method: string;
    params: string[];
  }) => Promise<{ id: string; result?: string; error?: { code: number; message: string } }>;
};

export type OneKeyCardanoApi = {
  getChangeAddress: () => Promise<string>;
  getNetworkId: () => Promise<number>;
  signTx: (transaction: string, partialSign?: boolean) => Promise<string>;
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
  cardano?: { enable: () => Promise<OneKeyCardanoApi> };
  ethereum?: Eip1193Provider;
  jsBridge?: OneKeyJsBridge;
  solana?: SolanaProvider;
  stellar?: OneKeyStellarProvider;
  sui?: OneKeySuiProvider;
  tonconnect?: OneKeyTonConnectBridge;
  tron?: OneKeyTronProvider;
};
