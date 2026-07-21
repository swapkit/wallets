---
"@swapkit/wallet-extensions": minor
"@swapkit/wallets": minor
---

Add Noir Wallet connector for Zcash (`connectNoirWallet`). Noir Wallet is a shielded-first Zcash browser extension; the connector delegates balance and transaction building to the extension and supports deposit-address swap routes (e.g. NEAR Intents). Requires `@swapkit/helpers` with `WalletOption.NOIR_WALLET` and the `wallet_noir_wallet_*` error codes.
