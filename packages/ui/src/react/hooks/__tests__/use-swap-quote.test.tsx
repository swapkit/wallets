import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test";

import "../../__tests__/setup-dom";

import { SwapKitApi, swapKitConfigStore } from "@swapkit/helpers";
import React from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { SwapKitQueryClientProvider } from "../../lib/query-client";
import { useSwapKitStore } from "../../swapkit-context";
import { useSwapQuote } from "../use-swap-quote";

type SwapQuote = ReturnType<typeof useSwapQuote>;
type ProbeProps = { amount: string; inputAsset: string; outputAsset: string };

// Swapped per test to drive the success / failure / still-in-flight paths.
let handleQuoteRequest: () => Promise<unknown> = async () => ({ routes: [] });

const toastErrors: string[] = [];

const getSwapQuoteSpy = spyOn(SwapKitApi, "getSwapQuote").mockImplementation((() =>
  handleQuoteRequest()) as typeof SwapKitApi.getSwapQuote);
const toastErrorSpy = spyOn(toast, "error").mockImplementation(((message: string) => {
  toastErrors.push(message);
  return "";
}) as typeof toast.error);

// The quote only fires with a SwapKit client in the store; nothing on it is called here.
useSwapKitStore.setState({ swapKit: {} as never });

// Quotes are only requested with API auth configured.
const { apiKeys } = swapKitConfigStore.getState();
swapKitConfigStore.setState({ apiKeys: { ...apiKeys, swapKit: "test-api-key" } });

afterAll(() => {
  getSwapQuoteSpy.mockRestore();
  toastErrorSpy.mockRestore();
  useSwapKitStore.setState({ swapKit: null });
  swapKitConfigStore.setState({ apiKeys });
});

// Param changes are debounced by 700ms, so every wait has to outlast a full
// debounce window.
const settle = (ms = 900) => new Promise((resolve) => setTimeout(resolve, ms));

function quoteWithBuyAmount(expectedBuyAmount: string, buyAsset: string) {
  return {
    routes: [
      {
        estimatedTime: { total: 60 },
        expectedBuyAmount,
        expectedBuyAmountMaxSlippage: expectedBuyAmount,
        fees: [],
        meta: { assets: [{ asset: buyAsset, price: 10 }], tags: [] },
        providers: ["THORCHAIN"],
        routeId: "route-1",
      },
    ],
  };
}

function renderProbe() {
  const result: { current: SwapQuote | null } = { current: null };

  function Probe({ amount, inputAsset, outputAsset }: ProbeProps) {
    result.current = useSwapQuote({ amount, inputAsset, outputAsset });
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const cleanup = () => {
    root.unmount();
    container.remove();
  };

  const render = (props: ProbeProps) =>
    root.render(React.createElement(SwapKitQueryClientProvider, null, React.createElement(Probe, props)));

  return { cleanup, render, result };
}

describe("useSwapQuote clears the previous quote", () => {
  beforeEach(() => {
    toastErrors.length = 0;
    handleQuoteRequest = async () => quoteWithBuyAmount("50", "ETH.ETH");
  });

  test("drops the previous quote when the new one fails", async () => {
    const { cleanup, render, result } = renderProbe();

    render({ amount: "1", inputAsset: "BTC.BTC", outputAsset: "ETH.ETH" });
    await settle();

    expect(result.current?.selectedRoute.expectedBuyAmount).toBe(50);
    expect(result.current?.selectedRoute.formattedOutputAssetPriceUSD).toBe("$500.00");

    handleQuoteRequest = () => Promise.reject(new Error("no route found"));
    render({ amount: "1", inputAsset: "BTC.BTC", outputAsset: "DOGE.DOGE" });
    await settle();

    expect(result.current?.selectedRoute.expectedBuyAmount).toBeUndefined();
    expect(result.current?.selectedRoute.formattedOutputAssetPriceUSD).toBeUndefined();
    expect(result.current?.routes).toBeUndefined();

    cleanup();
  });

  test("drops the previous quote when the new response has no routes", async () => {
    const { cleanup, render, result } = renderProbe();

    render({ amount: "1", inputAsset: "BTC.BTC", outputAsset: "ETH.ETH" });
    await settle();

    expect(result.current?.selectedRoute.expectedBuyAmount).toBe(50);

    handleQuoteRequest = async () => ({ routes: [] });
    render({ amount: "1", inputAsset: "BTC.BTC", outputAsset: "DOGE.DOGE" });
    await settle();

    expect(result.current?.selectedRoute.expectedBuyAmount).toBeUndefined();
    expect(result.current?.routes).toBeUndefined();
    expect(toastErrors).toContain("No routes available for this swap");

    cleanup();
  });
});

describe("useSwapQuote output value", () => {
  // The quoted buy amount is already net of fees, so they must not be subtracted again.
  test("does not subtract fees from the receive value", async () => {
    const [route] = quoteWithBuyAmount("50", "ETH.ETH").routes;
    handleQuoteRequest = async () => ({
      routes: [
        {
          ...route,
          fees: [{ amount: "10", asset: "ETH.ETH", chain: "ETH", type: "outbound" }],
          meta: { assets: [...(route?.meta.assets ?? []), { asset: "BTC.BTC", price: 1000 }], tags: [] },
        },
      ],
    });
    const { cleanup, render, result } = renderProbe();

    render({ amount: "1", inputAsset: "BTC.BTC", outputAsset: "ETH.ETH" });
    await settle();

    expect(result.current?.selectedRoute.formattedOutputAssetPriceUSD).toBe("$500.00");
    expect(result.current?.selectedRoute.formattedTotalFeesUSD).toBe("$100.00");

    cleanup();
  });
});
