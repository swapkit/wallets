---
"@swapkit/wallet-extensions": minor
"@swapkit/wallets": minor
---

OKX Wallet now connects Solana, Starknet and Cardano, plus the Arc, HyperEVM and Robinhood EVM chains. A chain the wallet does not expose, such as Cardano on OKX Mobile, is skipped instead of failing the whole connection. A Starknet account the user has never used is not deployed yet and fails with `toolbox_starknet_account_not_deployed` until it has been deployed from the OKX Wallet.
