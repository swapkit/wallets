---
"@swapkit/wallets": patch
"@swapkit/sdk": patch
---

Follow the SDK's move to mainnet only, which removes `SKConfig` `envs.isStagenet`: WalletConnect always uses the NEAR mainnet namespace.
