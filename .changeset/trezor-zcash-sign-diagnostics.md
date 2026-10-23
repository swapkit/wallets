---
"@swapkit/wallet-hardware": patch
---

Sign Zcash transactions on Trezor. The connector asked Trezor Connect for the coin `zcash`, which Connect resolves by path when fetching an address but only by ticker when signing, so every Zcash send and swap failed with `Method_UnknownCoin` before reaching the device. It now passes `zec`.

Signing failures also now say why. The error read the reason from `payload.error`, but Connect returns it as `message`, so every failure surfaced as a bare `{"chain":"ZEC"}`. It now carries the device's message and code, the derivation path, which signing path ran, and a summary of the request: version, branch id, input amounts, outputs by kind, and the implied fee.
