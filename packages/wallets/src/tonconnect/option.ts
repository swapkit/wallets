// @swapkit/helpers 5.0.0 shipped without the extensible WalletOption registry
// (swapkit/sdk#346 is unmerged), so TON_CONNECT lives outside the enum until a
// helpers release carries the registry again. Everything except the
// createWallet call site uses this literal type directly.
export const TON_CONNECT = "TON_CONNECT" as const;
export type TonConnectOption = typeof TON_CONNECT;
