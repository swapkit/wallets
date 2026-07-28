---
"@swapkit/wallet-hardware": patch
---

Fix Trezor Zcash serialized-tx fallback signing rejecting transactions after the NU6.3 "Ironwood" network upgrade: the consensus branch id is now taken dynamically from the transaction (`tx.consensusBranchId`) instead of a hardcoded `ZcashConsensusBranchId.NU6`, matching the PCZT signing path.
