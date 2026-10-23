---
"@swapkit/wallet-hardware": patch
---

Spend Zcash on Trezor that was received in a v6 transaction. Signing as v4 makes Trezor Connect fetch and parse every previous transaction, and its parser cannot read the v6 transactions in use since Ironwood, so those swaps and sends failed with "Transaction has unexpected data". Trezor now signs transparent Zcash as v5, which commits to input amounts directly and needs no previous transactions. `signPCZT` returns a v5 PCZT that carries the header Trezor signed, so its extracted transaction matches the signatures.
