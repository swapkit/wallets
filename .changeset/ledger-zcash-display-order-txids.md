---
"@swapkit/wallet-hardware": patch
---

Ledger Zcash signing looks up each input's previous transaction once, by its txid as block explorers show it, instead of also trying the reversed txid. The SwapKit SDK now reports Zcash input txids in that order everywhere, so the second lookup is no longer needed.
