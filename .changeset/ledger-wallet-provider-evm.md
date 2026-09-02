---
"@swapkit/wallets": minor
---

Add the Ledger Wallet connector built on the [Ledger Wallet Provider](https://developers.ledger.com/docs/ledger-wallet-provider/overview) (`connectLedgerWalletProvider`, `@swapkit/wallets/ledger-wallet-provider`). Unlike `@swapkit/wallets/ledger` it never owns the WebHID/WebUSB transport — Ledger's SDK handles device pairing, account selection and the signing UI behind one EIP-1193 provider announced over EIP-6963 — which makes it usable from embedded surfaces such as the widget. EVM-only: it covers the ten SwapKit chains on Ledger Wallet's network list (Ethereum, Arbitrum, Avalanche, Base, BNB Smart Chain, Linea, Optimism, Polygon, Robinhood, Sonic). `LEDGER_WALLET_PROVIDER` and the `wallet_ledger_wallet_provider_*` error codes (80201-80203) register through the `@swapkit/helpers` extensible registries.
