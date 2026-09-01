import { type Chain, SKConfig, type WalletOption } from "@swapkit/helpers";
import { Buffer } from "buffer";
import { NuqsAdapter } from "nuqs/adapters/react";
import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import type { SwapKitThemeTokens } from "./components/config";
import { WidgetErrorBoundary } from "./components/sentry-error-boundary";
import { initSentry } from "./sentry";
import type { ChainConfig, WalletConfig } from "./types";

const SwapKitWidgetComponent = lazy(() => import("./swapkit-widget").then((m) => ({ default: m.SwapKitWidget })));

declare const __SWAPKIT_CSS__: string;

function SwapKitLogo({ color = "hsl(0 0% 100% / 0.8)" }: { color?: string }) {
  return (
    <svg aria-label="SwapKit" fill={color} role="img" style={{ height: 48, width: 48 }} viewBox="0 0 74.33 86.52">
      <title>SwapKit</title>
      <path d="M24.68,0C11.07,0,0,11.07,0,24.68h12.39c0-6.78,5.51-12.29,12.29-12.29h49.65V0H24.68Z" />
      <path d="M12.39,37.07h49.56v12.39H12.39v-12.39H0v24.78h61.94c0,6.78-5.51,12.29-12.29,12.29H0v12.39h49.65c13.61,0,24.68-11.07,24.68-24.68h-12.39v-12.39h12.39v-24.78H12.39v12.39Z" />
    </svg>
  );
}

function WidgetSkeleton() {
  return (
    <div
      style={{
        alignItems: "center",
        backgroundColor: "hsl(var(--sk-bg, 140 6% 8%))",
        borderRadius: "12px",
        display: "flex",
        justifyContent: "center",
        padding: "48px",
      }}>
      <div style={{ animation: "swapkit-pulse 2s ease-in-out infinite" }}>
        <SwapKitLogo />
      </div>
      <style>{"@keyframes swapkit-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }"}</style>
    </div>
  );
}

class SwapKitWidgetElement extends HTMLElement {
  private root: ReactDOM.Root | null = null;

  static observedAttributes = [
    "widget-id",
    "widget-key",
    "api-key",
    "api-base-url",
    "develop-mode",
    "dev-api-url",
    "input-asset",
    "output-asset",
    "color-primary",
    "color-secondary",
    "color-bg-hover",
    "color-bg-active",
    "color-bg-overlay",
    "color-text",
    "color-muted-foreground",
    "color-accent",
    "color-accent-foreground",
    "color-primary-button",
    "color-primary-button-foreground",
    "color-border",
    "border-radius",
    "font-family",
    "wallets",
    "wallets-include",
    "wallets-exclude",
    "chains",
    "chains-include",
    "chains-exclude",
    "sentry-dsn",
    "config",
  ];

  connectedCallback() {
    if (this.getAttribute("data-mounted") === "true") return;

    (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
    this.setAttribute("data-mounted", "true");

    if (!document.getElementById("swapkit-widget-styles")) {
      const styleTag = document.createElement("style");
      styleTag.id = "swapkit-widget-styles";
      styleTag.textContent = __SWAPKIT_CSS__;
      document.head.appendChild(styleTag);
    }

    const container = document.createElement("div");
    container.id = "swapkit-widget-root";
    container.style.width = "100%";
    container.style.height = "100%";
    this.appendChild(container);

    this.root = ReactDOM.createRoot(container);
    this.renderWidget();
  }

  disconnectedCallback() {
    this.root?.unmount();
    this.root = null;
  }

  attributeChangedCallback(_name: string, oldValue: string, newValue: string) {
    if (oldValue !== newValue && this.root) {
      this.renderWidget();
    }
  }

  private getConfig() {
    const developMode = this.getAttribute("develop-mode");
    const themeTokens = this.parseThemeTokens();
    const hasThemeTokens = Object.keys(themeTokens).length > 0;

    return {
      apiBaseUrl: this.getAttribute("api-base-url"),
      apiKey: this.getAttribute("api-key"),
      chains: this.parseChains(),
      colors: hasThemeTokens ? themeTokens : undefined,
      devApiUrl: this.getAttribute("dev-api-url"),
      developMode: developMode === "true" || developMode === "",
      inputAsset: this.getAttribute("input-asset"),
      outputAsset: this.getAttribute("output-asset"),
      sentryDsn: this.getAttribute("sentry-dsn"),
      walletConfig: this.parseWalletConfig(),
      wallets: this.parseWallets(),
      widgetId: this.getAttribute("widget-id"),
      widgetKey: this.getAttribute("widget-key"),
    };
  }

  private parseChains(): ChainConfig | undefined {
    const split = (raw: string) =>
      raw
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean) as Chain[];
    const chainsAttr = this.getAttribute("chains");
    if (chainsAttr) {
      if (chainsAttr === "all") return "all";
      return split(chainsAttr);
    }
    const include = this.getAttribute("chains-include");
    if (include) return { include: split(include) };
    const exclude = this.getAttribute("chains-exclude");
    if (exclude) return { exclude: split(exclude) };
    return undefined;
  }

