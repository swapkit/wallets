---
"@swapkit/wallet-hardware": patch
---

Ledger EVM: clear-sign on chains the Ethereum app doesn't know yet (ARC, Monad, Aurora...).

The app rejects ERC20 descriptors for chains missing from its hardcoded network table with `INCORRECT_DATA` (0x6a80) before the transaction is displayed, which made every approve on ARC fail with `toolbox_evm_error_sending_transaction`. Handling that error alone was not enough: without the token descriptor the app's internal ERC20 plugin falls back, and the device then demands blind signing for an approve it could otherwise decode.

We now register the chain on the device the way Ledger Live does. First load the PKI certificate for the `network` key usage, since recent app versions verify network descriptors against a certificate loaded at runtime rather than a key baked into the firmware. Then send the Ledger-signed network descriptor from the Crypto Assets List (`PROVIDE_NETWORK_INFORMATION`, app >= 1.13.0) and its icon, re-sending the configuration if the icon is refused because a rejected icon makes the app drop the network it just registered. Then confirm against the device that the chain really is registered, and retry with clear signing.

If the chain cannot be registered we sign without metadata, which is what forces blind signing, and log why: device model, app version, blind-signing setting and the step that failed. Failures fetching Ledger's asset list no longer abort signing either.

Also bumps `@ledgerhq/hw-app-eth` to 7.8.18. No API changes on the surface we use; the only signature difference is an extra optional constructor argument.
