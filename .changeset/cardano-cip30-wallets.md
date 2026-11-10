---
"@swapkit/wallet-extensions": minor
"@swapkit/wallets": minor
---

Cardano browser wallets that follow CIP-30 (Lace, Eternl, Vespr, Yoroi, Typhon and others) can now connect, send and swap. `getCardanoWallets()` lists the wallets injected in the page and `connectCardano(chains, walletKey)` connects the chosen one under the new `WalletOption.CIP30`. Mainnet only; message signing is not available yet.
