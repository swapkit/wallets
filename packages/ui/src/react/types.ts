import type {
  AssetValue,
  Chain,
  ChainWallet,
  EIP6963ProviderInfo,
  LocalModeConfig,
  WalletOption,
} from "@swapkit/helpers";
import type { GetExtendedPublicKey } from "@swapkit/wallets";
import type { SwapKitClient } from "../swapkit-types";

export type KeystoreFile = {
  keystore: import("@swapkit/wallets/keystore").Keystore | null;
  file: File;
  chains: Chain[];
};

export interface SwapKitState {
  swapKit: SwapKitClient | null;
  walletType: WalletOption | null;
  isWalletConnected: boolean;
  isConnectingWallet: boolean;
  eip6963WalletInfo: EIP6963ProviderInfo | null;

  setSwapKit: (swapKit: SwapKitClient | null) => void;
  setWalletState: (state: {
    connected: boolean;
    type: WalletOption | null;
    eip6963Info?: EIP6963ProviderInfo | null;
  }) => void;
  setIsConnectingWallet: (isConnectingWallet: boolean) => void;
}

export type UseSwapQuoteParams = { inputAsset: string | null; outputAsset: string | null; amount: string };

export type UseFilteredSortedAssetsFilters = {
  searchQuery?: string;
  selectedNetworks?: Chain[];
  includeBalances?: boolean;
};

export type BalanceDetails = { balance: AssetValue; wallet: ChainWallet<Chain>; chain: Chain; identifier: string };

export type ControlsStoreFieldValues = {
  apiBaseUrl: string;
  widgetId: string;
  widgetKey: string;

  // API Key authentication (alternative to widget key)
  useApiKeyAuth: boolean;
  apiKey: string;

  // V3 swap flow setting
  useV3SwapFlow: boolean;

  // Developer mode settings
  developMode: boolean;
  devApiUrl: string;

  // Local mode — routes quote/swap requests to locally running services.
  // Studio-only: the toggle is shown only when the studio is served from
  // localhost. Mirrors @swapkit/helpers' SKConfig.localMode 1:1 so the
  // apply-effect is a straight `SKConfig.set({ localMode })`.
  localMode: LocalModeConfig;

  // Default input / output assets the embedded widget should start with.
  // Stored as the full asset identifier string ("BTC.BTC",
  // "ETH.USDT-0X…"). Empty string = no default; let the widget auto-pick.
  inputAsset: string;
  outputAsset: string;

  // Wallet configuration
  enabledWalletOptions: WalletOption[] | "all";

  // Chain configuration — restricts the chain set the widget operates on.
  // Empty array means "no chains"; the studio renders that as a hard-blocked
  // state. "all" means no restriction (the default).
  enabledChains: Chain[] | "all";

  // SDK-level wallet/integration credentials. Shape mirrors @swapkit/helpers'
  // SKConfigState 1:1 so the apply-effect is a straight `SKConfig.set({ apiKeys, integrations })`.
  // Persisted alongside the rest of the form via the same `formValues` localStorage entry.
  apiKeys: { walletConnectProjectId: string; xaman: string; passkeys: string; keepKey: string };
  integrations: {
    coinbase: { appName: string; appLogoUrl: string };
    trezor: { email: string; appUrl: string };
    keepKey: { name: string; imageUrl: string; basePath: string; url: string };
    radix: {
      dAppDefinitionAddress: string;
      applicationName: string;
      applicationVersion: string;
      // Network fields are strings in the form (text inputs); coerced to the
      // required types when forwarded to SKConfig.
      networkId: string;
      networkName: string;
      dashboardBase: string;
    };
  };

  // Simplified theme colors in HSL format: "H S% L%" or "H S% L% / A"
  colorPrimary: string; // --sk-bg (background)
  colorSecondary: string; // --sk-bg-surface (surface)
  colorPrimaryButton: string; // --sk-ui-primary-button (primary button background)
  colorPrimaryButtonText: string; // --sk-ui-primary-button-text (text on primary buttons)
  colorAccent: string; // --sk-ui-accent (brand/accent color)
  colorBgHover: string; // --sk-bg-hover (subtle)
  colorBgActive: string; // --sk-bg-active (pressed/active state)
  colorBgOverlay: string; // --sk-bg-overlay (modal overlay)
  colorBorder: string; // --sk-ui-border
  colorText?: string; // --sk-ui-primary-foreground (main text)
  colorMutedText?: string; // --sk-ui-muted-foreground (subtle text)
  borderRadius: string; // --sk-ui-radius (base radius token)
  fontFamily: string; // --sk-ui-font-family (root font stack)
};

/**
 * Unified wallet representation that works for both static WalletOption wallets
 * and dynamically discovered EIP-6963 wallets.
 */
export type WalletDescriptor = {
  /** Unique identifier - WalletOption enum value OR "eip6963:{uuid}" */
  id: string;
  /** Discriminator for wallet type */
  type: "static" | "eip6963";
  /** Display name shown in UI */
  displayName: string;
  /** Icon URL or data URI */
  iconUrl: string;
  /** The WalletOption enum value (for EIP-6963: WalletOption.EIP6963) */
  walletOption: WalletOption;
  /** Chains this wallet supports */
  supportedChains: Chain[];
  /** Optional hardware xpub discovery hook exposed by the wallet package */
  getExtendedPublicKey?: GetExtendedPublicKey;
  /** EIP-6963 provider instance (only present when type === 'eip6963') */
  eip6963Provider?: any;
  /** Original EIP-6963 info (only present when type === 'eip6963') */
  eip6963Info?: EIP6963ProviderInfo;
};

/**
 * Configuration for which wallets to show in the UI.
 * - Array of WalletOption: only show these wallets
 * - 'all': show all wallets (default)
 * - 'none': disable wallet connection
 * - { include: [...] }: explicit include list
 * - { exclude: [...] }: show all except these
 */
export type WalletConfig = WalletOption[] | "all" | "none" | { include: WalletOption[] } | { exclude: WalletOption[] };

/**
 * Configuration for which chains the widget should operate on. Mirrors
 * WalletConfig shape so consumers learn one mental model.
 * - `Chain[]`: explicit list
 * - `"all"`: every API-supported chain (default)
 * - `{ include: [...] }` / `{ exclude: [...] }`: allow/blocklist forms
 */
export type ChainConfig = Chain[] | "all" | { include: Chain[] } | { exclude: Chain[] };
