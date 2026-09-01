"use client";

import { type LocalModeConfig, SKConfig, type WalletOption } from "@swapkit/helpers";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFormControl, useForm } from "react-hook-form";
import type { SwapKitThemeTokens } from "../components/config";
import { ALL_CONTROLLABLE_WALLETS } from "../components/ui/wallet-selection-field";
import {
  detectMissingWalletConfig,
  getDisallowedWallets,
  type MissingConfigSummary,
} from "../lib/wallet-config-requirements";
import type { ControlsStoreFieldValues } from "../types";
import { buildSdkConfigPatch } from "./build-sdk-config-patch";

declare const __SWAPKIT_IS_DEV__: boolean | undefined;

const defaultApiUrl = SKConfig.getState().envs.apiUrl;
const defaultDevApiUrl = SKConfig.getState().envs.devApiUrl;
// Hardcoded fallback so the form's local-mode object is ALWAYS fully shaped,
// even if SKConfig.getState().localMode is undefined — e.g. an older bundled
// @swapkit/helpers, a stale bundler dep cache, or localStorage written before
// the field existed. Without this, the form default is undefined and the very
// first render crashes reading `localMode.enabled`.
const FALLBACK_LOCAL_MODE: LocalModeConfig = {
  enabled: false,
  quoteUrl: "http://localhost:3000",
  swapUrl: "http://localhost:3001",
};
// Seed from the SDK defaults when present, otherwise the hardcoded fallback.
const defaultLocalMode: LocalModeConfig = SKConfig.getState().localMode ?? FALLBACK_LOCAL_MODE;

function normalizeApiUrl(url: string | null | undefined): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("localhost") || trimmed.startsWith("127.0.0.1")) return `http://${trimmed}`;
  return `https://${trimmed}`;
}

function applyRuntimeSkConfig({
  apiBaseUrl,
  apiKey,
  apiKeys,
  developMode,
  devApiUrl,
  integrations,
  localMode,
  useApiKeyAuth,
  useV3SwapFlow,
  widgetId,
  widgetKey,
}: Pick<
  ControlsStoreFieldValues,
  | "apiBaseUrl"
  | "apiKey"
  | "apiKeys"
  | "developMode"
  | "devApiUrl"
  | "integrations"
  | "localMode"
  | "useApiKeyAuth"
  | "useV3SwapFlow"
  | "widgetId"
  | "widgetKey"
>) {
  SKConfig.set({ v3SwapFlow: { enabled: useV3SwapFlow } });
  SKConfig.setEnv("apiUrl", normalizeApiUrl(apiBaseUrl) ?? defaultApiUrl);
  SKConfig.setEnv("isDev", developMode);
  SKConfig.setEnv("devApiUrl", normalizeApiUrl(devApiUrl) ?? defaultDevApiUrl);
  SKConfig.set({ localMode });

  if (useApiKeyAuth) {
    SKConfig.set({ apiKeys: { swapKit: apiKey } });
    SKConfig.setWidgetId("");
    SKConfig.setWidgetKey("");
  } else {
    SKConfig.set({ apiKeys: { swapKit: "" } });
    SKConfig.setWidgetId(widgetId);
    SKConfig.setWidgetKey(widgetKey);
  }

  const patch = buildSdkConfigPatch({ apiKeys, integrations });
  if (Object.keys(patch).length > 0) SKConfig.set(patch);
}

