/**
 * Structural types for the Ledger Wallet Provider
 * (https://developers.ledger.com/docs/ledger-wallet-provider/overview).
 *
 * They are declared here rather than re-exported from
 * `@ledgerhq/ledger-wallet-provider` so the published `.d.ts` stays free of the
 * SDK's Lit/RxJS type graph, and so the connector keeps working against an
 * already-announced provider it did not initialize itself.
 */

export type LedgerWalletProviderEvent = "accountsChanged" | "chainChanged" | "connect" | "disconnect";

/** The EIP-1193 provider the SDK announces over EIP-6963. */
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

/** Subset of `initializeLedgerProvider` options SwapKit forwards to the SDK. */
export type InitializeLedgerWalletProviderOptions = {
  /** Ledger-issued API key for the dApp. */
  apiKey?: string;
  /** dApp identifier registered with Ledger. */
  dAppIdentifier?: string;
  environment?: "production" | "staging";
  /** Hides the SDK's floating button — the connect/sign modals still render. */
  hideButton?: boolean;
  floatingButtonPosition?: LedgerFloatingButtonPosition;
  floatingButtonTarget?: HTMLElement | string;
  loggerLevel?: "debug" | "error" | "info" | "warn";
  /** Element the SDK mounts its UI into. Defaults to `document.body`. */
  target?: HTMLElement;
};

export type ConnectLedgerWalletProviderOptions = InitializeLedgerWalletProviderOptions & {
  /**
   * Use this already-initialized provider instead of discovering one. Set it
   * when the host app calls `initializeLedgerProvider` itself (for example to
   * mount the Ledger UI inside its own layout).
   */
  provider?: LedgerWalletProviderEip1193;
  /**
   * Whether to call `initializeLedgerProvider` when the page has not announced
   * a Ledger provider yet. Defaults to `true`; set it to `false` to only ever
   * consume a provider the host app mounted.
   */
  initialize?: boolean;
  /** How long to wait for the EIP-6963 announcement, in ms. Defaults to 10000. */
  discoveryTimeout?: number;
};
