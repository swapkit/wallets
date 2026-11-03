---
"@swapkit/wallet-extensions": minor
---

OneKey now connects Stellar, TON, TRON and NEAR on mainnet, alongside its EVM chains. Bitcoin and Solana connections work again: they were looking for wallet providers the OneKey extension never exposes, so connecting either chain always failed. A TRON or Stellar signature from OneKey is rejected if it covers a different transaction than the one requested.

Connecting OneKey now asks for one network at a time. If the user cancels an approval, no further approval windows open; networks approved before the cancel stay connected. A network OneKey refuses to connect for a reason other than a cancel, such as Bitcoin with multiple addresses enabled or a TON Connect manifest for another domain, is skipped and the rest still connect.
