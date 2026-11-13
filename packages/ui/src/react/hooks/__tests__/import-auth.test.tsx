import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { SwapKitApi, swapKitConfigStore } from "@swapkit/helpers";
import React from "react";
import { createRoot } from "react-dom/client";
import { MissingCredentialsWarning } from "../../components/missing-credentials-warning";
import { createWidgetQueryClient, SwapKitQueryClientProvider, useSwapKitQueryClient } from "../../lib/query-client";
import { useSwapKitStore } from "../../swapkit-context";
import { useSwapQuote } from "../use-swap-quote";
import { useSwapTo } from "../use-swap-to";
import { useTokenPrices, useTokenPricesQuery } from "../use-token-prices";

const originalConfig = swapKitConfigStore.getState();
const price = spyOn(SwapKitApi, "getPrice").mockResolvedValue([{ identifier: "BTC.BTC", price_usd: 42 }] as never);
const quote = spyOn(SwapKitApi, "getSwapQuote").mockResolvedValue({ routes: [] } as never);
const swapTo = spyOn(SwapKitApi, "getSwapTo").mockResolvedValue({ buyAssets: [] } as never);
afterAll(() => {
  price.mockRestore();
  quote.mockRestore();
  swapTo.mockRestore();
});
const wait = () => new Promise((resolve) => setTimeout(resolve, 950));
let cleanup = () => {};
afterEach(() => {
  cleanup();
  swapKitConfigStore.setState(originalConfig, true);
  useSwapKitStore.setState({ swapKit: null });
  price.mockClear();
  quote.mockClear();
  swapTo.mockClear();
});
function auth(mode: "none" | "api" | "widget") {
  swapKitConfigStore.setState({
    apiKeys: { ...originalConfig.apiKeys, swapKit: mode === "api" ? "test-placeholder" : "" },
    widgetId: mode === "widget" ? "test-widget" : undefined,
    widgetKey: mode === "widget" ? "test-placeholder" : undefined,
  });
}
function mount() {
  const result: {
    query?: ReturnType<typeof useTokenPricesQuery>;
    prices?: ReturnType<typeof useTokenPrices>;
    client?: ReturnType<typeof useSwapKitQueryClient>;
    quote?: ReturnType<typeof useSwapQuote>;
  } = {};
  function Probe() {
    result.prices = useTokenPrices();
    result.client = useSwapKitQueryClient();
    result.query = useTokenPricesQuery(["BTC.BTC"]);
    result.quote = useSwapQuote({ amount: "1", inputAsset: "BTC.BTC", outputAsset: "ETH.ETH" });
    useSwapTo("BTC.BTC");
    return React.createElement(MissingCredentialsWarning);
  }
  const node = document.createElement("div");
  document.body.appendChild(node);
  const root = createRoot(node);
  cleanup = () => {
    root.unmount();
    node.remove();
  };
  useSwapKitStore.setState({ swapKit: {} as never });
  root.render(React.createElement(SwapKitQueryClientProvider, null, React.createElement(Probe)));
  return result;
}
test("no credentials suppress hook and imperative prices, quotes and swap-to", async () => {
  auth("none");
  const result = mount();
  await wait();
  await result.prices?.fetchTokenPrices(["ETH.ETH"]);
  expect(document.body.textContent).toContain("API credentials are required");
  await result.quote?.fetchSwapQuote();
  expect(price).toHaveBeenCalledTimes(0);
  expect(quote).toHaveBeenCalledTimes(0);
  expect(swapTo).toHaveBeenCalledTimes(0);
});
for (const mode of ["api", "widget"] as const) {
  test(`${mode} credentials enable requests; removing them stops requests and clears all cached prices`, async () => {
    auth(mode);
    const result = mount();
    await wait();
    expect(price.mock.calls.length).toBeGreaterThan(0);
    expect(quote.mock.calls.length).toBeGreaterThan(0);
    expect(swapTo.mock.calls.length).toBeGreaterThan(0);
    expect(result.prices?.pricesByTokenId.size).toBeGreaterThan(0);
    auth("none");
    await wait();
    const counts = [price.mock.calls.length, quote.mock.calls.length, swapTo.mock.calls.length];
    await result.prices?.fetchTokenPrices(["ETH.ETH"]);
    await result.client?.refetchQueries();
    await result.quote?.fetchSwapQuote();
    await wait();
    expect([price.mock.calls.length, quote.mock.calls.length, swapTo.mock.calls.length]).toEqual(counts);
    expect(result.prices?.pricesByTokenId.size).toBe(0);
    expect(
      result.client
        ?.getQueryCache()
        .findAll({ queryKey: ["prices"] })
        .every(({ state }) => !state.data || (state.data as unknown[]).length === 0),
    ).toBe(true);
  });
}

test("credential loss resets an active observer with no aggregate-cache subscriber", async () => {
  auth("api");
  let observed: ReturnType<typeof useTokenPricesQuery> | undefined;
  function Observer() {
    observed = useTokenPricesQuery(["BTC.BTC"]);
    return null;
  }
  const node = document.createElement("div");
  document.body.appendChild(node);
  const root = createRoot(node);
  cleanup = () => {
    root.unmount();
    node.remove();
  };
  root.render(React.createElement(SwapKitQueryClientProvider, null, React.createElement(Observer)));
  await wait();
  expect(observed?.data?.length).toBeGreaterThan(0);
  auth("none");
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(observed?.data ?? []).toEqual([]);
});

test("price request completing after credential loss cannot cache an empty success under the old key", async () => {
  auth("api");
  const result = mount();
  await wait();
  const query = result.client?.getQueryCache().findAll({ queryKey: ["prices"] })[0];
  if (!query) throw new Error("Expected an observed price query");
  // Replay the real hook queryFn in a client without provider effects, proving
  // the fetchPrices guard itself cannot commit stale-key data in the race.
  const client = createWidgetQueryClient();
  let complete!: (prices: never) => void;
  price.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const pending = client
    .fetchQuery({ queryFn: query.options.queryFn, queryKey: query.queryKey })
    .catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 20));
  auth("none");
  complete([{ identifier: "BTC.BTC", price_usd: 42 }] as never);
  await pending;
  expect(client.getQueryState(query.queryKey)?.status).not.toBe("success");
  expect(client.getQueryData(query.queryKey)).toBeUndefined();
  client.clear();
});
