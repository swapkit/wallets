---
"@swapkit/wallet-hardware": patch
---

Bump `@trezor/connect-web` from `~9.6.4` to `~9.7.3`. The pinned 9.6.4 release (Oct 23 2025) ships outdated bundled blockbook URLs (`bch1.trezor.io`, `zec1.trezor.io`, etc.) which Trezor consolidated to single-host URLs (`bch.trezor.io`, `zec.trezor.io`) in trezor-suite#22646 (merged Nov 3 2025). The legacy hosts have since been retired, breaking `signTransaction` for Trezor BCH and ZEC because `refTxs` lookups against the dead backends fail. Symptoms reported on integrating apps include `wallet_trezor_failed_to_sign_transaction: Transaction '<txid>' not found` for ZEC and address-encoding errors for BCH. The first stable @trezor/connect-web release with the updated backends is 9.7.0 (Dec 16 2025); 9.7.3 is the latest at time of this change.
