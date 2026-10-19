---
"@swapkit/wallet-hardware": patch
"@swapkit/wallets": patch
---

Keystore and Ledger wallets now read Sui balances through the SwapKit API instead of Sui's public fullnode, which stopped serving JSON-RPC and made every funded Sui wallet show a zero balance. The toolbox RPC path is only used as a fallback when the API cannot be reached.
