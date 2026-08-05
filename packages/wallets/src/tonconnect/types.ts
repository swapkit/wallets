import type { TonConnectUI, TonConnectUiCreateOptions } from "@tonconnect/ui";

export type TonConnectConfig = {
  /**
   * Reuse an existing TonConnectUI instance (e.g. the one created by
   * `@tonconnect/ui-react`'s TonConnectUIProvider). When provided, `manifestUrl`
   * and `uiOptions` are ignored.
   */
  instance?: TonConnectUI;
  /**
   * URL of the dApp's publicly hosted tonconnect-manifest.json.
   * Required when no `instance` is provided.
   * @see https://docs.ton.org/applications/ton-connect/get-started
   */
  manifestUrl?: string;
  /**
   * Extra TonConnectUI creation options (theme, wallets list configuration, etc.)
   * forwarded when SwapKit creates the instance.
   */
  uiOptions?: Omit<TonConnectUiCreateOptions, "manifestUrl">;
  /**
   * How long (in seconds) a sendTransaction request stays valid before the
   * wallet refuses it (`validUntil`). Defaults to 300 seconds.
   */
  requestTimeoutSeconds?: number;
};