const defaultValues: ControlsStoreFieldValues = {
  apiBaseUrl: defaultApiUrl,
  apiKey: "",

  apiKeys: { keepKey: "", passkeys: "", walletConnectProjectId: "", xaman: "" },
  borderRadius: "0.5rem",
  colorAccent: "140 87% 79%", // --sk-ui-accent (brand/accent color)
  colorBgActive: "0 0% 100% / 0.12", // --sk-bg-active (pressed/active)
  colorBgHover: "0 0% 100% / 0.08", // --sk-bg-hover (subtle)
  colorBgOverlay: "0 0% 0% / 0.8", // --sk-bg-overlay (modal overlay)
  colorBorder: "0 0% 100% / 0.12", // --sk-ui-border
  colorMutedText: "0 0% 100% / 0.64", // --sk-ui-muted-foreground (subtle text)

  colorPrimary: "140 6% 8%", // --sk-bg (primary background)
  colorPrimaryButton: "0 0% 100% / 0.92", // --sk-ui-primary-button (primary button background)
  colorPrimaryButtonText: "140 6% 8%", // --sk-ui-primary-button-text (text on primary buttons)
  colorSecondary: "120 3% 13%", // --sk-bg-surface (secondary background)
  colorText: "0 0% 100% / 0.92", // --sk-ui-primary-foreground (main text)
  devApiUrl: "",

  developMode: typeof __SWAPKIT_IS_DEV__ !== "undefined" ? __SWAPKIT_IS_DEV__ : false,

  enabledChains: "all" as const,
  enabledWalletOptions: "all" as const,
  fontFamily:
    'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',

  inputAsset: "",
  integrations: {
    coinbase: { appLogoUrl: "", appName: "" },
    keepKey: {
      // All fields default to empty so buildSdkConfigPatch only emits a
      // KeepKey integration block when the user explicitly opts in. The
      // localhost bridge URLs live as placeholders on the inputs.
      basePath: "",
      imageUrl: "",
      name: "",
      url: "",
    },
    radix: {
      applicationName: "",
      applicationVersion: "",
      dAppDefinitionAddress: "",
      dashboardBase: "https://dashboard.radixdlt.com",
      networkId: "1",
      networkName: "mainnet",
    },
    trezor: { appUrl: "", email: "" },
  },
  localMode: defaultLocalMode,
  outputAsset: "",
  // "{}" rather than "": the editor opens as a valid empty object, and the
  // parse-at-point-of-use treats an empty object as "send nothing".
  quoteParams: "{}",
  requestParamsEnabled: false,
  swapParams: "{}",

  useApiKeyAuth: false,

  useV3SwapFlow: true,
  widgetId: "",
  widgetKey: "",
};

// Eagerly apply persisted auth config to SKConfig before any component renders,
// so the first API requests (e.g. price fetches) already carry the correct auth.
function hydrateSkConfigFromLocalStorage() {
  if (typeof window === "undefined") return;

  try {
    const raw = localStorage.getItem("formValues");
    if (!raw) return;

    const parsed = JSON.parse(raw);

    if (parsed.useApiKeyAuth && parsed.apiKey) {
      SKConfig.set({ apiKeys: { swapKit: parsed.apiKey } });
      SKConfig.setWidgetId("");
      SKConfig.setWidgetKey("");
    } else if (parsed.widgetId && parsed.widgetKey) {
      SKConfig.set({ apiKeys: { swapKit: "" } });
      SKConfig.setWidgetId(parsed.widgetId);
      SKConfig.setWidgetKey(parsed.widgetKey);
    }

    if (parsed.developMode != null) {
      SKConfig.setEnv("isDev", parsed.developMode);
    }
    if (parsed.apiBaseUrl) {
      SKConfig.setEnv("apiUrl", normalizeApiUrl(parsed.apiBaseUrl) ?? defaultApiUrl);
    }
    if (parsed.devApiUrl) {
      SKConfig.setEnv("devApiUrl", normalizeApiUrl(parsed.devApiUrl) ?? defaultDevApiUrl);
    }
    if (parsed.localMode) {
      SKConfig.set({ localMode: { ...defaultLocalMode, ...parsed.localMode } });
    }

    // Apply persisted SDK-level wallet config so the very first connect attempt
    // (no React render needed) sees credentials from the previous session.
    if (parsed.apiKeys || parsed.integrations) {
      const patch = buildSdkConfigPatch({
        apiKeys: { keepKey: "", passkeys: "", walletConnectProjectId: "", xaman: "", ...parsed.apiKeys },
        integrations: {
          coinbase: { appLogoUrl: "", appName: "", ...parsed.integrations?.coinbase },
          keepKey: { basePath: "", imageUrl: "", name: "", url: "", ...parsed.integrations?.keepKey },
          radix: {
            applicationName: "",
            applicationVersion: "",
            dAppDefinitionAddress: "",
            dashboardBase: "https://dashboard.radixdlt.com",
            networkId: "1",
            networkName: "mainnet",
            ...parsed.integrations?.radix,
          },
          trezor: { appUrl: "", email: "", ...parsed.integrations?.trezor },
        },
      });
      if (Object.keys(patch).length > 0) SKConfig.set(patch);
    }
  } catch {
    // Invalid localStorage data — ignore, the useEffect will handle cleanup
  }
}

hydrateSkConfigFromLocalStorage();

const formControlInstance = createFormControl<ControlsStoreFieldValues>({ defaultValues });

