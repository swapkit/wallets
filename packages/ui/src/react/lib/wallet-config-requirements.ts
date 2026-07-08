import { swapKitConfigStore, WalletOption } from "@swapkit/helpers";
import { useMemo } from "react";
import { useStore } from "zustand/react";

/**
 * Per-wallet declaration of which form-field paths must be set for the SDK
 * connect path to succeed. Verified against the actual `@swapkit/wallets` /
 * `@swapkit/wallet-hardware` / `@swapkit/toolboxes` source (April 2026):
 *
 *   - WalletConnect, Xaman, Radix, Passkeys throw at connect time
 *     when their required keys are missing.
 *   - Trezor, Coinbase, NEAR fall back to (broken/empty) defaults at SDK
 *     init — they don't throw but still need credentials to actually work.
 *
 * `link` is the canonical page where the credential is acquired; rendered as a
 * "Get yours" affordance next to the wallet's config block in the studio.
 */
export type WalletConfigRequirement = {
  /** Hard-required fields — connect will throw without them. */
  required: ReadonlyArray<{ path: ConfigPath; label: string }>;
  /** Soft-required — SDK won't throw, but the connect won't be functional. */
  recommended: ReadonlyArray<{ path: ConfigPath; label: string }>;
  /** Where the user gets the credential. */
  link: string;
};

/** Dotted form-field path (e.g. `apiKeys.walletConnectProjectId`). */
export type ConfigPath = string;

export const WALLET_CONFIG_REQUIREMENTS: Partial<Record<WalletOption, WalletConfigRequirement>> = {
  [WalletOption.WALLETCONNECT]: {
    link: "https://cloud.reown.com",
    recommended: [],
    required: [{ label: "Project ID", path: "apiKeys.walletConnectProjectId" }],
  },
  [WalletOption.XAMAN]: {
    link: "https://apps.xumm.dev",
    recommended: [],
    required: [{ label: "API Key", path: "apiKeys.xaman" }],
  },
  [WalletOption.RADIX_WALLET]: {
    link: "https://console.radixdlt.com",
    recommended: [],
    required: [
      { label: "dApp Definition Address", path: "integrations.radix.dAppDefinitionAddress" },
      { label: "Application Name", path: "integrations.radix.applicationName" },
      { label: "Application Version", path: "integrations.radix.applicationVersion" },
    ],
  },
  // KeepKey is intentionally not treated as config-required until hosted
  // widget support is ready. Add its bridge/API requirements back alongside
  // the sidebar config block when support lands.
  [WalletOption.PASSKEYS]: {
    link: "https://passkeys.foundation/",
    recommended: [],
    required: [{ label: "App ID", path: "apiKeys.passkeys" }],
  },
  [WalletOption.TREZOR]: {
    link: "https://connect.trezor.io/9/methods/other/init/",
    recommended: [
      { label: "Email", path: "integrations.trezor.email" },
      { label: "App URL", path: "integrations.trezor.appUrl" },
    ],
    // Trezor SDK falls back to empty fields, but TrezorConnect will reject
    // them at runtime. Treat as soft-required from our perspective.
    required: [],
  },
  [WalletOption.COINBASE_WEB]: {
    link: "https://github.com/coinbase/coinbase-wallet-sdk#basic-usage",
    recommended: [{ label: "App Name", path: "integrations.coinbase.appName" }],
    required: [],
  },
  [WalletOption.COINBASE_MOBILE]: {
    link: "https://github.com/coinbase/coinbase-wallet-sdk#basic-usage",
    recommended: [{ label: "App Name", path: "integrations.coinbase.appName" }],
    required: [],
  },
  // TrustWallet (mobile) connects via WalletConnect under the hood, so it
  // shares WalletConnect's hard requirement. Declaring it here means a
  // missing Project ID auto-disables both wallets via the same disallowed
  // set — no parallel `WALLETS_REQUIRING_WALLETCONNECT_KEY` table to maintain.
  [WalletOption.TRUSTWALLET_WEB]: {
    link: "https://cloud.reown.com",
    recommended: [],
    required: [{ label: "Project ID", path: "apiKeys.walletConnectProjectId" }],
  },
};

/** Walk a dotted path on a nested object and return whether it resolves to a non-empty string. */
function readPath(values: unknown, path: ConfigPath): string {
  const parts = path.split(".");
  let cursor: unknown = values;
  for (const part of parts) {
    if (cursor && typeof cursor === "object" && part in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return "";
    }
  }
  return typeof cursor === "string" ? cursor : "";
}

/**
 * The single producer of "wallets we should not let through" — every consumer
 * (the widget's connect dialog, the studio's wallet toggles, the form's
 * effective `enabledWalletOptions`) reads from here so adding a new wallet
 * with a `required` field automatically removes it from all three surfaces
 * until its credential lands.
 *
 * Pure function: `state` is any nested object exposing the
 * `apiKeys.{…}` / `integrations.{…}.{…}` paths declared in
 * `WALLET_CONFIG_REQUIREMENTS`. The studio's form values, SKConfig's state,
 * and a partial mock all work.
 */
export function getDisallowedWallets(state: unknown): Set<WalletOption> {
  const disallowed = new Set<WalletOption>();
  for (const [walletKey, req] of Object.entries(WALLET_CONFIG_REQUIREMENTS)) {
    if (!req || req.required.length === 0) continue;
    for (const { path } of req.required) {
      if (!readPath(state, path)) {
        disallowed.add(walletKey as WalletOption);
        break;
      }
    }
  }
  return disallowed;
}

/**
 * React hook variant — subscribes to the relevant SKConfig slices so the
 * returned set is live. Used by `isWalletAllowed` and `WalletSelectionField`.
 */
export function useDisallowedWallets(): Set<WalletOption> {
  const apiKeys = useStore(swapKitConfigStore, (state) => state?.apiKeys);
  const integrations = useStore(
    swapKitConfigStore,
    (state) => (state as { integrations?: Record<string, unknown> })?.integrations,
  );
  return useMemo(() => getDisallowedWallets({ apiKeys, integrations }), [apiKeys, integrations]);
}

export type MissingConfigSummary = {
  wallet: WalletOption;
  link: string;
  missingRequired: ReadonlyArray<{ path: ConfigPath; label: string }>;
  missingRecommended: ReadonlyArray<{ path: ConfigPath; label: string }>;
};

/**
 * For every enabled wallet that has a configuration requirement, return the
 * subset of fields that haven't been filled in. Empty array means everything
 * configured wallets need is present.
 */
export function detectMissingWalletConfig(
  values: unknown,
  enabledWallets: WalletOption[] | "all",
): MissingConfigSummary[] {
  const isEnabled = (wallet: WalletOption): boolean => enabledWallets === "all" || enabledWallets.includes(wallet);

  const summaries: MissingConfigSummary[] = [];
  for (const [walletKey, req] of Object.entries(WALLET_CONFIG_REQUIREMENTS)) {
    const wallet = walletKey as WalletOption;
    if (!isEnabled(wallet) || !req) continue;

    const missingRequired = req.required.filter(({ path }) => !readPath(values, path));
    const missingRecommended = req.recommended.filter(({ path }) => !readPath(values, path));
    if (missingRequired.length === 0 && missingRecommended.length === 0) continue;

    summaries.push({ link: req.link, missingRecommended, missingRequired, wallet });
  }

  return summaries;
}
