/**
 * Side-effect entry that registers every out-of-enum wallet option (and its
 * error codes) with the @swapkit/helpers registries. Apps that reference
 * registered options at module scope (e.g. `WalletOption.NOIR_WALLET` in a
 * static wallet list) must import this before those modules evaluate:
 *
 * ```ts
 * import "@swapkit/wallets/register";
 * ```
 *
 * `loadWallet` imports this itself, so apps that only connect wallets through
 * it need nothing extra.
 */
import "@swapkit/wallet-extensions/noir-wallet/register";
import "./tonconnect/register";
