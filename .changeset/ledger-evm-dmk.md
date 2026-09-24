---
"@swapkit/wallet-hardware": major
"@swapkit/wallets": minor
"@swapkit/sdk": minor
---

Migrate Ledger connections to the Device Management Kit by default. `@swapkit/wallets` and `@swapkit/sdk` re-export the Ledger wallet, so they carry these changes too.

Browser connections now discover and reuse one WebHID DMK session. Consumers that manage the device lifecycle can pass a caller-owned `dmkSession`; `originToken` enables EVM Transaction Checks, and `onDeviceActionState` exposes device prompts to the UI. New exports: `getLedgerDMKSession`, `preloadLedgerDMK`, `disconnectLedgerDMKSession` and the `LedgerDMKSession`, `LedgerDeviceActionState` and `LedgerDeviceActionStateHandler` types.

Breaking changes:

- WebUSB is no longer used. The default connection requires WebHID, so browsers without it (Android Chrome) can no longer connect a Ledger, and opening the device picker needs a user gesture. Call `preloadLedgerDMK()` ahead of the click to keep the gesture window.
- Device errors are now `SwapKitError`s: `wallet_connection_rejected_by_user`, `wallet_ledger_device_locked`, `wallet_ledger_app_not_open`, `wallet_ledger_connection_error` or `wallet_ledger_transport_error`, with the DMK tag, status word and message in `info`. Code that matched hw-transport's `TransportStatusError` or `statusCode` must switch to `errorKey`.
- EVM chains require a DMK session; passing a LedgerJS `transport` for them throws `wallet_ledger_invalid_params`. The injected `transport` remains a temporary compatibility path for other chains, cannot be combined with `dmkSession`, and no longer signs Zcash (hw-app-btc picks a pre-Ironwood branch id). Bitcoin `signTransaction` over it returns the finalised transaction from the legacy app, like the other legacy UTXO chains.
- Legacy Zcash PCZT v4 signing is no longer a supported Ledger path.

EVM, Bitcoin, Cosmos and transparent Zcash signing use the Ledger Device Signer Kits (the Zcash kit is still pre-1.0). THORChain uses its app-v2 protocol in one atomic DMK action, and chains without a signer kit run their existing Ledger app client through an operation-scoped DMK bridge. A default session that was lost (device unplugged, `disconnectLedgerDMKSession()`) is re-established on the next operation instead of failing until the wallet reconnects.

EVM message, transaction and full EIP-712 signing use the current signer APIs, sending only the types the primary type references. Arc keeps Ledger support: the Ethereum signer kit loads the network certificate and Ledger-signed network descriptor itself, replacing the `PROVIDE_NETWORK_INFORMATION` APDUs added in 4.11.0. When clear-signing metadata cannot be loaded or is rejected, the signer kit falls back to blind signing on every chain rather than only on Arc; the device still requires blind signing to be enabled and the user to confirm. The signer kit's blind-signing telemetry, which reports the chain, target address and device model to Ledger on every signature, is disabled.

Bitcoin requests PSBT signatures from the signer kit and finalises the transaction locally, keeping the transaction version the toolbox built. Inputs carry the full previous transaction, checked against the input txid and fetched when missing, so the device can verify input amounts; nested SegWit inputs also carry the spent output. Zcash transfer signing produces the transparent v5 transaction required by the current Zcash app.

Cosmos and THORChain signatures are normalised to low-S, THORChain rejects hardened change or address-index path segments instead of silently clearing them, and memo (OP_RETURN) outputs no longer break legacy UTXO signing. THORChain Amino signing keeps a compatibility normaliser for object-shaped deposit assets while signing the canonical string form expected on-chain.
