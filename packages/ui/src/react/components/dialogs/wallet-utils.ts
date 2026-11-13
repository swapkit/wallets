import "@swapkit/wallets/register";

import { Chain, type EIP6963Provider, getEIP6963Wallets, WalletOption } from "@swapkit/helpers";
import type { GetExtendedPublicKey } from "@swapkit/wallets";
import { filterExperimentalChainsForWallet } from "../../lib/experimental-wallets";
import type { WalletDescriptor } from "../../types";
import { getWalletLogoUrl, WALLET_DISPLAY_NAMES } from "../config";
import { WIDGET_SUPPORTED_EVM_CHAINS } from "./wallet-chains-config";

const EIP6963_RDNS_TO_OPTION: Record<string, WalletOption> = {
  "app.keplr": WalletOption.KEPLR,
  "app.phantom": WalletOption.PHANTOM,
  "app.talisman": WalletOption.TALISMAN,
  "com.bitget.web3": WalletOption.BITGET,
  "com.brave.wallet": WalletOption.BRAVE,
  "com.coinbase.wallet": WalletOption.COINBASE_WEB,
  "com.ledger.wallet.provider": WalletOption.LEDGER_WALLET_PROVIDER,
  "com.okex.wallet": WalletOption.OKX,
  "com.trustwallet.app": WalletOption.TRUSTWALLET_WEB,
  "io.metamask": WalletOption.METAMASK,
  "org.tronlink.www": WalletOption.TRONLINK,
  "so.onekey.app.wallet": WalletOption.ONEKEY,
};

const EIP6963_NAME_TO_OPTION: Record<string, WalletOption> = {
  brave: WalletOption.BRAVE,
  "brave wallet": WalletOption.BRAVE,
  "coinbase wallet": WalletOption.COINBASE_WEB,
  keplr: WalletOption.KEPLR,
  "ledger wallet": WalletOption.LEDGER_WALLET_PROVIDER,
  metamask: WalletOption.METAMASK,
  okx: WalletOption.OKX,
  "okx wallet": WalletOption.OKX,
  onekey: WalletOption.ONEKEY,
  phantom: WalletOption.PHANTOM,
  talisman: WalletOption.TALISMAN,
  tronlink: WalletOption.TRONLINK,
  "trust wallet": WalletOption.TRUSTWALLET_WEB,
};

export function getWalletOptionForEIP6963(info: { walletId?: string; name?: string }): WalletOption | undefined {
  // EIP-6963 spec uses "rdns" but our type maps it as "walletId" — try both
  const rdns = (info as Record<string, string>).rdns ?? info.walletId;
  if (rdns && EIP6963_RDNS_TO_OPTION[rdns]) return EIP6963_RDNS_TO_OPTION[rdns];

  if (info.name) return EIP6963_NAME_TO_OPTION[info.name.toLowerCase()];

  return undefined;
}

/**
 * Transform a static WalletOption into a WalletDescriptor
 */
export function staticWalletToDescriptor(
  wallet: WalletOption,
  supportedChains: Chain[],
  getExtendedPublicKey?: GetExtendedPublicKey,
): WalletDescriptor {
  return {
    displayName: WALLET_DISPLAY_NAMES[wallet] || wallet,
    getExtendedPublicKey,
    iconUrl: getWalletLogoUrl(wallet),
    id: wallet,
    supportedChains,
    type: "static",
    walletOption: wallet,
  };
}

/**
 * Transform an EIP-6963 provider into a WalletDescriptor.
 * If the provider maps to a known WalletOption, its direct-signing chains (from walletChainsMap)
 * are used. Otherwise we fall back to the widget's EVM chain list — EIP-6963 is EVM-scoped.
 */
export function eip6963ToDescriptor(
  eip6963: EIP6963Provider,
  evmChains: Chain[],
  walletChainsMap: Partial<Record<WalletOption, Chain[]>>,
): WalletDescriptor {
  const mappedOption = getWalletOptionForEIP6963(eip6963.info);
  const directSigningChains = mappedOption ? walletChainsMap[mappedOption] : undefined;

  return {
    displayName: eip6963.info.name,
    eip6963Info: eip6963.info,
    eip6963Provider: eip6963.provider,
    iconUrl: eip6963.info.icon, // Already a data URI or URL
    id: `eip6963:${eip6963.info.uuid}`,
    supportedChains: directSigningChains && directSigningChains.length > 0 ? [...directSigningChains] : evmChains,
    type: "eip6963",
    walletOption: mappedOption ?? WalletOption.EIP6963,
  };
}

// Single source of truth for the chains a wallet can actually offer in this widget build.
export function getAllowedWalletChains(
  wallet: WalletOption,
  chains: ReadonlyArray<Chain>,
  showExperimental: boolean,
  isChainAllowed: (chain: Chain) => boolean,
): Chain[] {
  return filterExperimentalChainsForWallet(wallet, chains, showExperimental).filter(isChainAllowed);
}

export function walletSupportsChains(supportedChains: Chain[], selectedChains: Chain[]): boolean {
  return selectedChains.length === 0 || selectedChains.every((chain) => supportedChains.includes(chain));
}

// Stable partition: wallets keep their relative order inside each half.
export function sortSupportedWalletsFirst<T>(wallets: T[], isSupported: (wallet: T) => boolean): T[] {
  return [...wallets.filter(isSupported), ...wallets.filter((wallet) => !isSupported(wallet))];
}

/**
 * Discover EIP-6963 wallets and return cleanup function
 */
export function discoverEIP6963Wallets(): { providers: EIP6963Provider[]; cleanup: () => void } {
  const { providers, removeEIP6963EventListener } = getEIP6963Wallets();
  return { cleanup: removeEIP6963EventListener, providers };
}

export { getEIP6963Wallets, WIDGET_SUPPORTED_EVM_CHAINS };

// Both Ledger integrations keep their own device session open, so they can't share the device
const CONFLICTING_LEDGER_WALLETS: Partial<Record<WalletOption, WalletOption>> = {
  [WalletOption.LEDGER]: WalletOption.LEDGER_WALLET_PROVIDER,
  [WalletOption.LEDGER_WALLET_PROVIDER]: WalletOption.LEDGER,
};

export function getConflictingLedgerWallet(
  walletOption: WalletOption,
  connectedWallets: { walletType?: WalletOption | string }[],
) {
  const conflicting = CONFLICTING_LEDGER_WALLETS[walletOption];
  if (!conflicting) return undefined;

  return connectedWallets.some(({ walletType }) => walletType === conflicting) ? conflicting : undefined;
}

export type ChainFamily = "evm" | "solana";

export function getChainFamily(chain: Chain): ChainFamily {
  return chain === Chain.Solana ? "solana" : "evm";
}

export function getChainFamilies(chains: Chain[]) {
  return [...new Set(chains.map(getChainFamily))];
}

export function getConnectedLedgerWalletFamilies(wallets: { chain: Chain; walletType: WalletOption | string }[]) {
  return getChainFamilies(
    wallets.filter((wallet) => wallet.walletType === WalletOption.LEDGER_WALLET_PROVIDER).map(({ chain }) => chain),
  );
}

export function getAvailableFamilies(chains: Chain[], connectedFamilies: ChainFamily[]) {
  return getChainFamilies(chains).filter((family) => !connectedFamilies.includes(family));
}
