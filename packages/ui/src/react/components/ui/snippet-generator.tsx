"use client";

import type { Chain, WalletOption } from "@swapkit/helpers";
import hljs from "highlight.js/lib/core";
// In highlight.js, `html` is an alias of the `xml` grammar — there is no separate HTML
// grammar. We register under `xml` and call `highlight()` with `html` to match intent.
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { Check, Copy } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { Control, FieldValues, Path } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { buildSdkConfigPatch } from "../../controls/build-sdk-config-patch";
import type { ControlsStoreFieldValues } from "../../types";
import { Button } from "./button";

if (!hljs.getLanguage("xml")) hljs.registerLanguage("xml", xml);
if (!hljs.getLanguage("typescript")) hljs.registerLanguage("typescript", typescript);

type SnippetGeneratorProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  /**
   * The wallet list the embed should actually carry — the form's raw
   * `enabledWalletOptions` minus any wallets whose required configuration
   * isn't set. Both the studio's preview widget and the snippets use this so
   * that "copy and paste" never ships a wallet that would error on connect.
   */
  effectiveEnabledWalletOptions: WalletOption[] | "all";
};

const DEFAULT_THEME_VALUES: Record<string, string> = {
  borderRadius: "0.5rem",
  colorAccent: "140 87% 79%",
  colorBgActive: "0 0% 100% / 0.12",
  colorBgHover: "0 0% 100% / 0.08",
  colorBgOverlay: "0 0% 0% / 0.8",
  colorBorder: "0 0% 100% / 0.12",
  colorMutedText: "0 0% 100% / 0.64",
  colorPrimary: "140 6% 8%",
  colorPrimaryButton: "0 0% 100% / 0.92",
  colorPrimaryButtonText: "140 6% 8%",
  colorSecondary: "120 3% 13%",
  colorText: "0 0% 100% / 0.92",
  fontFamily:
    'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
};

const THEME_ATTRIBUTE_MAP: Record<string, string> = {
  borderRadius: "border-radius",
  colorAccent: "color-accent",
  colorBgActive: "color-bg-active",
  colorBgHover: "color-bg-hover",
  colorBgOverlay: "color-bg-overlay",
  colorBorder: "color-border",
  colorMutedText: "color-muted-foreground",
  colorPrimary: "color-primary",
  colorPrimaryButton: "color-primary-button",
  colorPrimaryButtonText: "color-primary-button-foreground",
  colorSecondary: "color-secondary",
  colorText: "color-text",
  fontFamily: "font-family",
};

// Form-field key → SwapKitThemeTokens property name. The React widget's `theme`
// prop is typed against SwapKitThemeTokens (background, surface, hover, …), NOT the
// flat color-* HTML attribute names — same translation the WC's parseThemeTokens
// does at swapkit-widget-web-component.tsx:150-169.
const REACT_THEME_TOKEN_KEY_MAP: Record<string, string> = {
  borderRadius: "radius",
  colorAccent: "accent",
  colorBgActive: "active",
  colorBgHover: "hover",
  colorBgOverlay: "overlay",
  colorBorder: "border",
  colorMutedText: "mutedForeground",
  colorPrimary: "background",
  colorPrimaryButton: "primaryButton",
  colorPrimaryButtonText: "primaryButtonForeground",
  colorSecondary: "surface",
  colorText: "text",
  fontFamily: "fontFamily",
};

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function addHtmlAttribute(attributes: string[], name: string, value: string) {
  attributes.push(`  ${name}="${escapeHtmlAttribute(value)}"`);
}

function addJsxStringProp(props: string[], name: string, value: string) {
  props.push(`  ${name}={${JSON.stringify(value)}}`);
}

function addThemeAttribute(attributes: string[], key: string, value: string | undefined) {
  const attributeName = THEME_ATTRIBUTE_MAP[key];
  const defaultValue = DEFAULT_THEME_VALUES[key];

  if (value && attributeName && value !== defaultValue) {
    addHtmlAttribute(attributes, attributeName, value);
  }
}

