---
"@swapkit/wallets": patch
"@swapkit/wallet-extensions": patch
"@swapkit/wallet-hardware": patch
---

Adapt to the SwapKit SDK 5.0.0 release surface:

- TON Connect no longer uses the extensible WalletOption registry — helpers 5.0.0
  shipped without it (swapkit/sdk#346 is unmerged). `TON_CONNECT` is now a local
  literal wallet option (`@swapkit/wallets/tonconnect` `option.ts`); runtime
  values and connected-wallet shapes are unchanged, and the registry adoption
  can be restored once a helpers release carries it again.
- Cosmos transfers (OKX extension, Ledger) pass `getDefaultChainFee(Chain.Cosmos)`
  instead of a numeric gas multiplier — the toolboxes 5.0.0 cosmos client
  (backed by `@swapkit/cosmos-signer`) accepts only an explicit `StdFee`.
- Root override pins `@swapkit/cosmos-signer` to 0.1.0: toolboxes 5.0.0 peers on
  0.2.0, which was never published (release-run npm E404). 0.1.0 exports every
  symbol toolboxes imports; drop the override once 0.2.0 is on npm.
