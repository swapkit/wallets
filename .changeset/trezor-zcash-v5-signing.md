---
"@swapkit/wallet-hardware": patch
---

Trezor signs transparent Zcash as version 5 transactions, carrying the branch id, expiry and lock time of the transaction it was handed instead of a fixed version 4 header. Signing as v4 made Trezor Connect fetch and parse every previous transaction, and it cannot read the v6 transactions in use since Ironwood, so spending ZEC received that way failed with "Transaction has unexpected data"; v5 commits to the input amounts directly and needs no previous transactions. It also keeps Trezor working through the NU7 network upgrade (mainnet block 3,543,405, around 5 November 2026), which rejects version 4 transactions: the SDK resolves the branch id and version from the block height, and the signer now passes them through. `signPCZT` returns a v5 PCZT carrying the header Trezor signed, so the transaction extracted from it matches the signatures.
