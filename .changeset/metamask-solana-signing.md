---
"@swapkit/wallets": patch
---

Sign Solana transactions with MetaMask. The connector asked MetaMask for `solana_signTransaction`, a method the multichain session never authorizes, so every Solana swap failed with "The requested account and/or method has not been authorized by the user". It now calls `signTransaction` with the account and scope MetaMask expects and reads the `signedTransaction` it returns.
