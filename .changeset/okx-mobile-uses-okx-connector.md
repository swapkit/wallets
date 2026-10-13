---
"@swapkit/wallets": major
---

**`loadWallet(WalletOption.OKX_MOBILE)` now returns the OKX wallet (`connectOkx`) instead of the generic EVM wallet (`connectEVMWallet`).** OKX Mobile is the same OKX integration running inside the OKX app's browser, so it now offers the same chains as the extension instead of only EVM chains. To migrate, replace `connectEVMWallet(chains, WalletOption.OKX_MOBILE)` with `connectOkx(chains)`. Connected chains are reported with the `OKX` wallet type, which is what the SwapKit widget already did for OKX Mobile. Importing `evmWallet` from `@swapkit/wallet-extensions/evm-extensions` and passing `WalletOption.OKX_MOBILE` keeps working unchanged.
