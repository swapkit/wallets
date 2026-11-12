import "@swapkit/wallets/register";

import { Chain, WalletOption } from "@swapkit/helpers";

/**
 * Wallets that aren't ready for production. When experimental wallets are shown
 * they get a "DEV" badge so the wallets repo can iterate on them through this
 * UI. Otherwise they're hidden entirely.
 *
 * They're shown in dev mode (`SKConfig.envs.isDev`: the studio sidebar toggle,
 * the `developMode` prop or the `__SWAPKIT_IS_DEV__` compile-time default) or
 * when the integrator sets `showExperimentalWallets`.
 */
export const EXPERIMENTAL_WALLETS: ReadonlySet<WalletOption> = new Set([
  WalletOption.KEEPKEY,
  WalletOption.LEDGER_WALLET_PROVIDER,
  WalletOption.VULTISIG,
]);

/**
 * Per-wallet chains that aren't ready for production. The wallet itself stays
 * available — only the listed chains are hidden unless experimental wallets are shown.
 */
export const EXPERIMENTAL_WALLET_CHAINS: ReadonlyMap<WalletOption, ReadonlySet<Chain>> = new Map([
  [WalletOption.COINBASE_MOBILE, new Set<Chain>([Chain.Arc])],
  [WalletOption.COINBASE_WEB, new Set<Chain>([Chain.Arc])],
]);

export function isExperimentalWallet(wallet: WalletOption): boolean {
  return EXPERIMENTAL_WALLETS.has(wallet);
}

export function isExperimentalChainForWallet(wallet: WalletOption, chain: Chain): boolean {
  return EXPERIMENTAL_WALLET_CHAINS.get(wallet)?.has(chain) ?? false;
}

/**
 * Filter a chain list against the experimental chain map for the given wallet.
 * When experimental wallets are shown the full list is returned unchanged;
 * otherwise the experimental entries are stripped.
 */
export function filterExperimentalChainsForWallet(
  wallet: WalletOption,
  chains: ReadonlyArray<Chain>,
  showExperimental: boolean,
): Chain[] {
  if (showExperimental) return [...chains];
  const blocked = EXPERIMENTAL_WALLET_CHAINS.get(wallet);
  if (!blocked || blocked.size === 0) return [...chains];
  return chains.filter((c) => !blocked.has(c));
}
