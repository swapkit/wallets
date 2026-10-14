---
"@swapkit/wallet-extensions": minor
"@swapkit/wallets": minor
---

OKX Wallet now connects Starknet. Sending needs the `@swapkit/toolboxes` release where the Starknet toolbox reads through its own RPC instead of the wallet's. A Starknet account the user has never used is not deployed yet and fails with `toolbox_starknet_account_not_deployed` until it has been deployed from the OKX Wallet.
