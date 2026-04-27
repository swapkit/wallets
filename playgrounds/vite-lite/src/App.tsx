"use client";

import { SwapKitWidget } from "@swapkit/ui/react";

console.log("[playground] env", {
  apiBaseUrl: import.meta.env.VITE_SWAPKIT_API_BASE_URL,
  apiKey: import.meta.env.VITE_SWAPKIT_API_KEY
    ? `${String(import.meta.env.VITE_SWAPKIT_API_KEY).slice(0, 6)}…`
    : "MISSING",
  widgetKey: import.meta.env.VITE_SWAPKIT_WIDGET_KEY
    ? `${String(import.meta.env.VITE_SWAPKIT_WIDGET_KEY).slice(0, 6)}…`
    : "missing",
});

// The widget reads `formValues.enabledWalletOptions` from localStorage and lets
// it override the `wallets` prop. Strip it so every wallet shows in this bare
// playground — we never render the controls sidebar that would set it.
if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem("formValues");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && "enabledWalletOptions" in parsed) {
        delete parsed.enabledWalletOptions;
        localStorage.setItem("formValues", JSON.stringify(parsed));
        window.dispatchEvent(new Event("swapkit-settings-changed"));
      }
    }
  } catch {
    // ignore — localStorage unavailable or malformed
  }
}

export default function App() {
  return (
    <div style={{ margin: "4rem auto 0", maxWidth: "560px" }}>
      <SwapKitWidget
        apiBaseUrl={import.meta.env.VITE_SWAPKIT_API_BASE_URL}
        apiKey={import.meta.env.VITE_SWAPKIT_API_KEY || undefined}
        wallets="all"
        widgetKey={import.meta.env.VITE_SWAPKIT_WIDGET_KEY || undefined}
      />
    </div>
  );
}
