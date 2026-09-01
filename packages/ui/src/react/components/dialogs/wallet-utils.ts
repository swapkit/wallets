import { type Chain, type EIP6963Provider, getEIP6963Wallets, WalletOption } from "@swapkit/helpers";
import type { GetExtendedPublicKey } from "@swapkit/wallets";
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
  "com.okex.wallet": WalletOption.OKX,
  "com.trustwallet.app": WalletOption.TRUSTWALLET_WEB,
  "io.metamask": WalletOption.METAMASK,
  "so.onekey.app.wallet": WalletOption.ONEKEY,
  "xyz.ctrl": WalletOption.CTRL,
};

const EIP6963_NAME_TO_OPTION: Record<string, WalletOption> = {
  brave: WalletOption.BRAVE,
  "brave wallet": WalletOption.BRAVE,
  "coinbase wallet": WalletOption.COINBASE_WEB,
  ctrl: WalletOption.CTRL,
  keplr: WalletOption.KEPLR,
  metamask: WalletOption.METAMASK,
  okx: WalletOption.OKX,
  "okx wallet": WalletOption.OKX,
  onekey: WalletOption.ONEKEY,
  phantom: WalletOption.PHANTOM,
  talisman: WalletOption.TALISMAN,
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

/**
 * Discover EIP-6963 wallets and return cleanup function
 */
export function discoverEIP6963Wallets(): { providers: EIP6963Provider[]; cleanup: () => void } {
  const { providers, removeEIP6963EventListener } = getEIP6963Wallets();
  return { cleanup: removeEIP6963EventListener, providers };
}

export { getEIP6963Wallets, WIDGET_SUPPORTED_EVM_CHAINS };
