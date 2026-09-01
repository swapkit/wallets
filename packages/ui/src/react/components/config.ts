import type { Chain, ProviderName, TokenNames } from "@swapkit/helpers";
import { WalletOption } from "@swapkit/helpers";

const getAssetsBaseUrl = () => {
  if (import.meta.env?.MODE === "development") {
    return "https://storage.googleapis.com/sk-apiv2-dev-token-list-swapkit";
  }

  return "https://storage.googleapis.com/sk-apiv2-token-list-swapkit";
};

export const getTokenLogoUrl = (token: TokenNames | (string & {})) => {
  return `${getAssetsBaseUrl()}/images/${token?.toLowerCase()}.png`;
};

export const getProviderLogoUrl = (provider: ProviderName | (string & {})) => {
  const normalizedProvider = provider?.replace(/(_V\d+|_STREAMING)$/g, "").toLowerCase();
  return `${getAssetsBaseUrl()}/images/providers/${normalizedProvider}.png`;
};

export const getChainLogoUrl = (chain: Chain | (string & {})) => {
  return `${getAssetsBaseUrl()}/images/chains/${chain?.toLowerCase()}.${chain?.toLowerCase()}.png`;
};

export const getWalletLogoUrl = (wallet: WalletOption | (string & {})) => {
  return `${getAssetsBaseUrl()}/images/wallets/${wallet?.toLowerCase()}.png`;
};

export const WALLET_DISPLAY_NAMES: Partial<Record<WalletOption, string>> = {
  [WalletOption.BITGET]: "Bitget",
  [WalletOption.BRAVE]: "Brave",
  [WalletOption.COINBASE_MOBILE]: "Coinbase",
  [WalletOption.COINBASE_WEB]: "Coinbase",
  [WalletOption.COSMOSTATION]: "Cosmostation",
  [WalletOption.CTRL]: "CTRL",
  [WalletOption.EIP6963]: "Browser Wallet",
  [WalletOption.EXODUS]: "Exodus",
  [WalletOption.KEEPKEY]: "KeepKey",
  [WalletOption.KEEPKEY_BEX]: "KeepKey",
  [WalletOption.KEPLR]: "Keplr",
  [WalletOption.KEYSTORE]: "Keystore",
  [WalletOption.LEAP]: "Leap",
  [WalletOption.LEDGER]: "Ledger",
  [WalletOption.METAMASK]: "MetaMask",
  [WalletOption.OKX]: "OKX",
  [WalletOption.OKX_MOBILE]: "OKX",
  [WalletOption.ONEKEY]: "OneKey",
  [WalletOption.PASSKEYS]: "Passkeys",
  [WalletOption.PHANTOM]: "Phantom",
  [WalletOption.RADIX_WALLET]: "Radix Wallet",
  [WalletOption.TALISMAN]: "Talisman",
  [WalletOption.TREZOR]: "Trezor",
  [WalletOption.TRONLINK]: "TronLink",
  [WalletOption.TRUSTWALLET_WEB]: "Trust Wallet",
  [WalletOption.VULTISIG]: "Vultisig",
  [WalletOption.WALLETCONNECT]: "WalletConnect",
  [WalletOption.WALLET_SELECTOR]: "Wallet Selector",
  [WalletOption.XAMAN]: "Xaman",
};

/**
 * Theme tokens for the SwapKit widget.
 * Color values should be in HSL format: "H S% L%" or "H S% L% / A".
 *
 * Note: These map to dedicated theme variables (--sk-bg-*, --sk-ui-accent, etc.)
 * to avoid conflicts with component-level styles.
 */
export interface SwapKitThemeTokens {
  /** Main widget background color */
  background?: string;
  /** Elevated surface color (cards, dialogs) */
  surface?: string;
  /** Hover state overlay */
  hover?: string;
  /** Active/pressed state overlay */
  active?: string;
  /** Modal backdrop overlay */
  overlay?: string;
  /** Primary foreground (primary button background) */
  primaryForeground?: string;
  /** Main text color */
  text?: string;
  /** Muted/subtle text color */
  mutedForeground?: string;
  /** Muted text (alias for mutedForeground) */
  mutedText?: string;
  /** Text color on primary buttons (for contrast on bright backgrounds) */
  primaryButtonText?: string;
  /** Brand/accent color (steppers, progress indicators, highlights) */
  accent?: string;
  /** Text on accent backgrounds */
  accentForeground?: string;
  /** Primary button background color */
  primaryButton?: string;
  /** Primary button text color */
  primaryButtonForeground?: string;
  /** Border color */
  border?: string;
  /** Base border radius used by rounded UI surfaces */
  radius?: string;
  /** Font family stack applied to the widget root */
  fontFamily?: string;
}

