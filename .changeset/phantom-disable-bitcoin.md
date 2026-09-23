---
"@swapkit/wallet-extensions": patch
---

Phantom: disable Bitcoin. Phantom deprecated the injected `window.phantom.bitcoin` provider and the Wallet Standard fallback no longer finds a Bitcoin signer, so connecting with every supported chain failed with `wallet_phantom_not_found` and took Ethereum, Monad and Solana down with it. Phantom now connects Ethereum, Monad and Solana only; `getBitcoinAccess` and the `@wallet-standard/app` peer dependency are removed.
