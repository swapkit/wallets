---
"@swapkit/wallet-hardware": minor
"@swapkit/wallet-extensions": patch
"@swapkit/wallets": patch
---

Ledger keeps signing Zcash through the NU7 network upgrade (mainnet block 3,543,405, around 5 November 2026). The Ledger Zcash signer kit moves to 0.9.0, the first release whose mainnet table carries the NU7 consensus branch id `0x77190ad9`, and the client now maps a transaction built under NU7 to that activation height. Each previous transaction is framed with the same height, so a v4 input is hashed under the branch the transaction is signed for rather than the kit's default. Before NU7 nothing changes: transactions built under Ironwood still sign under Ironwood. The device must run the Zcash app release that accepts the NU7 branch id, installed from Ledger Live. The Device Management Kit moves to 1.11.0, with the Ethereum signer kit and context module on the matching releases, and `@swapkit/utxo-signer` to 3.2.0 across the wallet packages.
