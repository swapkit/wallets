---
"@swapkit/wallet-extensions": minor
"@swapkit/wallets": minor
---

OKX Wallet now connects Solana, Starknet and Cardano. A chain the wallet does not expose, such as Cardano on OKX Mobile, is skipped instead of failing the whole connection. `loadWallet(WalletOption.OKX_MOBILE)` now returns the OKX wallet instead of the generic EVM one, so OKX Mobile offers the same chains as the extension.
