import { beforeEach, describe, expect, test } from "bun:test";

import "../../__tests__/setup-dom";

import { NuqsAdapter } from "nuqs/adapters/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { resetWidgetFormStore, useWidgetFormStore } from "../../stores/widget-form-store";
import { SwapKitConfigProvider } from "../../swapkit-config-context";
import { useAssetPair } from "../use-asset-pair";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PairProps = Omit<Parameters<typeof useAssetPair>[0], "syncUrl">;

function mountPair(initialProps: PairProps = {}) {
  const result: { current?: ReturnType<typeof useAssetPair> } = {};
  function Probe(props: PairProps) {
    result.current = useAssetPair({ ...props, syncUrl: false });
    return null;
  }

  const root = createRoot(document.createElement("div"));
  const render = (props: PairProps) =>
    act(() => {
      root.render(
        <NuqsAdapter>
          <SwapKitConfigProvider>
            <Probe {...props} />
          </SwapKitConfigProvider>
        </NuqsAdapter>,
      );
    });
  render(initialProps);
  return { rerender: render, result, unmount: () => act(() => root.unmount()) };
}

describe("useAssetPair without URL sync", () => {
  beforeEach(() => resetWidgetFormStore());

  test("keeps the pair and the pending operation when the panel remounts", () => {
    const first = mountPair();
    const defaultInput = first.result.current?.inputAsset;

    act(() => {
      first.result.current?.setInputAsset("ETH.ETH");
      first.result.current?.setAmount("1.5");
    });
    expect(useWidgetFormStore.getState().startOperation("swap")).toBe(true);
    first.unmount();

    const second = mountPair();
    expect(second.result.current?.inputAsset).toBe("ETH.ETH");
    expect(second.result.current?.amount).toBe("1.5");
    expect(useWidgetFormStore.getState().startOperation("swap")).toBe(false);
    second.unmount();

    resetWidgetFormStore();
    const fresh = mountPair();
    expect(fresh.result.current?.inputAsset).toBe(defaultInput);
    expect(fresh.result.current?.amount).toBe("");
    expect(useWidgetFormStore.getState().pendingOperation).toBeNull();
    fresh.unmount();
  });

  test("applies a changed asset prop over a pick but keeps the pick when the panel remounts", () => {
    const first = mountPair({ initialInputAsset: "BTC.BTC" });
    act(() => first.result.current?.setInputAsset("ETH.ETH"));
    first.rerender({ initialInputAsset: "BTC.BTC" });
    expect(first.result.current?.inputAsset).toBe("ETH.ETH");

    first.rerender({ initialInputAsset: "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7" });
    expect(first.result.current?.inputAsset).toBe("ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7");

    act(() => first.result.current?.setInputAsset("ETH.ETH"));
    first.unmount();

    const second = mountPair({ initialInputAsset: "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7" });
    expect(second.result.current?.inputAsset).toBe("ETH.ETH");
    second.unmount();
  });
});
