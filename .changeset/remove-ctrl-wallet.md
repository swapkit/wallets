---
"@swapkit/wallet-extensions": patch
"@swapkit/wallets": patch
"@swapkit/sdk": patch
---

Remove the discontinued CTRL (formerly XDEFI) wallet connector, injected-provider types, lazy loader and default SDK registration. The `@swapkit/wallet-extensions/ctrl` and `@swapkit/wallets/ctrl` subpaths, `ctrlWallet`, `connectCtrl` and `CTRL_SUPPORTED_CHAINS` are no longer available. Remove these imports and select a supported wallet instead.
