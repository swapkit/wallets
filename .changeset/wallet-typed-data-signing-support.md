---
"@swapkit/wallets": minor
"@swapkit/wallet-extensions": minor
"@swapkit/wallet-hardware": minor
---

Wallet connectors now declare which chains they can sign EIP-712 typed data on, through `signingSupport` on the wallet descriptor (read it the same way as `directSigningSupport`, e.g. `metamaskWallet.connectMetamask.signingSupport[Chain.Ethereum]?.typedData`). Each connected chain wallet also carries it as `signing`. A chain that is not listed means the connector cannot sign typed data there.

- Declared on the EVM chains each connector actually connects: MetaMask, EVM extensions (EIP-6963, Brave, Coinbase web), Ledger Wallet Provider, Ledger, Trezor, KeepKey, KeepKey extension, Phantom (Ethereum), OKX, Bitget, OneKey, Passkeys, Vultisig, Coinbase mobile, Talisman, Cosmostation, Trust Wallet and Keystore.
- WalletConnect declares no typed data signing, since its EVM signer cannot sign typed data today.
- Bitcoin message signing (`btcMessage`) is not declared by any wallet yet.

This is a declaration only: no signing method is added, removed or changed on any wallet, and it only describes what already works. Requires the matching `@swapkit/wallet-core` and `@swapkit/helpers` release that adds `signingSupport`.
