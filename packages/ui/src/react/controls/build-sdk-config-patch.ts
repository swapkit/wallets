import type { ControlsStoreFieldValues } from "../types";

type FormApiKeys = ControlsStoreFieldValues["apiKeys"];
type FormIntegrations = ControlsStoreFieldValues["integrations"];

type SdkConfigPatch = {
  apiKeys?: Partial<{ walletConnectProjectId: string; xaman: string; passkeys: string; keepKey: string }>;
  integrations?: Partial<{
    coinbase: { appName: string; appLogoUrl?: string };
    trezor: { email: string; appUrl: string };
    keepKey: { name: string; imageUrl: string; basePath: string; url: string };
    radix: {
      dAppDefinitionAddress: string;
      applicationName: string;
      applicationVersion: string;
      network: { networkId: number; networkName: string; dashboardBase: string };
    };
  }>;
};

/**
 * Convert the form's flat-string wallet config into a partial `SKConfig.set` payload.
 *
 * Rules:
 * - `apiKeys`: each key contributes independently — empty strings are dropped, anything
 *   non-empty is forwarded verbatim. SKConfig deep-merges per-key, so this is safe.
 * - `integrations`: the SDK store does a *shallow* spread on the integration sub-object
 *   (`integrations.coinbase = {...prev, ...next}`), so we must forward a complete block
 *   per integration or the partial merge would corrupt the existing entry. Each block
 *   is only emitted when its hard-required fields are present.
 *
 * Empty input maps to `{}` — the caller can `if (Object.keys(patch).length === 0)` skip.
 */
export function buildSdkConfigPatch({
  apiKeys,
  integrations,
}: {
  // Optional + every leaf is read with optional chaining: callers passing a
  // partially-hydrated form (e.g. legacy localStorage shapes) get an empty
  // patch instead of a runtime crash. The form-hook hydration step still
  // merges defaults so this is belt-and-suspenders, not the primary defence.
  apiKeys?: Partial<FormApiKeys>;
  integrations?: Partial<FormIntegrations>;
}): SdkConfigPatch {
  const patch: SdkConfigPatch = {};

  const sdkApiKeys: NonNullable<SdkConfigPatch["apiKeys"]> = {};
  if (apiKeys?.walletConnectProjectId) sdkApiKeys.walletConnectProjectId = apiKeys.walletConnectProjectId;
  if (apiKeys?.xaman) sdkApiKeys.xaman = apiKeys.xaman;
  if (apiKeys?.passkeys) sdkApiKeys.passkeys = apiKeys.passkeys;
  if (apiKeys?.keepKey) sdkApiKeys.keepKey = apiKeys.keepKey;
  if (Object.keys(sdkApiKeys).length > 0) patch.apiKeys = sdkApiKeys;

  const sdkIntegrations: NonNullable<SdkConfigPatch["integrations"]> = {};

  const cb = integrations?.coinbase;
  if (cb?.appName) {
    sdkIntegrations.coinbase = { appName: cb.appName, ...(cb.appLogoUrl && { appLogoUrl: cb.appLogoUrl }) };
  }

  const tz = integrations?.trezor;
  if (tz?.email && tz.appUrl) {
    sdkIntegrations.trezor = { appUrl: tz.appUrl, email: tz.email };
  }

  const kk = integrations?.keepKey;
  if (kk?.url && kk.basePath) {
    sdkIntegrations.keepKey = { basePath: kk.basePath, imageUrl: kk.imageUrl ?? "", name: kk.name ?? "", url: kk.url };
  }

  const rdx = integrations?.radix;
  if (rdx?.dAppDefinitionAddress && rdx.applicationName && rdx.applicationVersion) {
    const parsedNetworkId = Number.parseInt(rdx.networkId ?? "1", 10);
    sdkIntegrations.radix = {
      applicationName: rdx.applicationName,
      applicationVersion: rdx.applicationVersion,
      dAppDefinitionAddress: rdx.dAppDefinitionAddress,
      network: {
        dashboardBase: rdx.dashboardBase || "https://dashboard.radixdlt.com",
        networkId: Number.isFinite(parsedNetworkId) ? parsedNetworkId : 1,
        networkName: rdx.networkName || "mainnet",
      },
    };
  }

  if (Object.keys(sdkIntegrations).length > 0) patch.integrations = sdkIntegrations;

  return patch;
}
