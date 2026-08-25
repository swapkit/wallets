---
"@swapkit/wallet-extensions": minor
"@swapkit/wallets": minor
---

Add Noir Wallet connector for Zcash (`connectNoirWallet`). Noir Wallet is a shielded-first Zcash browser extension; the connector delegates balance and transaction building to the extension and supports deposit-address swap routes (e.g. NEAR Intents). OP_RETURN memo routes are rejected with a clear error. `NOIR_WALLET` lives outside the `WalletOption` enum (same shim as `TON_CONNECT`) until the helpers registry (swapkit/sdk#346) is released.
