---
"@swapkit/wallet-extensions": patch
"@swapkit/wallets": patch
"@swapkit/sdk": patch
---

Extension wallets build their UTXO toolboxes with the script type of the address the extension returns (CTRL, Phantom, Bitget, OKX, OneKey, KeepKey BEX and Vultisig), so a taproot or nested-segwit account is no longer reported as native segwit through `scriptType` and `getAddressFromKeys`. Without an address the toolbox keeps the chain default; an address of another chain or of a form the SDK cannot spend from (such as P2WSH) now fails the connect with the SDK's `toolbox_utxo_invalid_address` or `toolbox_utxo_unsupported_script_type`. Vultisig and CTRL now request the address before building the toolbox for every UTXO chain but Zcash.
