"use client";

import { SwapKitWidget } from "@swapkit/ui/react";
import { SwapKitWidgetControls, useSwapKitWidgetControlsForm } from "@swapkit/ui/react/controls";
import { useEffect, useState } from "react";

const SETTINGS_ICON = (
  <svg
    aria-hidden
    fill="none"
    focusable="false"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24">
    <line x1="4" x2="14" y1="6" y2="6" />
    <line x1="20" x2="18" y1="6" y2="6" />
    <line x1="4" x2="6" y1="12" y2="12" />
    <line x1="12" x2="20" y1="12" y2="12" />
    <line x1="4" x2="14" y1="18" y2="18" />
    <line x1="20" x2="18" y1="18" y2="18" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="16" cy="18" r="2" />
  </svg>
);

const CLOSE_ICON = (
  <svg
    aria-hidden
    fill="none"
    focusable="false"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24">
    <line x1="18" x2="6" y1="6" y2="18" />
    <line x1="6" x2="18" y1="6" y2="18" />
  </svg>
);

export default function App() {
  const {
    apiBaseUrl,
    apiKey,
    colors,
    effectiveEnabledWalletOptions,
    inputAsset,
    isHydrated,
    outputAsset,
    useApiKeyAuth,
    widgetId,
    widgetKey,
  } = useSwapKitWidgetControlsForm();
  const [isControlsOpen, setControlsOpen] = useState(false);

  // Snap back to desktop layout when the viewport widens past the mobile breakpoint
  // so the sheet state never lingers somewhere the user can't dismiss it.
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 769px)");
    const handle = () => {
      if (mql.matches) setControlsOpen(false);
    };
    mql.addEventListener("change", handle);
    return () => mql.removeEventListener("change", handle);
  }, []);

  return (
    <div className="studio-layout">
      <main className="studio-layout__widget">
        {isHydrated && (
          <SwapKitWidget
            apiBaseUrl={apiBaseUrl}
            apiKey={useApiKeyAuth ? apiKey || "" : ""}
            colors={colors}
            inputAsset={inputAsset || undefined}
            outputAsset={outputAsset || undefined}
            syncUrl
            wallets={effectiveEnabledWalletOptions}
            widgetId={useApiKeyAuth ? "" : widgetId || ""}
            widgetKey={useApiKeyAuth ? "" : widgetKey || ""}
          />
        )}
      </main>

      {isControlsOpen && (
        <button
          aria-label="Close controls"
          className="studio-layout__backdrop"
          onClick={() => setControlsOpen(false)}
          type="button"
        />
      )}

      <aside
        aria-label="Widget Studio settings"
        className={isControlsOpen ? "studio-layout__sidebar studio-layout__sidebar--open" : "studio-layout__sidebar"}>
        <SwapKitWidgetControls />
      </aside>

      {/* Mobile-only floating toggle. Hoisted out of the widget area so it stays
          tappable on top of the open sidebar (z-index: 60 > sidebar's 50). */}
      <button
        aria-label={isControlsOpen ? "Close Widget Studio settings" : "Open Widget Studio settings"}
        className="studio-layout__settings-trigger"
        onClick={() => setControlsOpen((open) => !open)}
        type="button">
        <span className="studio-layout__icon">{isControlsOpen ? CLOSE_ICON : SETTINGS_ICON}</span>
        <span className="studio-layout__settings-trigger-label">{isControlsOpen ? "Close" : "Configure"}</span>
      </button>
    </div>
  );
}
