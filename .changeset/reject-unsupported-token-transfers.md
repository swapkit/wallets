---
"@swapkit/wallet-extensions": patch
"@swapkit/wallet-hardware": patch
---

KeepKey on Cosmos and XRP, and OKX Wallet on Cosmos, now reject a transfer of a token they cannot send instead of sending the chain's native coin in its place. The error is thrown before the device or the wallet is asked to sign.
