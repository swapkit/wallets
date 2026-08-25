// @swapkit/helpers 5.0.x shipped without the extensible WalletOption registry
// (swapkit/sdk#346 is unmerged), so NOIR_WALLET lives outside the enum until a
// helpers release carries the registry — same shim as
// packages/wallets/src/tonconnect/option.ts; unwind both together.
export const NOIR_WALLET = "NOIR_WALLET" as const;
export type NoirWalletOption = typeof NOIR_WALLET;