function buildSnippet(config: {
  widgetId: string;
  widgetKey: string;
  apiKey: string;
  useApiKeyAuth: boolean;
  apiBaseUrl: string;
  developMode: boolean;
  devApiUrl: string;
  enabledWalletOptions: WalletOption[] | "all";
  enabledChains: Chain[] | "all";
  inputAsset: string;
  outputAsset: string;
  themeTokens: Record<string, string | undefined>;
  apiKeys: ControlsStoreFieldValues["apiKeys"];
  integrations: ControlsStoreFieldValues["integrations"];
}): string {
  const attributes: string[] = [];

  // Authentication — either api-key or widget-id + widget-key (HMAC mode requires both).
  if (config.useApiKeyAuth && config.apiKey) {
    addHtmlAttribute(attributes, "api-key", config.apiKey);
  } else if (config.widgetId && config.widgetKey) {
    addHtmlAttribute(attributes, "widget-id", config.widgetId);
    addHtmlAttribute(attributes, "widget-key", config.widgetKey);
  }

  if (config.apiBaseUrl && config.apiBaseUrl !== "https://api.swapkit.dev") {
    addHtmlAttribute(attributes, "api-base-url", config.apiBaseUrl);
  }

  // Developer mode settings
  if (config.developMode) {
    attributes.push("  develop-mode");
    if (config.devApiUrl) {
      addHtmlAttribute(attributes, "dev-api-url", config.devApiUrl);
    }
  }

  // Wallet configuration (only if not "all")
  const wallets = config.enabledWalletOptions;
  if (wallets !== "all" && Array.isArray(wallets)) {
    if (wallets.length === 0) {
      attributes.push('  wallets="none"');
    } else {
      addHtmlAttribute(attributes, "wallets", wallets.join(","));
    }
  }

  // Empty `chains=""` is meaningful — the runtime resolver reads it as "none"
  // rather than falling through to the default "all".
  const chains = config.enabledChains;
  if (chains !== "all" && Array.isArray(chains)) {
    addHtmlAttribute(attributes, "chains", chains.join(","));
  }

  // Default input/output assets. Empty = Smart defaults (widget runs
  // pickDefaultAssetPair at mount). Emit only when set so the embed stays
  // minimal in the common case.
  if (config.inputAsset) {
    addHtmlAttribute(attributes, "input-asset", config.inputAsset);
  }
  if (config.outputAsset) {
    addHtmlAttribute(attributes, "output-asset", config.outputAsset);
  }

  // Theme attributes (only non-default values)
  for (const key of Object.keys(THEME_ATTRIBUTE_MAP)) {
    addThemeAttribute(attributes, key, config.themeTokens[key]);
  }

  // Wallet/integration credentials don't fit cleanly as flat attributes — emit
  // them as a JSON `config` payload that the web component parses + applies via
  // SKConfig.set. Only included when at least one wallet field is non-empty.
  const sdkPatch = buildSdkConfigPatch({ apiKeys: config.apiKeys, integrations: config.integrations });
  if (Object.keys(sdkPatch).length > 0) {
    // HTML attribute values can't contain unescaped double quotes; use single
    // quotes for the attribute and escape any singles in the JSON.
    const json = JSON.stringify(sdkPatch).replace(/&/g, "&amp;").replace(/'/g, "&apos;").replace(/</g, "&lt;");
    attributes.push(`  config='${json}'`);
  }

  // Build the snippet - use dev CDN when in develop mode
  const cdnDomain = config.developMode ? "cdn-dev.swapkit.dev" : "cdn.swapkit.dev";
  const cdnScript = `<script type="module" src="https://${cdnDomain}/widget/latest/swapkit-widget.js"></script>`;
  const widgetTag =
    attributes.length > 0
      ? `<swapkit-widget\n${attributes.join("\n")}\n></swapkit-widget>`
      : "<swapkit-widget></swapkit-widget>";

  return `<!-- SwapKit Widget -->\n${cdnScript}\n\n${widgetTag}`;
}

// React variant — mirrors buildSnippet but emits JSX. The React widget now
// supports every WC attribute as a typed prop (developMode, devApiUrl, config),
// so no SKConfig.set() shim at module scope is needed.
function buildReactSnippet(config: {
  widgetId: string;
  widgetKey: string;
  apiKey: string;
  useApiKeyAuth: boolean;
  apiBaseUrl: string;
  developMode: boolean;
  devApiUrl: string;
  enabledWalletOptions: WalletOption[] | "all";
  enabledChains: Chain[] | "all";
  inputAsset: string;
  outputAsset: string;
  themeTokens: Record<string, string | undefined>;
  apiKeys: ControlsStoreFieldValues["apiKeys"];
  integrations: ControlsStoreFieldValues["integrations"];
}): string {
  const props: string[] = [];

  if (config.useApiKeyAuth && config.apiKey) {
    addJsxStringProp(props, "apiKey", config.apiKey);
  } else if (config.widgetId && config.widgetKey) {
    addJsxStringProp(props, "widgetId", config.widgetId);
    addJsxStringProp(props, "widgetKey", config.widgetKey);
  }

  if (config.apiBaseUrl && config.apiBaseUrl !== "https://api.swapkit.dev") {
    addJsxStringProp(props, "apiBaseUrl", config.apiBaseUrl);
  }

  if (config.developMode) {
    props.push("  developMode");
    if (config.devApiUrl) {
      addJsxStringProp(props, "devApiUrl", config.devApiUrl);
    }
  }

  // Wallets — empty array maps to the special "none" sentinel (same as the WC
  // emits `wallets="none"`); a non-empty list becomes a JSX array literal.
  const wallets = config.enabledWalletOptions;
  if (wallets !== "all" && Array.isArray(wallets)) {
    if (wallets.length === 0) {
      props.push('  wallets="none"');
    } else {
      props.push(`  wallets={[${wallets.map((w) => `"${w}"`).join(", ")}]}`);
    }
  }

  const chains = config.enabledChains;
  if (chains !== "all" && Array.isArray(chains)) {
    props.push(`  chains={[${chains.map((c) => `"${c}"`).join(", ")}]}`);
  }

  // Default input / output assets. Empty = Smart defaults (widget runs
  // pickDefaultAssetPair at mount). Emit only when set.
  if (config.inputAsset) {
    addJsxStringProp(props, "inputAsset", config.inputAsset);
  }
  if (config.outputAsset) {
    addJsxStringProp(props, "outputAsset", config.outputAsset);
  }

  // Theme tokens — translate flat form-field keys (colorPrimary, colorBgHover, …)
  // into the SwapKitThemeTokens property names the React `theme` prop expects
  // (background, hover, …). Skip default values so the emitted object stays
  // minimal.
  const themeTokenEntries: string[] = [];
  for (const key of Object.keys(REACT_THEME_TOKEN_KEY_MAP)) {
    const value = config.themeTokens[key];
    if (value && value !== DEFAULT_THEME_VALUES[key]) {
      themeTokenEntries.push(`    ${REACT_THEME_TOKEN_KEY_MAP[key]}: ${JSON.stringify(value)}`);
    }
  }
  if (themeTokenEntries.length > 0) {
    props.push(`  theme={{\n${themeTokenEntries.join(",\n")},\n  }}`);
  }

  // Wallet/integration credentials — emitted as a typed `config` prop on the
  // widget. The widget merges this into the global SKConfig store before any
  // wallet connect, matching the WC's behavior.
  const sdkPatch = buildSdkConfigPatch({ apiKeys: config.apiKeys, integrations: config.integrations });
  if (Object.keys(sdkPatch).length > 0) {
    props.push(`  config={${JSON.stringify(sdkPatch)}}`);
  }

  const opening = props.length > 0 ? `<SwapKitWidget\n${props.join("\n")}\n/>` : "<SwapKitWidget />";

  return `import { SwapKitWidget } from "@swapkit/ui/react";\n\nexport function App() {\n  return (\n    ${opening
    .split("\n")
    .map((line, i) => (i === 0 ? line : `    ${line}`))
    .join("\n")}\n  );\n}`;
}

export function SnippetGenerator<TFieldValues extends FieldValues>({
  control,
  effectiveEnabledWalletOptions,
}: SnippetGeneratorProps<TFieldValues>) {
  const [copied, setCopied] = useState<"html" | "react" | null>(null);

  const values = useWatch({
    control,
    name: [
      "widgetId",
      "widgetKey",
      "apiKey",
      "useApiKeyAuth",
      "apiBaseUrl",
      "developMode",
      "devApiUrl",
      "enabledWalletOptions",
      "enabledChains",
      "inputAsset",
      "outputAsset",
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
    ] as Path<TFieldValues>[],
  });

  const [
    widgetId,
    widgetKey,
    apiKey,
    useApiKeyAuth,
    apiBaseUrl,
    developMode,
    devApiUrl,
    enabledWalletOptions,
    enabledChains,
    inputAsset,
    outputAsset,
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
  ] = values as unknown as [
    string,
    string,
    string,
    boolean,
    string,
    boolean,
    string,
    WalletOption[] | "all",
    Chain[] | "all",
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    ControlsStoreFieldValues["apiKeys"],
    ControlsStoreFieldValues["integrations"],
  ];

  const sharedConfig = useMemo(
    () => ({
      apiBaseUrl,
      apiKey,
      apiKeys,
      devApiUrl,
      developMode,
      enabledChains,
      // Use the effective list (form's enabledWalletOptions minus wallets
      // with missing required config) so the copied snippet never carries a
      // wallet that would throw at connect. Falls back to the form value
      // only if the caller didn't supply one.
      enabledWalletOptions: effectiveEnabledWalletOptions ?? enabledWalletOptions,
      inputAsset,
      integrations,
      outputAsset,
      themeTokens: {
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
        fontFamily,
      },
      useApiKeyAuth,
      widgetId,
      widgetKey,
    }),
    [
      widgetId,
      widgetKey,
      apiKey,
      useApiKeyAuth,
      apiBaseUrl,
      developMode,
      devApiUrl,
      enabledWalletOptions,
      effectiveEnabledWalletOptions,
      enabledChains,
      inputAsset,
      outputAsset,
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
    ],
  );

  const htmlSnippet = useMemo(() => buildSnippet(sharedConfig), [sharedConfig]);
  const reactSnippet = useMemo(() => buildReactSnippet(sharedConfig), [sharedConfig]);

  return (
    <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-5">
      <SnippetBlock
        copied={copied === "html"}
        helpText="Your configured web component — paste this into your site's HTML."
        label="Web Component"
        language="html"
        onCopied={() => {
          setCopied("html");
          setTimeout(() => setCopied(null), 2000);
        }}
        snippet={htmlSnippet}
      />
      <SnippetBlock
        copied={copied === "react"}
        helpText="Your configured React component — drop this into any project that has @swapkit/ui installed."
        label="React"
        language="typescript"
        onCopied={() => {
          setCopied("react");
          setTimeout(() => setCopied(null), 2000);
        }}
        snippet={reactSnippet}
      />
    </div>
  );
}

function SnippetBlock({
  copied,
  helpText,
  label,
  language,
  onCopied,
  snippet,
}: {
  copied: boolean;
  helpText: string;
  label: string;
  language: "html" | "typescript";
  onCopied: () => void;
  snippet: string;
}) {
  const highlighted = useMemo(() => hljs.highlight(snippet, { language }).value, [snippet, language]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      onCopied();
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = snippet;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      onCopied();
    }
  }, [snippet, onCopied]);

  return (
    <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2">
      <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between">
        <span className="sk-ui-text-foreground sk-ui-text-xs sk-ui-font-semibold sk-ui-uppercase sk-ui-tracking-wider">
          {label}
        </span>
      </div>
      <div className="sk-ui-relative">
        <pre className="swapkit-snippet sk-ui-bg-black/30 sk-ui-rounded-lg sk-ui-p-3 sk-ui-pr-12 sk-ui-text-xs sk-ui-text-foreground sk-ui-font-mono sk-ui-leading-relaxed sk-ui-overflow-x-auto sk-ui-whitespace-pre-wrap sk-ui-break-all">
          <code
            className="hljs sk-ui-bg-transparent sk-ui-p-0"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: hljs.highlight escapes its input before adding spans
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
        <Button
          className="sk-ui-absolute sk-ui-top-2 sk-ui-right-2 sk-ui-h-8 sk-ui-w-8 sk-ui-p-0"
          onClick={handleCopy}
          size="sm"
          title={copied ? "Copied!" : "Copy to clipboard"}
          variant="ghost">
          {copied ? (
            <Check className="sk-ui-h-4 sk-ui-w-4 sk-ui-text-green-500" />
          ) : (
            <Copy className="sk-ui-h-4 sk-ui-w-4" />
          )}
        </Button>
      </div>
      <p className="sk-ui-text-xs sk-ui-text-muted-foreground">{helpText}</p>
    </div>
  );
}
