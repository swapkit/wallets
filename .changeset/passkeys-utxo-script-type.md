---
"@swapkit/wallets": patch
"@swapkit/sdk": patch
---

The passkeys Bitcoin wallet builds its toolbox with the script type its payment address encodes, so `scriptType` and `getAddressFromKeys` report the account's real type (native segwit, nested segwit or taproot) instead of the chain default. Addresses and signing are unchanged.