  private parseThemeTokens(): SwapKitThemeTokens {
    const themeTokens: SwapKitThemeTokens = {};
    const set = (key: keyof SwapKitThemeTokens, attr: string) => {
      const value = this.getAttribute(attr);
      if (value) themeTokens[key] = value;
    };
    set("background", "color-primary");
    set("surface", "color-secondary");
    set("hover", "color-bg-hover");
    set("active", "color-bg-active");
    set("overlay", "color-bg-overlay");
    set("text", "color-text");
    set("mutedForeground", "color-muted-foreground");
    set("accent", "color-accent");
    set("accentForeground", "color-accent-foreground");
    set("primaryButton", "color-primary-button");
    set("primaryButtonForeground", "color-primary-button-foreground");
    set("border", "color-border");
    set("radius", "border-radius");
    set("fontFamily", "font-family");
    return themeTokens;
  }

  private parseWallets(): WalletConfig | undefined {
    const walletsAttr = this.getAttribute("wallets");
    if (walletsAttr) {
      if (walletsAttr === "all") return "all";
      if (walletsAttr === "none") return "none";
      return walletsAttr.split(",").map((w) => w.trim().toUpperCase()) as WalletOption[];
    }
    const walletsInclude = this.getAttribute("wallets-include");
    if (walletsInclude) {
      return { include: walletsInclude.split(",").map((w) => w.trim().toUpperCase()) as WalletOption[] };
    }
    const walletsExclude = this.getAttribute("wallets-exclude");
    if (walletsExclude) {
      return { exclude: walletsExclude.split(",").map((w) => w.trim().toUpperCase()) as WalletOption[] };
    }
    return undefined;
  }

  // `config` is a JSON-encoded SKConfig patch — covers wallet/integration
  // credentials (apiKeys + integrations) that don't fit cleanly as flat
  // attributes. Snippet generator emits this when any wallet config is set.
  private parseWalletConfig():
    | { apiKeys?: Record<string, unknown>; integrations?: Record<string, unknown> }
    | undefined {
    const rawConfig = this.getAttribute("config");
    if (!rawConfig) return undefined;
    try {
      const parsed = JSON.parse(rawConfig);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (error) {
      console.warn("[SwapKit] Failed to parse `config` attribute as JSON:", error);
    }
    return undefined;
  }

  private renderWidget() {
    if (!this.root) return;

    const config = this.getConfig();

    if (config.sentryDsn) {
      initSentry({ dsn: config.sentryDsn });
    }

    // Apply wallet/integration credentials from the JSON `config` attribute
    // first so any subsequent wallet connect (and the snippet generator's
    // round-trip) sees the values. SKConfig.set is a partial merge, so this
    // doesn't disturb the auth keys handled below.
    if (config.walletConfig) {
      try {
        SKConfig.set(config.walletConfig as Parameters<typeof SKConfig.set>[0]);
      } catch (error) {
        console.warn("[SwapKit] Failed to apply `config` attribute payload:", error);
      }
    }

    // Handle API key authentication (alternative to widget auth).
    if (config.apiKey) {
      SKConfig.set({ apiKeys: { swapKit: config.apiKey } });
      SKConfig.setWidgetId("");
      SKConfig.setWidgetKey("");
    } else {
      SKConfig.set({ apiKeys: { swapKit: "" } });
    }

    const effectiveWidgetId = config.widgetId || SKConfig.get("widgetId");
    const effectiveWidgetKey = config.widgetKey || SKConfig.get("widgetKey");
    const hasWidgetAuth = effectiveWidgetId && effectiveWidgetKey;
    const hasApiKey = config.apiKey || SKConfig.get("apiKeys")?.swapKit;
    const hasPartialWidgetAuth = !hasWidgetAuth && Boolean(effectiveWidgetId) !== Boolean(effectiveWidgetKey);
    if (hasPartialWidgetAuth && !hasApiKey) {
      console.warn(
        '[SwapKit] Partial widget auth: "widget-id" and "widget-key" must be set together. Requests will fail authentication.',
      );
    } else if (!hasWidgetAuth && !hasApiKey) {
      console.warn(
        "[SwapKit] No widget auth or api-key configured. API requests will fail authentication. " +
          'Set both "widget-id" + "widget-key" attributes (or "api-key") on the <swapkit-widget> element.',
      );
    }

    // Handle developer mode settings
    SKConfig.setEnv("isDev", config.developMode);
    if (config.devApiUrl) {
      SKConfig.setEnv("devApiUrl", config.devApiUrl);
    }

    // Always use V3 swap flow
    SKConfig.set({ v3SwapFlow: { enabled: true } });

    this.root.render(
      <React.StrictMode>
        <NuqsAdapter>
          <Suspense fallback={<WidgetSkeleton />}>
            <WidgetErrorBoundary>
              <SwapKitWidgetComponent
                apiBaseUrl={config.apiBaseUrl}
                apiKey={config.apiKey ?? ""}
                chains={config.chains}
                colors={config.colors}
                inputAsset={config.inputAsset}
                outputAsset={config.outputAsset}
                wallets={config.wallets}
                widgetId={config.widgetId ?? ""}
                widgetKey={config.widgetKey ?? ""}
              />
            </WidgetErrorBoundary>
          </Suspense>
        </NuqsAdapter>
      </React.StrictMode>,
    );
  }
}

if (typeof window !== "undefined" && !customElements.get("swapkit-widget")) {
  customElements.define("swapkit-widget", SwapKitWidgetElement);
}

export { SwapKitWidgetElement };
