---
"@swapkit/wallet-extensions": minor
"@swapkit/wallets": minor
---

Bitget Wallet now connects Sui, TON and XRP, and every EVM chain it lists. Chains are connected one at a time, so a chain missing in the wallet is skipped instead of failing the whole connection. Cosmos is no longer offered with Bitget for now: the wallet refuses the Cosmos Hub connection request. Solana, Tron and XRP transactions are checked against what was requested before they are sent, so a transaction the wallet altered is rejected.
