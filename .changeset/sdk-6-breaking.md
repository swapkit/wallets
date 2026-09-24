---
"@swapkit/sdk": major
"@swapkit/wallets": major
"@swapkit/wallet-hardware": major
---

**Built on SwapKit SDK 6 (`@swapkit/helpers`, `@swapkit/toolboxes`, `@swapkit/server` and `@swapkit/wallet-keystore` 6.0.0), which breaks public API these packages expose.**

- `@swapkit/sdk` re-exports the SDK, so the SDK 6 removals reach its consumers: `SKConfig` `envs.isStagenet`, the `StagenetChain` enum with its chain configs, and the APIs the SDK had already deprecated. A UTXO toolbox given a `derivationPath` now needs its `scriptType` too.
- NEAR wallets built on the NEAR toolbox (Ledger, NEAR Wallet Selector and WalletConnect) no longer have the deprecated `estimateGas`; use `estimateGasLimit`.
- UTXO wallets fail at connect when the account address is one the SDK cannot spend from (such as P2WSH) or belongs to another chain, instead of failing at send.
