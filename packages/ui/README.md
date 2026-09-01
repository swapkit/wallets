# @swapkit/ui

React components, web component assets, and Widget Studio controls for embedding the SwapKit Widget.

The SwapKit Widget gives partners a ready-made swap experience backed by SwapKit's cross-chain API and wallet integrations. Use Widget Studio to configure and copy an embed snippet, or install this package when you want to render the widget directly in a React application.

## Documentation

- [Introduction](https://docs.swapkit.dev/swapkit-widget/introduction)
- [Creating your widget keys](https://docs.swapkit.dev/swapkit-widget/creating-your-widget-keys)
- [Widget Studio](https://docs.swapkit.dev/swapkit-widget/widget-studio)
- [Integrating SwapKit's Widget](https://docs.swapkit.dev/swapkit-widget/integrating-swapkits-widget)
- [Configuring in code](https://docs.swapkit.dev/swapkit-widget/configuring-in-code)

## Installation

```sh
bun add @swapkit/ui
```

or with npm:

```sh
npm install @swapkit/ui
```

## Recommended integration

Most partners should configure the widget in Widget Studio and copy the generated snippet. Studio handles theme tokens, default assets, wallet and chain filters, provider credentials, and the correct CDN URL.

If you are embedding without React, use the hosted web component:

```html
<script type="module" src="https://cdn.swapkit.dev/widget/latest/swapkit-widget.js"></script>

<swapkit-widget
  widget-id="YOUR_WIDGET_ID"
  widget-key="YOUR_WIDGET_KEY"
></swapkit-widget>
```

Create and manage widget keys in the SwapKit dashboard. Widget auth uses `widget-id` and `widget-key` together and is the recommended browser embed mode.

## React usage

Import the stylesheet once at your app root, then render `SwapKitWidget`.

```tsx
import { SwapKitWidget } from "@swapkit/ui/react";
import "@swapkit/ui/swapkit.css";

export function App() {
  return (
    <SwapKitWidget
      widgetId="YOUR_WIDGET_ID"
      widgetKey="YOUR_WIDGET_KEY"
    />
  );
}
```

### Theme tokens

Use the `theme` prop to customize the widget. Color values are HSL channels without the `hsl()` wrapper.

```tsx
<SwapKitWidget
  widgetId="YOUR_WIDGET_ID"
  widgetKey="YOUR_WIDGET_KEY"
  theme={{
    background: "220 18% 8%",
    surface: "220 14% 13%",
    accent: "155 86% 62%",
    primaryButton: "155 86% 62%",
    primaryButtonForeground: "220 18% 8%",
    radius: "0.5rem",
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  }}
/>
```

`colors` is still accepted as a deprecated alias for `theme` to avoid breaking existing embeds.

## Common props

| Prop | Type | Notes |
| --- | --- | --- |
| `widgetId` | `string` | Widget ID from the dashboard. Use with `widgetKey`. |
| `widgetKey` | `string` | Widget key from the dashboard. Use with `widgetId`. |
| `apiKey` | `string` | Alternative auth mode. Avoid exposing API keys in public browser embeds. |
| `apiBaseUrl` | `string` | Override the SwapKit API URL. Usually omitted in production. |
| `inputAsset` | `string` | Initial pay asset, for example `BTC.BTC`. |
| `outputAsset` | `string` | Initial receive asset, for example `ETH.USDT-0x...`. |
| `wallets` | `WalletConfig` | Restrict wallet options with an explicit list, `all`, `none`, include, or exclude. |
| `chains` | `ChainConfig` | Restrict supported chains with an explicit list, `all`, include, or exclude. |
| `theme` | `SwapKitThemeTokens` | Theme tokens for colors, radius, and font family. |
| `config` | `object` | SDK wallet/provider credentials such as WalletConnect, Xaman, Radix, Trezor, Coinbase, and Passkeys. |
| `developMode` | `boolean` | Enables development behavior. Omit in production. |
| `devApiUrl` | `string` | API URL used with `developMode`. |
| `disableTelemetry` | `boolean` | Disables widget telemetry in React embeds. |
| `syncUrl` | `boolean` | Sync selected assets and amount to URL query params. |

## Web component attributes

The web component accepts kebab-case equivalents for browser embeds:

```html
<swapkit-widget
  widget-id="YOUR_WIDGET_ID"
  widget-key="YOUR_WIDGET_KEY"
  input-asset="BTC.BTC"
  output-asset="ETH.USDT-0xdAC17F958D2EE523A2206206994597C13D831EC7"
  wallets="METAMASK,WALLETCONNECT"
  chains="BTC,ETH,ARB,BASE"
  color-primary="220 18% 8%"
  color-secondary="220 14% 13%"
  color-accent="155 86% 62%"
  border-radius="0.5rem"
  font-family="ui-sans-serif, system-ui, sans-serif"
></swapkit-widget>
```

Theme and config attributes are observed, so updating attributes at runtime re-renders the widget.

## Wallet provider configuration

Some wallets require provider credentials before they can connect. Prefer configuring these in Widget Studio so the generated snippet includes the correct `config` payload.

Example web component config:

```html
<swapkit-widget
  widget-id="YOUR_WIDGET_ID"
  widget-key="YOUR_WIDGET_KEY"
  config='{"apiKeys":{"walletConnectProjectId":"...","xaman":"..."}}'
></swapkit-widget>
```

Example React config:

```tsx
<SwapKitWidget
  widgetId="YOUR_WIDGET_ID"
  widgetKey="YOUR_WIDGET_KEY"
  config={{
    apiKeys: {
      walletConnectProjectId: "...",
      xaman: "...",
    },
  }}
/>
```

## Widget Studio controls

This package also exports the Studio controls used by the playground and hosted Studio.

```tsx
import { SwapKitWidgetControls, useSwapKitWidgetControlsForm } from "@swapkit/ui/react/controls";
```

Use these only when building or extending Studio-like tooling. Normal partner embeds should use the generated snippet or `SwapKitWidget`.

## Local development

From the repository root:

```sh
bun install
bun run playground:vite-lite dev
```

Package commands:

```sh
bun --cwd packages/ui run type-check
bun --cwd packages/ui run build
```

The Vite playground aliases React source for hot reload, but serves the package stylesheet and standalone widget assets from `packages/ui/dist`. Rebuild `packages/ui` after changes that affect generated CSS or the standalone web component.

## Exports

- `@swapkit/ui/react` - React widget, composable components, hooks, and types.
- `@swapkit/ui/react/controls` - Widget Studio controls.
- `@swapkit/ui/swapkit.css` - Widget stylesheet for React consumers.
- CDN web component - `https://cdn.swapkit.dev/widget/latest/swapkit-widget.js`.
