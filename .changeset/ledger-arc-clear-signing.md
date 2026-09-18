---
"@swapkit/wallet-hardware": patch
---

Ledger EVM: clear-sign ERC20 approvals on ARC, a chain the Ethereum app doesn't know yet.

The app rejects ERC20 descriptors for chains missing from its hardcoded network table with `INCORRECT_DATA` (0x6a80) before the transaction is displayed, which made every approve on ARC fail with `toolbox_evm_error_sending_transaction`. Handling that error alone was not enough: without the token descriptor the app's internal ERC20 plugin falls back, and the device then demands blind signing for an approve it could otherwise decode.

We now register ARC on the device the way Ledger Live does, before the first signature and once per client. First load the PKI certificate for the `network` key usage, since recent app versions verify network descriptors against a certificate loaded at runtime rather than a key baked into the firmware. Then send the Ledger-signed network descriptor from the Crypto Assets List (`PROVIDE_NETWORK_INFORMATION`, app >= 1.13.0) and its icon, re-sending the configuration if the icon is refused because a rejected icon makes the app drop the network it just registered. No other chain changes behaviour.

Any `INCORRECT_DATA` still coming back from the app — because the registration failed, or for any other reason — now falls back to signing without metadata, which is what forces blind signing, and warns once so the fallback isn't silent. Failures fetching Ledger's asset list no longer abort signing either.

Also bumps `@ledgerhq/hw-app-eth` to 7.8.18. No API changes on the surface we use; the only signature difference is an extra optional constructor argument.
