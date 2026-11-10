import "@swapkit/wallets/register";

import type { Chain, ProviderName, TokenNames } from "@swapkit/helpers";
import { WalletOption } from "@swapkit/helpers";

const getAssetsBaseUrl = () => "https://tokens.swapkit.dev";

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

const WALLET_LOGO_ALIASES: Partial<Record<WalletOption, WalletOption>> = {
  [WalletOption.LEDGER_WALLET_PROVIDER]: WalletOption.LEDGER,
};

export const getWalletLogoUrl = (wallet: WalletOption | (string & {})) => {
  const logoWallet = WALLET_LOGO_ALIASES[wallet as WalletOption] ?? wallet;
  return `${getAssetsBaseUrl()}/images/wallets/${logoWallet?.toLowerCase()}.png`;
};

export const WALLET_DISPLAY_NAMES: Partial<Record<WalletOption, string>> = {
  [WalletOption.BITGET]: "Bitget",
  [WalletOption.BRAVE]: "Brave",
  [WalletOption.COINBASE_MOBILE]: "Coinbase",
  [WalletOption.COINBASE_WEB]: "Coinbase",
  [WalletOption.COSMOSTATION]: "Cosmostation",
  [WalletOption.EIP6963]: "Browser Wallet",
  [WalletOption.EXODUS]: "Exodus",
  [WalletOption.KEEPKEY]: "KeepKey",
  [WalletOption.KEEPKEY_BEX]: "KeepKey",
  [WalletOption.KEPLR]: "Keplr",
  [WalletOption.KEYSTORE]: "Keystore",
  [WalletOption.LEDGER]: "Ledger",
  [WalletOption.LEDGER_WALLET_PROVIDER]: "Ledger Wallet",
  [WalletOption.METAMASK]: "MetaMask",
  [WalletOption.OKX]: "OKX",
  [WalletOption.OKX_MOBILE]: "OKX",
  [WalletOption.ONEKEY]: "OneKey",
  [WalletOption.PASSKEYS]: "Passkeys",
  [WalletOption.PHANTOM]: "Phantom",
  [WalletOption.RADIX_WALLET]: "Radix Wallet",
  [WalletOption.TALISMAN]: "Talisman",
  [WalletOption.TON_CONNECT]: "TON Connect",
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
  /** Success state colour (confirmations, valid input). Its tinted background is derived */
  success?: string;
  /** Warning state colour (recovery phrase notice, experimental badges) */
  warning?: string;
  /** Error state colour (validation errors, failed transactions) */
  error?: string;
  /** Informational state colour */
  info?: string;
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
  error: "0 91% 74%",
  fontFamily:
    'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  hover: "0 0% 100% / 0.08",
  info: "213 94% 68%",
  mutedForeground: "0 0% 100% / 0.64",
  mutedText: "0 0% 100% / 0.64",
  overlay: "0 0% 0% / 0.8",
  primaryButton: "0 0% 100% / 0.92",
  primaryButtonForeground: "140 6% 8%",
  primaryButtonText: "140 6% 8%",
  primaryForeground: "140 87% 79%",
  radius: "0.5rem",
  success: "142 71% 45%",
  surface: "120 3% 13%",
  text: "0 0% 100% / 0.92",
  warning: "48 96% 53%",
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
  error: "--sk-ui-error-foreground",
  fontFamily: "--sk-ui-font-family",
  hover: "--sk-bg-hover",
  info: "--sk-ui-info-foreground",
  mutedForeground: "--sk-ui-muted-foreground",
  mutedText: "--sk-ui-muted-foreground",
  overlay: "--sk-bg-overlay",
  primaryButton: "--sk-ui-primary-button",
  primaryButtonForeground: "--sk-ui-primary-button-foreground",
  primaryButtonText: "--sk-ui-primary-button-text",
  primaryForeground: "--sk-ui-primary",
  radius: "--sk-ui-radius",
  success: "--sk-ui-success-foreground",
  surface: "--sk-bg-surface",
  text: "--sk-ui-primary-foreground",
  warning: "--sk-ui-warning-foreground",
};

// Derived variables must be set explicitly (CSS var() resolves at definition scope)
const DERIVED_THEME_VARS: Partial<Record<keyof SwapKitThemeTokens, string[]>> = {
  background: ["--sk-ui-background", "--sk-ui-sidebar-background", "--sk-ui-sidebar-primary"],
  primaryButtonText: ["--sk-ui-accent-foreground"],
  primaryForeground: ["--sk-ui-accent"],
  surface: ["--sk-ui-card", "--sk-ui-secondary", "--sk-ui-muted"],
  text: ["--sk-ui-foreground", "--sk-ui-secondary-foreground", "--sk-ui-card-foreground"],
};

// Status backgrounds are the status colour at low opacity, so one token drives both
const STATUS_TINT_VARS: Partial<Record<keyof SwapKitThemeTokens, string>> = {
  error: "--sk-ui-error",
  info: "--sk-ui-info",
  success: "--sk-ui-success",
  warning: "--sk-ui-warning",
};
const STATUS_TINT_ALPHA = 0.16;

// Tinted background for a status colour; strips any alpha the integrator passed
function toStatusTint(value: string) {
  return `${(value.split("/")[0] ?? value).trim()} / ${STATUS_TINT_ALPHA}`;
}

/**
 * Resolves theme tokens into the CSS variables they control, including derived ones.
 * Only includes variables for tokens that are provided.
 */
export function getThemeTokenCssVariables(tokens?: SwapKitThemeTokens): Record<string, string> {
  const variables: Record<string, string> = {};
  if (!tokens) return variables;

  for (const [key, value] of Object.entries(tokens)) {
    const tokenKey = key as keyof SwapKitThemeTokens;
    const varName = THEME_TOKEN_VAR_MAP[tokenKey];
    if (!value || !varName) continue;

    variables[varName] = value;
    for (const derived of DERIVED_THEME_VARS[tokenKey] ?? []) variables[derived] = value;

    const tintVar = STATUS_TINT_VARS[tokenKey];
    if (tintVar) variables[tintVar] = toStatusTint(value);
  }

  return variables;
}

/**
 * Applies custom theme tokens to CSS variables on a DOM element.
 */
export function applyThemeTokensToElement(element: HTMLElement, tokens: SwapKitThemeTokens) {
  for (const [varName, value] of Object.entries(getThemeTokenCssVariables(tokens))) {
    element.style.setProperty(varName, value);
  }
}

/** @deprecated Use applyThemeTokensToElement instead. */
export const applyColorsToElement = applyThemeTokensToElement;

/**
 * Generates inline style object for React components.
 * Returns CSS custom property declarations for provided theme tokens.
 */
export function getThemeTokenStyleProps(tokens?: SwapKitThemeTokens): React.CSSProperties {
  return getThemeTokenCssVariables(tokens) as React.CSSProperties;
}

/** @deprecated Use getThemeTokenStyleProps instead. */
export const getColorsStyleProps = getThemeTokenStyleProps;
