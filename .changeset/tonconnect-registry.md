---
"@swapkit/wallets": patch
---

`TON_CONNECT` now registers through the `@swapkit/helpers` 5.1.0 extensible `WalletOption` registry (swapkit/sdk#346) instead of the interim outside-the-enum literal shim. No behavior change — the runtime value stays `"TON_CONNECT"`.
