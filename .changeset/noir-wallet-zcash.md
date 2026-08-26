---
"@swapkit/wallet-extensions": minor
"@swapkit/wallets": minor
---

Add Noir Wallet connector for Zcash (`connectNoirWallet`). Noir Wallet is a shielded-first Zcash browser extension; the connector delegates balance and transaction building to the extension and supports deposit-address swap routes (e.g. NEAR Intents). OP_RETURN memo routes are rejected with `wallet_noir_wallet_memo_not_supported`. `NOIR_WALLET` and the `wallet_noir_wallet_*` error codes (80101-80103) register through the `@swapkit/helpers` 5.1.0 extensible registries.
