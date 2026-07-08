import { type Chain, WalletOption } from "@swapkit/helpers";

/**
 * Wallets that aren't ready for production. In dev mode they're shown with a
 * "DEV" badge so the wallets repo can iterate on them through this UI. In prod
 * builds they're hidden entirely.
 *
 * `SKConfig.envs.isDev` is the runtime signal (set by the studio sidebar
 * toggle, the `developMode` prop on the widget, or the `__SWAPKIT_IS_DEV__`
 * compile-time default).
 */
export const EXPERIMENTAL_WALLETS: ReadonlySet<WalletOption> = new Set([WalletOption.KEEPKEY, WalletOption.VULTISIG]);

/**
 * Per-wallet chains that aren't ready for production. The wallet itself stays
 * available — only the listed chains are hidden when `isDev` is false.
 */
export const EXPERIMENTAL_WALLET_CHAINS: ReadonlyMap<WalletOption, ReadonlySet<Chain>> = new Map();

export function isExperimentalWallet(wallet: WalletOption): boolean {
  return EXPERIMENTAL_WALLETS.has(wallet);
}

export function isExperimentalChainForWallet(wallet: WalletOption, chain: Chain): boolean {
  return EXPERIMENTAL_WALLET_CHAINS.get(wallet)?.has(chain) ?? false;
}

/**
 * Filter a chain list against the experimental chain map for the given wallet.
 * In dev the full list is returned unchanged; in prod the experimental entries
 * are stripped.
 */
export function filterExperimentalChainsForWallet(
  wallet: WalletOption,
  chains: ReadonlyArray<Chain>,
  isDev: boolean,
): Chain[] {
  if (isDev) return [...chains];
  const blocked = EXPERIMENTAL_WALLET_CHAINS.get(wallet);
  if (!blocked || blocked.size === 0) return [...chains];
  return chains.filter((c) => !blocked.has(c));
}
