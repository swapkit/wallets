---
"@swapkit/wallet-hardware": patch
---

Fix Ledger BTC/LTC PSBT signing by normalizing derivation paths, preserving existing input derivation metadata, and avoiding premature transaction finalization inside the Ledger signer.
