---
"@swapkit/wallets": patch
---

TON Connect now rejects `transfer` with `sweep: true` for native TON instead of silently sending the given amount, since the wallet cannot send the whole balance. Jetton sweeps are passed through and send the full token balance.
