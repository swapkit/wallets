---
"@swapkit/wallets": minor
"@swapkit/wallet-hardware": minor
---

Add Arc (`Chain.Arc`, chain id 5042, USDC native gas) to the connectors that keep an explicit chain list: WalletConnect (`eip155:5042` namespace), Coinbase Wallet SDK, Ledger, Trezor and KeepKey. Connectors built on `EVMChains` (MetaMask, EVM extensions / EIP-6963, Trust Wallet, Bitget, Passkeys) already picked Arc up from `@swapkit/helpers` 5.2.1.
