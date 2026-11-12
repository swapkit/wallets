import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import "../../__tests__/setup-dom";

import React from "react";
import { createRoot } from "react-dom/client";
import { useDevRequestParams } from "../use-dev-request-params";

// setup-dom copies a fixed set of window globals; localStorage isn't among
// them, and the hook (like swapkit-config-context) reads the bare global.
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: window.localStorage });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

type DevRequestParams = ReturnType<typeof useDevRequestParams>;

function renderProbe() {
  const result: { current: DevRequestParams } = { current: { quoteParams: null, swapParams: null } };

  function Probe() {
    result.current = useDevRequestParams();
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(React.createElement(Probe));

  const cleanup = () => {
    root.unmount();
    container.remove();
  };

  return { cleanup, result };
}

function setStoredRequestParams({
  quoteParams = "{}",
  requestParamsEnabled = true,
  swapParams = "{}",
}: {
  quoteParams?: unknown;
  requestParamsEnabled?: boolean;
  swapParams?: unknown;
}) {
  localStorage.setItem("formValues", JSON.stringify({ quoteParams, requestParamsEnabled, swapParams }));
}

const originalNodeEnv = process.env.NODE_ENV;

describe("useDevRequestParams", () => {
  beforeEach(() => {
    localStorage.removeItem("formValues");
    // bun test runs with NODE_ENV=test — non-production, so params apply
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test("returns null params in production NODE_ENV even when toggle is on and params are stored", async () => {
    process.env.NODE_ENV = "production";
    setStoredRequestParams({ quoteParams: '{ "slippage": 3 }', swapParams: '{ "referrer": "test" }' });

    const { cleanup, result } = renderProbe();
    await flush();

    expect(result.current).toEqual({ quoteParams: null, swapParams: null });
    cleanup();
  });

  test("returns params in production NODE_ENV on an allowlisted dev studio host", async () => {
    process.env.NODE_ENV = "production";
    // setup-dom boots happy-dom at localhost; point it at the deployed dev
    // studio host, which opts into dev tooling despite the production build.
    const happyWindow = window as unknown as { happyDOM: { setURL(url: string): void } };
    happyWindow.happyDOM.setURL("https://widget-dev.swapkit.dev/studio");
    try {
      setStoredRequestParams({ quoteParams: '{ "slippage": 3 }' });

      const { cleanup, result } = renderProbe();
      await flush();

      expect(result.current).toEqual({ quoteParams: { slippage: 3 }, swapParams: null });
      cleanup();
    } finally {
      happyWindow.happyDOM.setURL("https://localhost:8080");
    }
  });

  test("returns null params when the toggle is off, even with valid params stored", async () => {
    setStoredRequestParams({
      quoteParams: '{ "slippage": 3 }',
      requestParamsEnabled: false,
      swapParams: '{ "referrer": "test" }',
    });

    const { cleanup, result } = renderProbe();
    await flush();

    expect(result.current).toEqual({ quoteParams: null, swapParams: null });
    cleanup();
  });

  test("returns parsed quote params when the toggle is on", async () => {
    setStoredRequestParams({ quoteParams: '{ "slippage": 3, "providers": ["THORCHAIN"] }' });

    const { cleanup, result } = renderProbe();
    await flush();

    expect(result.current).toEqual({ quoteParams: { providers: ["THORCHAIN"], slippage: 3 }, swapParams: null });
    cleanup();
  });

  test("returns null quote params for invalid, non-object, or empty JSON", async () => {
    const { cleanup, result } = renderProbe();

    for (const value of ['{ "broken', '["not", "an", "object"]', '"scalar"', "{}", ""]) {
      setStoredRequestParams({ quoteParams: value });
      window.dispatchEvent(new CustomEvent("swapkit-settings-changed"));
      await flush();

      expect(result.current).toEqual({ quoteParams: null, swapParams: null });
    }

    cleanup();
  });

  test("re-reads quote params when the settings-changed event fires", async () => {
    setStoredRequestParams({ quoteParams: '{ "slippage": 1 }' });

    const { cleanup, result } = renderProbe();
    await flush();
    expect(result.current).toEqual({ quoteParams: { slippage: 1 }, swapParams: null });

    setStoredRequestParams({ quoteParams: '{ "slippage": 5 }' });
    window.dispatchEvent(new CustomEvent("swapkit-settings-changed"));
    await flush();

    expect(result.current).toEqual({ quoteParams: { slippage: 5 }, swapParams: null });
    cleanup();
  });

  test("stops returning quote params when the toggle turns off", async () => {
    setStoredRequestParams({ quoteParams: '{ "slippage": 3 }' });

    const { cleanup, result } = renderProbe();
    await flush();
    expect(result.current).toEqual({ quoteParams: { slippage: 3 }, swapParams: null });

    setStoredRequestParams({ quoteParams: '{ "slippage": 3 }', requestParamsEnabled: false });
    window.dispatchEvent(new CustomEvent("swapkit-settings-changed"));
    await flush();

    expect(result.current).toEqual({ quoteParams: null, swapParams: null });
    cleanup();
  });

  test("returns parsed swap params when the toggle is on", async () => {
    setStoredRequestParams({ swapParams: '{ "referrer": "test", "affiliateBps": 20 }' });

    const { cleanup, result } = renderProbe();
    await flush();

    expect(result.current).toEqual({ quoteParams: null, swapParams: { affiliateBps: 20, referrer: "test" } });
    cleanup();
  });

  test("parses quote and swap params independently", async () => {
    setStoredRequestParams({ quoteParams: '{ "slippage": 3 }', swapParams: '{ "broken' });

    const { cleanup, result } = renderProbe();
    await flush();
    expect(result.current).toEqual({ quoteParams: { slippage: 3 }, swapParams: null });

    setStoredRequestParams({ quoteParams: '{ "broken', swapParams: '{ "referrer": "test" }' });
    window.dispatchEvent(new CustomEvent("swapkit-settings-changed"));
    await flush();

    expect(result.current).toEqual({ quoteParams: null, swapParams: { referrer: "test" } });
    cleanup();
  });
});
