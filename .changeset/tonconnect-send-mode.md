---
"@swapkit/wallets": patch
---

TON Connect now rejects transactions whose `sendMode` is not `3` (pay gas separately, ignore errors) instead of sending them with the wallet's own mode. TON Connect cannot pass a send mode to the wallet, so any other mode would have been silently replaced.
