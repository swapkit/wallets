---
"@swapkit/wallets": patch
---

TON Connect now reads its manifest URL from `SKConfig.integrations.tonConnect.manifestUrl` when none is passed to `connectTonConnect`, matching how other wallets read their configuration. An explicitly passed `manifestUrl` still takes precedence.