export const useSwapKitWidgetControlsForm = () => {
  const [isHydrated, setIsHydrated] = useState(false);
  const appliedRuntimeConfig = useRef<string>("");
  const previousValues = useRef<string>("");
  const form = useForm({ formControl: formControlInstance });

  const [
    apiBaseUrl,
    widgetId,
    widgetKey,
    useV3SwapFlow,
    enabledChains,
    enabledWalletOptions,
    inputAsset,
    outputAsset,
    useApiKeyAuth,
    apiKey,
    developMode,
    devApiUrl,
    watchedLocalMode,
    colorPrimary,
    colorSecondary,
    colorPrimaryButton,
    colorPrimaryButtonText,
    colorAccent,
    colorBgHover,
    colorBgActive,
    colorBgOverlay,
    colorBorder,
    colorText,
    colorMutedText,
    borderRadius,
    fontFamily,
    apiKeys,
    integrations,
    quoteParams,
    swapParams,
    requestParamsEnabled,
  ] = form.watch([
    "apiBaseUrl",
    "widgetId",
    "widgetKey",
    "useV3SwapFlow",
    "enabledChains",
    "enabledWalletOptions",
    "inputAsset",
    "outputAsset",
    "useApiKeyAuth",
    "apiKey",
    "developMode",
    "devApiUrl",
    "localMode",
    "colorPrimary",
    "colorSecondary",
    "colorPrimaryButton",
    "colorPrimaryButtonText",
    "colorAccent",
    "colorBgHover",
    "colorBgActive",
    "colorBgOverlay",
    "colorBorder",
    "colorText",
    "colorMutedText",
    "borderRadius",
    "fontFamily",
    "apiKeys",
    "integrations",
    "quoteParams",
    "swapParams",
    "requestParamsEnabled",
  ]);

  // Never let local mode be undefined downstream: watch can return undefined for
  // a field absent from older persisted state, and consumers read localMode.enabled.
  const localMode = watchedLocalMode ?? defaultLocalMode;

  const stringifiedValues = JSON.stringify({
    apiBaseUrl,
    apiKey,
    apiKeys,
    borderRadius,
    colorAccent,
    colorBgActive,
    colorBgHover,
    colorBgOverlay,
    colorBorder,
    colorMutedText,
    colorPrimary,
    colorPrimaryButton,
    colorPrimaryButtonText,
    colorSecondary,
    colorText,
    devApiUrl,
    developMode,
    enabledChains,
    enabledWalletOptions,
    fontFamily,
    inputAsset,
    integrations,
    localMode,
    outputAsset,
    quoteParams,
    requestParamsEnabled,
    swapParams,
    useApiKeyAuth,
    useV3SwapFlow,
    widgetId,
    widgetKey,
  });

  useEffect(() => {
    const persistedValues = localStorage.getItem("formValues");

    if (!persistedValues) {
      setIsHydrated(true);
      return;
    }

    try {
      const parsed = JSON.parse(persistedValues);
      // Deep-merge persisted values with defaults so the form's nested
      // objects (apiKeys, integrations.*) are always fully populated, even
      // for users with localStorage from before those keys existed.
      // Without this, form.reset leaves them `undefined` and downstream
      // helpers (buildSdkConfigPatch, the wallet-config UI) crash.
      form.reset(
        {
          ...defaultValues,
          ...parsed,
          apiKeys: { ...defaultValues.apiKeys, ...parsed.apiKeys },
          integrations: {
            ...defaultValues.integrations,
            ...parsed.integrations,
            coinbase: { ...defaultValues.integrations.coinbase, ...parsed.integrations?.coinbase },
            keepKey: { ...defaultValues.integrations.keepKey, ...parsed.integrations?.keepKey },
            radix: { ...defaultValues.integrations.radix, ...parsed.integrations?.radix },
            trezor: { ...defaultValues.integrations.trezor, ...parsed.integrations?.trezor },
          },
          localMode: { ...defaultValues.localMode, ...parsed.localMode },
        },
        { keepDefaultValues: true },
      );
    } catch {
      localStorage.removeItem("formValues");
    }

    setIsHydrated(true);
  }, [form]);

  useEffect(() => {
    if (!form.formState.isReady) return;
    if (previousValues.current === stringifiedValues) return;

    localStorage.setItem("formValues", stringifiedValues);

    window.dispatchEvent(new CustomEvent("swapkit-settings-changed"));

    previousValues.current = stringifiedValues;
  }, [stringifiedValues, form.formState.isReady]);

  useEffect(() => {
    const colorMappings: [string | undefined, string[]][] = [
      [colorPrimary, ["--sk-bg", "--sk-ui-background", "--sk-ui-sidebar-background", "--sk-ui-sidebar-primary"]],
      [colorSecondary, ["--sk-bg-surface", "--sk-ui-card", "--sk-ui-secondary", "--sk-ui-muted"]],
      [colorPrimaryButton, ["--sk-ui-primary-button"]],
      [colorPrimaryButtonText, ["--sk-ui-primary-button-text", "--sk-ui-primary-button-foreground"]],
      [colorAccent, ["--sk-ui-accent"]],
      [colorBgHover, ["--sk-bg-hover"]],
      [colorBgActive, ["--sk-bg-active"]],
      [colorBgOverlay, ["--sk-bg-overlay"]],
      [colorBorder, ["--sk-ui-border"]],
      [borderRadius, ["--sk-ui-radius"]],
      [fontFamily, ["--sk-ui-font-family"]],
      [
        colorText,
        ["--sk-ui-primary-foreground", "--sk-ui-foreground", "--sk-ui-secondary-foreground", "--sk-ui-card-foreground"],
      ],
      [colorMutedText, ["--sk-ui-muted-foreground"]],
    ];

    const applyColorVariables = (element: HTMLElement) => {
      for (const [color, vars] of colorMappings) {
        if (!color) continue;
        for (const v of vars) element.style.setProperty(v, color);
      }
    };

    const applyToAllElements = () => {
      const allPreflightElements = document.querySelectorAll(".swapkit-ui-preflight:not(.swapkit-controls-sidebar)");
      for (const element of allPreflightElements) {
        if (element instanceof HTMLElement) {
          applyColorVariables(element);
        }
      }
    };

    applyToAllElements();

    // Ensure entire page background matches theme in standalone mode
    if (colorPrimary) {
      document.documentElement.style.setProperty("background", `hsl(${colorPrimary})`);
      document.body.style.setProperty("background", `hsl(${colorPrimary})`);
    }

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: performance optimization
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "childList") continue;

        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          const isPreflightElement =
            node.classList.contains("swapkit-ui-preflight") && !node.classList.contains("swapkit-controls-sidebar");

          if (isPreflightElement) {
            applyColorVariables(node);
            continue;
          }

          if (node.querySelector(".swapkit-ui-preflight:not(.swapkit-controls-sidebar)")) {
            applyToAllElements();
            break;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [
    colorPrimary,
    colorSecondary,
    colorPrimaryButton,
    colorPrimaryButtonText,
    colorAccent,
    colorBgHover,
    colorBgActive,
    colorBgOverlay,
    colorBorder,
    colorText,
    colorMutedText,
    borderRadius,
    fontFamily,
  ]);

  useEffect(() => {
    if (!isHydrated) return;
    SKConfig.set({ v3SwapFlow: { enabled: useV3SwapFlow } });
  }, [isHydrated, useV3SwapFlow]);

  useEffect(() => {
    if (!isHydrated) return;
    SKConfig.setEnv("apiUrl", normalizeApiUrl(apiBaseUrl) ?? defaultApiUrl);
    SKConfig.setEnv("isDev", developMode);
    SKConfig.setEnv("devApiUrl", normalizeApiUrl(devApiUrl) ?? defaultDevApiUrl);
    SKConfig.set({ localMode });
  }, [isHydrated, apiBaseUrl, developMode, devApiUrl, localMode]);

  useEffect(() => {
    if (!isHydrated) return;
    if (useApiKeyAuth) {
      SKConfig.set({ apiKeys: { swapKit: apiKey } });
      SKConfig.setWidgetId("");
      SKConfig.setWidgetKey("");
    } else {
      SKConfig.set({ apiKeys: { swapKit: "" } });
      SKConfig.setWidgetId(widgetId);
      SKConfig.setWidgetKey(widgetKey);
    }
  }, [isHydrated, useApiKeyAuth, apiKey, widgetId, widgetKey]);

  // Push the wallet/integration credentials into SKConfig whenever the form
  // changes. Only non-empty values reach the SDK — empty inputs leave whatever
  // was previously set untouched (SKConfig.set is a partial merge).
  useEffect(() => {
    if (!isHydrated) return;
    const patch = buildSdkConfigPatch({ apiKeys, integrations });
    if (Object.keys(patch).length > 0) SKConfig.set(patch);
  }, [isHydrated, apiKeys, integrations]);

  const colors = useMemo((): SwapKitThemeTokens | undefined => {
    const themeTokenConfig: Array<[string | undefined, string, keyof SwapKitThemeTokens]> = [
      [colorPrimary, "140 6% 8%", "background"],
      [colorSecondary, "120 3% 13%", "surface"],
      [colorPrimaryButton, "0 0% 100% / 0.92", "primaryButton"],
      [colorPrimaryButtonText, "140 6% 8%", "primaryButtonText"],
      [colorAccent, "140 87% 79%", "accent"],
      [colorBgHover, "0 0% 100% / 0.08", "hover"],
      [colorBgActive, "0 0% 100% / 0.12", "active"],
      [colorBgOverlay, "0 0% 0% / 0.8", "overlay"],
      [colorBorder, "0 0% 100% / 0.12", "border"],
      [colorText, "0 0% 100% / 0.92", "text"],
      [colorMutedText, "0 0% 100% / 0.64", "mutedText"],
      [borderRadius, "0.5rem", "radius"],
      [
        fontFamily,
        'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
        "fontFamily",
      ],
    ];

    const themeTokens = themeTokenConfig.reduce<SwapKitThemeTokens>((acc, [value, defaultValue, key]) => {
      if (value && value !== defaultValue) acc[key] = value;
      return acc;
    }, {});

    return Object.keys(themeTokens).length > 0 ? themeTokens : undefined;
  }, [
    colorPrimary,
    colorSecondary,
    colorPrimaryButton,
    colorPrimaryButtonText,
    colorAccent,
    colorBgHover,
    colorBgActive,
    colorBgOverlay,
    colorBorder,
    colorText,
    colorMutedText,
    borderRadius,
    fontFamily,
  ]);

  // --- Effective wallets (auto-disable when required config is missing) ---
  // The studio is editing a draft config, so derive disabled wallets from the
  // watched form values instead of SKConfig. SKConfig can lag behind when a
  // field is cleared because its setter is a partial merge.
  const configValues = useMemo(() => ({ apiKeys, integrations }), [apiKeys, integrations]);
  const disallowedWallets = useMemo(() => getDisallowedWallets(configValues), [configValues]);
  const missingConfigSummaries = useMemo<MissingConfigSummary[]>(
    () => detectMissingWalletConfig(configValues, enabledWalletOptions),
    [configValues, enabledWalletOptions],
  );
  const effectiveEnabledWalletOptions = useMemo<WalletOption[] | "all">(() => {
    if (disallowedWallets.size === 0) return enabledWalletOptions;
    // "all" is a sentinel — to express "everything except the disallowed set"
    // we have to materialize. Use the studio's controllable list as the base;
    // the widget defaults to the same set when given "all".
    const base = enabledWalletOptions === "all" ? ALL_CONTROLLABLE_WALLETS : enabledWalletOptions;
    return base.filter((w) => !disallowedWallets.has(w));
  }, [enabledWalletOptions, disallowedWallets]);
  const hasSwapToAuth = useMemo(() => {
    if (useApiKeyAuth) return Boolean(apiKey.trim());
    return Boolean(widgetId.trim() && widgetKey.trim());
  }, [useApiKeyAuth, apiKey, widgetId, widgetKey]);

  const runtimeConfigSnapshot = JSON.stringify({
    apiBaseUrl,
    apiKey,
    apiKeys,
    devApiUrl,
    developMode,
    integrations,
    localMode,
    useApiKeyAuth,
    useV3SwapFlow,
    widgetId,
    widgetKey,
  });

  if (isHydrated && appliedRuntimeConfig.current !== runtimeConfigSnapshot) {
    applyRuntimeSkConfig({
      apiBaseUrl,
      apiKey,
      apiKeys,
      devApiUrl,
      developMode,
      integrations,
      localMode,
      useApiKeyAuth,
      useV3SwapFlow,
      widgetId,
      widgetKey,
    });
    appliedRuntimeConfig.current = runtimeConfigSnapshot;
  }

  return useMemo(
    () => ({
      apiBaseUrl,
      apiKey,
      colors,
      devApiUrl,
      developMode,
      disallowedWallets,
      effectiveEnabledWalletOptions,
      enabledChains,
      enabledWalletOptions,
      form,
      hasSwapToAuth,
      inputAsset,
      isHydrated,
      localMode,
      missingConfigSummaries,
      outputAsset,
      quoteParams,
      requestParamsEnabled,
      swapParams,
      useApiKeyAuth,
      useV3SwapFlow,
      widgetId,
      widgetKey,
    }),
    [
      apiBaseUrl,
      apiKey,
      colors,
      developMode,
      devApiUrl,
      effectiveEnabledWalletOptions,
      enabledChains,
      enabledWalletOptions,
      disallowedWallets,
      form,
      hasSwapToAuth,
      inputAsset,
      isHydrated,
      localMode,
      missingConfigSummaries,
      outputAsset,
      quoteParams,
      requestParamsEnabled,
      swapParams,
      useApiKeyAuth,
      useV3SwapFlow,
      widgetId,
      widgetKey,
    ],
  );
};
