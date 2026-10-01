export type LedgerWalletProviderEventPayloads = {
  accountsChanged: string[];
  chainChanged: string;
  connect: { chainId: string };
  disconnect: { code: number; message: string };
};

export type LedgerWalletProviderEvent = keyof LedgerWalletProviderEventPayloads;

export type LedgerWalletProviderListener<TEvent extends LedgerWalletProviderEvent> = (
  payload: LedgerWalletProviderEventPayloads[TEvent],
) => void;

export type LedgerWalletProviderEip1193 = {
  request: (args: { method: string; params?: readonly unknown[] | object }) => Promise<unknown>;
  on?: <TEvent extends LedgerWalletProviderEvent>(
    event: TEvent,
    listener: LedgerWalletProviderListener<TEvent>,
  ) => unknown;
  removeListener?: <TEvent extends LedgerWalletProviderEvent>(
    event: TEvent,
    listener: LedgerWalletProviderListener<TEvent>,
  ) => unknown;
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
