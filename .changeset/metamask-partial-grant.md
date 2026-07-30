---
"@swapkit/wallets": patch
---

MetaMask multichain connect now connects the granted subset of requested chains instead of failing the whole connect when the wallet approves only some scopes; it throws only when nothing was granted.
