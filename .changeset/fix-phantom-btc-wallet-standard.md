---
"@swapkit/wallet-extensions": patch
---

Fix Phantom Bitcoin connection failing with `wallet_phantom_not_found`. Phantom deprecated the injected `window.phantom.bitcoin` provider and newer builds expose Bitcoin only through the Wallet Standard registry. Connecting now prefers the legacy injected provider when present and falls back to discovering Phantom via Wallet Standard (`bitcoin:connect` / `bitcoin:signTransaction`).
