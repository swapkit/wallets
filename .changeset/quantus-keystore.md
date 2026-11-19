---
"@swapkit/wallets": minor
---

The keystore wallet can connect Quantus (QTC) with either of its signature schemes, ML-DSA-87 or ML-DSA-65. It now matches the SDK keystore: an empty phrase, an invalid wallet index or a malformed derivation entry fails the connect with a clear error, and a UTXO script type a chain cannot encode is rejected before any chain connects.
