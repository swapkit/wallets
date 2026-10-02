---
"@swapkit/wallets": patch
---

Fix the MetaMask multichain connector. Solana transactions are now signed with `signTransaction`, the method MetaMask authorizes, instead of `solana_signTransaction`, which failed every Solana swap with "not authorized". Wallet errors keep their original code, so rejecting a transaction in MetaMask is reported as a user rejection and contract reverts keep their data. Also updates `@metamask/connect-multichain` to 1.2.0.