/** @deprecated Use SwapKitThemeTokens instead. */
export type SwapKitColors = SwapKitThemeTokens;

/** Default token values for dark theme */
export const DEFAULT_THEME_TOKENS: Required<SwapKitThemeTokens> = {
  accent: "140 87% 79%",
  accentForeground: "140 6% 8%",
  active: "0 0% 100% / 0.12",
  background: "140 6% 8%",
  border: "0 0% 100% / 0.12",
  fontFamily:
    'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  hover: "0 0% 100% / 0.08",
  mutedForeground: "0 0% 100% / 0.64",
  mutedText: "0 0% 100% / 0.64",
  overlay: "0 0% 0% / 0.8",
  primaryButton: "0 0% 100% / 0.92",
  primaryButtonForeground: "140 6% 8%",
  primaryButtonText: "140 6% 8%",
  primaryForeground: "140 87% 79%",
  radius: "0.5rem",
  surface: "120 3% 13%",
  text: "0 0% 100% / 0.92",
};

/** @deprecated Use DEFAULT_THEME_TOKENS instead. */
export const DEFAULT_COLORS = DEFAULT_THEME_TOKENS;

/** CSS variable names mapped to SwapKitThemeTokens keys */
const THEME_TOKEN_VAR_MAP: Record<keyof SwapKitThemeTokens, string> = {
  accent: "--sk-ui-accent",
  accentForeground: "--sk-ui-accent-foreground",
  active: "--sk-bg-active",
  background: "--sk-bg",
  border: "--sk-ui-border",
  fontFamily: "--sk-ui-font-family",
  hover: "--sk-bg-hover",
  mutedForeground: "--sk-ui-muted-foreground",
  mutedText: "--sk-ui-muted-foreground",
  overlay: "--sk-bg-overlay",
  primaryButton: "--sk-ui-primary-button",
  primaryButtonForeground: "--sk-ui-primary-button-foreground",
  primaryButtonText: "--sk-ui-primary-button-text",
  primaryForeground: "--sk-ui-primary",
  radius: "--sk-ui-radius",
  surface: "--sk-bg-surface",
  text: "--sk-ui-primary-foreground",
};

/**
 * Applies custom theme tokens to CSS variables on a DOM element.
 * Only sets variables for tokens that are provided.
 * Also sets derived variables that reference base variables to ensure
 * proper cascading (CSS var() references resolve at definition scope, not use scope).
 */
export function applyThemeTokensToElement(element: HTMLElement, tokens: SwapKitThemeTokens) {
  for (const [key, value] of Object.entries(tokens)) {
    if (value) {
      const varName = THEME_TOKEN_VAR_MAP[key as keyof SwapKitThemeTokens];
      element.style.setProperty(varName, value);

      // Derived variables must be set explicitly (CSS var() resolves at definition scope)
      if (key === "background") {
        element.style.setProperty("--sk-ui-background", value);
        element.style.setProperty("--sk-ui-sidebar-background", value);
        element.style.setProperty("--sk-ui-sidebar-primary", value);
      }
      if (key === "surface") {
        element.style.setProperty("--sk-ui-card", value);
        element.style.setProperty("--sk-ui-secondary", value);
        element.style.setProperty("--sk-ui-muted", value);
      }
      if (key === "primaryForeground") {
        element.style.setProperty("--sk-ui-accent", value);
      }
      if (key === "primaryButtonText") {
        element.style.setProperty("--sk-ui-accent-foreground", value);
      }
      if (key === "text") {
        element.style.setProperty("--sk-ui-foreground", value);
        element.style.setProperty("--sk-ui-secondary-foreground", value);
        element.style.setProperty("--sk-ui-card-foreground", value);
      }
    }
  }
}

/** @deprecated Use applyThemeTokensToElement instead. */
export const applyColorsToElement = applyThemeTokensToElement;

/**
 * Generates inline style object for React components.
 * Returns CSS custom property declarations for provided theme tokens.
 */
export function getThemeTokenStyleProps(tokens?: SwapKitThemeTokens): React.CSSProperties {
  if (!tokens) return {};

  const style: Record<string, string> = {};

  for (const [key, value] of Object.entries(tokens)) {
    if (value) {
      const varName = THEME_TOKEN_VAR_MAP[key as keyof SwapKitThemeTokens];
      style[varName] = value;
    }
  }

  return style as React.CSSProperties;
}

/** @deprecated Use getThemeTokenStyleProps instead. */
export const getColorsStyleProps = getThemeTokenStyleProps;
