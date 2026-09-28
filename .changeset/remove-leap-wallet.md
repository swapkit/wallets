---
"@swapkit/wallet-extensions": patch
"@swapkit/wallets": patch
"@swapkit/sdk": patch
---

Remove Leap support from the wallet registry, lazy loader and injected provider types. The Keplr connector now accepts only its chain list and connects to Keplr. Integrations must remove Leap from wallet configuration and use a supported wallet instead.
