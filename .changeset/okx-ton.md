---
"@swapkit/wallet-extensions": minor
"@swapkit/wallets": minor
---

OKX Wallet now connects TON through the TON Connect bridge OKX injects as `window.okxTonWallet`. The first connection needs a TON Connect manifest URL in `SKConfig.integrations.tonConnect.manifestUrl`, the same one the TON Connect wallet uses. Sweeping the whole balance is not supported over TON Connect.
