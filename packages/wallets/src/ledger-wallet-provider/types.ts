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
