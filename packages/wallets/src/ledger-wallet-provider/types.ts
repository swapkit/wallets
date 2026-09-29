import type { getWallets } from "@wallet-standard/app";

export type LedgerWalletProviderEvent = "accountsChanged" | "chainChanged" | "connect" | "disconnect";

export type LedgerWalletProviderEip1193 = {
  request: (args: { method: string; params?: readonly unknown[] | object }) => Promise<unknown>;
  on?: (event: LedgerWalletProviderEvent, listener: (payload: any) => void) => unknown;
  removeListener?: (event: LedgerWalletProviderEvent, listener: (payload: any) => void) => unknown;
  isConnected?: () => boolean;
  disconnect?: () => Promise<void>;
};

export type LedgerWalletProviderDetail = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: LedgerWalletProviderEip1193;
};

export type LedgerFloatingButtonPosition = "bottom-left" | "bottom-right" | "middle-right" | "top-left" | "top-right";

export type InitializeLedgerWalletProviderOptions = {
  apiKey?: string;
  dAppIdentifier?: string;
  environment?: "production" | "staging";
  hideButton?: boolean;
  floatingButtonPosition?: LedgerFloatingButtonPosition;
  floatingButtonTarget?: HTMLElement | string;
  loggerLevel?: "debug" | "error" | "info" | "warn";
  target?: HTMLElement;
};

export type ConnectLedgerWalletProviderOptions = InitializeLedgerWalletProviderOptions & {
  provider?: LedgerWalletProviderEip1193;
  initialize?: boolean;
  discoveryTimeout?: number;
};

type StandardWallet = ReturnType<ReturnType<typeof getWallets>["get"]>[number];

export type LedgerSolanaWalletAccount = StandardWallet["accounts"][number];

export type LedgerSolanaWalletFeatures = {
  "standard:connect": { connect: () => Promise<{ accounts: readonly LedgerSolanaWalletAccount[] }> };
  "standard:disconnect"?: { disconnect: () => Promise<void> };
  "standard:events"?: {
    on: (
      event: "change",
      listener: (properties: { accounts?: readonly LedgerSolanaWalletAccount[] }) => void,
    ) => () => void;
  };
  "solana:signTransaction": {
    signTransaction: (
      ...inputs: { account: LedgerSolanaWalletAccount; transaction: Uint8Array; chain?: string }[]
    ) => Promise<readonly { signedTransaction: Uint8Array }[]>;
  };
};

export type LedgerSolanaWallet = StandardWallet & { readonly features: LedgerSolanaWalletFeatures };
