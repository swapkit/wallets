---
"@swapkit/wallet-hardware": patch
"@swapkit/wallets": patch
"@swapkit/sdk": patch
---

Follow the SDK's move to mainnet only, which removes `SKConfig` `envs.isStagenet`: the Ledger THORChain client always requests `thor` addresses and WalletConnect always uses the NEAR mainnet namespace. Setting the removed stagenet flag no longer switches either to a test network.
