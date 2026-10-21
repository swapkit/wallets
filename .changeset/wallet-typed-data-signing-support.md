---
"@swapkit/wallets": minor
"@swapkit/wallet-extensions": minor
"@swapkit/wallet-hardware": minor
---

Wallet connectors now declare every signing capability they have in one `signingSupport` map on the wallet descriptor, per chain: `direct` (sign a transaction without broadcasting it), `typedData` (EIP-712 typed data) and `btcMessage` (Bitcoin message signing), e.g. `metamaskWallet.connectMetamask.signingSupport[Chain.Ethereum]` is `{ direct: true, typedData: true }`. Each connected chain wallet also carries its entry as `signing`. A capability that is not listed means the connector cannot do it on that chain.

- Connectors no longer pass `directSigningSupport`; their `direct` values moved into `signingSupport` unchanged. `directSigningSupport` on the descriptor and `supportsDirectSigning` on a chain wallet are still derived from it, so existing readers keep working.
- `typedData` is declared on the EVM chains each connector actually connects: MetaMask, EVM extensions (EIP-6963, Brave, Coinbase web), Ledger Wallet Provider, Ledger, Trezor, KeepKey, KeepKey extension, Phantom (Ethereum), OKX, Bitget, OneKey, Passkeys, Vultisig, Coinbase mobile, Talisman, Cosmostation, Trust Wallet and Keystore.
- WalletConnect declares no typed data signing, since its EVM signer cannot sign typed data today. Its `direct` value still also depends on what the connected session allows.
- Bitcoin message signing (`btcMessage`) is not declared by any wallet yet.

This is a declaration only: no signing method is added, removed or changed on any wallet, and every value is the same as before. Requires the matching `@swapkit/wallet-core` and `@swapkit/helpers` release that adds `signingSupport`.
