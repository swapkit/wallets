import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import "../../__tests__/setup-dom";

import { SKConfig } from "@swapkit/helpers";
import type React from "react";
import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useApplyWidgetSKConfig, type WidgetSKConfigInput } from "../use-widget-sk-config";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Seen = { apiUrl: string; apiKey: string; widgetId: string };

function readSeen(): Seen {
  return {
    apiKey: SKConfig.get("apiKeys").swapKit,
    apiUrl: SKConfig.get("envs").apiUrl,
    widgetId: SKConfig.get("widgetId"),
  };
}

let root: Root;
let container: HTMLElement;
let seenByChild: Seen | null;

function Child() {
  useEffect(() => {
    seenByChild ??= readSeen();
  }, []);
  return null;
}

function Widget(props: WidgetSKConfigInput) {
  useApplyWidgetSKConfig(props);
  return <Child />;
}

function render(element: React.ReactElement) {
  act(() => root.render(element));
}

beforeEach(() => {
  seenByChild = null;
  SKConfig.set({ apiKeys: { swapKit: "" }, v3SwapFlow: { enabled: false } });
  SKConfig.setWidgetId("");
  SKConfig.setWidgetKey("");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useApplyWidgetSKConfig", () => {
  test("child effects see the widget config on the first mount", () => {
    render(<Widget apiBaseUrl="api.example.com" apiKey="key-1" />);

    expect(seenByChild).toEqual({ apiKey: "key-1", apiUrl: "https://api.example.com", widgetId: "" });
  });

  test("keeps auth after the StrictMode mount, unmount, mount cycle", () => {
    render(
      <StrictMode>
        <Widget widgetId="id-1" widgetKey="secret-1" />
      </StrictMode>,
    );

    expect(SKConfig.get("widgetId")).toBe("id-1");
    expect(SKConfig.get("widgetKey")).toBe("secret-1");
  });

  test("applies auth prop changes after mount", () => {
    render(<Widget apiKey="key-1" />);
    render(<Widget widgetId="id-2" widgetKey="secret-2" />);

    expect(readSeen()).toMatchObject({ apiKey: "", widgetId: "id-2" });
  });

  test("does not overwrite values owned by another writer when unrelated props change", () => {
    render(<Widget apiKey="key-1" />);
    expect(SKConfig.get("v3SwapFlow")?.enabled).toBe(true);

    SKConfig.set({ v3SwapFlow: { enabled: false } });
    SKConfig.setEnv("isDev", true);
    render(<Widget apiKey="key-2" developMode={undefined} />);

    expect(SKConfig.get("v3SwapFlow")?.enabled).toBe(false);
    expect(SKConfig.get("envs").isDev).toBe(true);
    expect(SKConfig.get("apiKeys").swapKit).toBe("key-2");
  });

  test("clears auth when the props stop carrying any", () => {
    render(<Widget apiKey="key-1" />);
    render(<Widget />);

    expect(readSeen()).toMatchObject({ apiKey: "", widgetId: "" });
  });
});
