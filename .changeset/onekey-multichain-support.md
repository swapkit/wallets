---
"@swapkit/wallet-extensions": minor
---

OneKey now connects Sui, Stellar, TON, TRON, Cardano and NEAR on mainnet, alongside its EVM chains. Bitcoin and Solana connections work again: they were looking for wallet providers the OneKey extension never exposes, so connecting either chain always failed. A Sui, TRON or Stellar signature from OneKey is rejected if it covers a different transaction than the one requested.
