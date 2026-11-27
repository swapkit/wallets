---
"@swapkit/sdk": major
"@swapkit/wallet-extensions": major
"@swapkit/wallet-hardware": major
"@swapkit/wallets": major
---

**NEAR wallets now come from the `near-api-js` 7 toolbox of `@swapkit/toolboxes` 7.** The NEAR wallets these packages connect (Wallet Selector, WalletConnect and the keystore in `@swapkit/wallets`, Ledger in `@swapkit/wallet-hardware`, OneKey in `@swapkit/wallet-extensions`) take and return `near-api-js` 7 transactions, signed transactions and public keys instead of `@near-js/*` 2.x ones. `@swapkit/sdk` bundles these wallets and moves to `@swapkit/core` 6, `@swapkit/plugins` 6, `@swapkit/server` 7 and `@swapkit/wallet-keystore` 7. The `@swapkit/toolboxes` 7 and `@swapkit/plugins` 6 release notes list the NEAR toolbox changes.

To upgrade:

- Upgrade the SwapKit SDK packages (`@swapkit/core`, `@swapkit/plugins`, `@swapkit/toolboxes` and the rest) together with these packages, so every NEAR wallet comes from the same toolbox.
- Uninstall `@near-js/accounts`, `@near-js/crypto` and `@near-js/transactions` if you installed them for SwapKit. To use NEAR, install `near-api-js` 7.5.3. It is now an optional peer dependency of `@swapkit/wallets`, `@swapkit/wallet-hardware` and `@swapkit/wallet-extensions`; `@swapkit/sdk` declares no peer of its own and reaches it through `@swapkit/wallets`. `near-api-js` 7.5.3 declares `engines: { node: ">=22.22.2", pnpm: ">=10.4.1" }`. None of these packages declares an `engines` field, so projects that do not install `near-api-js` are not held to that minimum.

Wallet Selector 10 still signs `@near-js` 2.x transactions, so `@swapkit/wallets` keeps `@near-js/transactions` and `@near-js/crypto` 2.x and hands each transaction to the selected wallet as the same borsh bytes, rebuilt as 2.x classes. A transaction that the 2.x encoding cannot carry unchanged, such as one with a gas key action, is rejected with `wallet_near_method_not_supported` before the wallet sees it.
