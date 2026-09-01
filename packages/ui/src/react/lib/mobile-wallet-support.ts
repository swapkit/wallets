import { WalletOption } from "@swapkit/helpers";

/**
 * Wallet options that have no working path on a mobile device — either USB/HID
 * hardware that mobile browsers can't talk to, or browser extensions with no
 * mobile counterpart.
 *
 * Wallets like MetaMask, Coinbase, Phantom, TrustWallet are intentionally NOT
 * here: they ship native mobile apps with in-app browsers that inject their
 * provider, so listing them lets users connect from those in-app browsers (and
 * fail loudly with a clear error if opened in a regular mobile browser).
 *
 * EIP-6963 wallets are also kept — they only render when the device actually
 * announces a provider, so the list is self-pruning.
 */
const MOBILE_INCOMPATIBLE_WALLETS = new Set<WalletOption>([
  // Hardware wallets — USB/HID/Bluetooth, no mobile browser path.
  WalletOption.LEDGER,
  WalletOption.TREZOR,
  WalletOption.KEEPKEY,
  WalletOption.KEEPKEY_BEX,

  // Desktop browser extensions with no mobile presence.
  WalletOption.BITGET,
  WalletOption.BRAVE,
  WalletOption.CTRL,
  WalletOption.KEPLR,
  WalletOption.LEAP,
  WalletOption.OKX,
  WalletOption.ONEKEY,
  WalletOption.RADIX_WALLET,
  WalletOption.TALISMAN,
]);

/** UA-based mobile detection — checked once on the client. SSR-safe. */
export function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Returns `false` for a wallet that can't possibly work on mobile devices
 * (hardware, extension-only). Returns `true` for everything else, including
 * "web" wallets that are functional inside their respective mobile in-app
 * browsers — those decisions are deferred to the connect-time error path.
 */
export function isWalletMobileSupported(wallet: WalletOption): boolean {
  return !MOBILE_INCOMPATIBLE_WALLETS.has(wallet);
}
