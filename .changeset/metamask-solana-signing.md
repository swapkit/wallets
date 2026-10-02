---
"@swapkit/wallets": patch
---

Sign Solana transactions with MetaMask. The connector asked MetaMask for `solana_signTransaction`, a method the multichain session never authorizes, so every Solana swap failed with "not authorized". It now calls `signTransaction` with the account and scope MetaMask expects and reads the `signedTransaction` it returns. Also updates `@metamask/connect-multichain` to 1.2.0.
