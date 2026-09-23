---
"@swapkit/wallet-extensions": patch
---

Phantom: temporarily disable Bitcoin. Phantom deprecated the injected `window.phantom.bitcoin` provider and the Wallet Standard fallback no longer finds a Bitcoin signer, so connecting with every supported chain failed with `wallet_phantom_not_found` and took Ethereum, Monad and Solana down with it. Bitcoin is removed from Phantom's supported chains while the integration is reviewed; the Bitcoin connection code is kept.
