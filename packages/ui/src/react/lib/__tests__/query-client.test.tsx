import { describe, expect, test } from "bun:test";

import "../../__tests__/setup-dom";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SwapKitQueryClientProvider, useSwapKitQuery, useSwapKitQueryClient } from "../query-client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SwapKitQueryClientProvider", () => {
  test("keeps widget queries out of the host client and leaves host queries on it", async () => {
    const hostClient = new QueryClient();
    let swapKitClient: QueryClient | null = null;

    function WidgetQuery() {
      swapKitClient = useSwapKitQueryClient();
      useSwapKitQuery({ queryFn: async () => "widget", queryKey: ["widget"] });
      return null;
    }

    function HostQuery() {
      useQuery({ queryFn: async () => "host", queryKey: ["host"] });
      return null;
    }

    const root = createRoot(document.createElement("div"));
    act(() =>
      root.render(
        <QueryClientProvider client={hostClient}>
          <SwapKitQueryClientProvider>
            <WidgetQuery />
            <HostQuery />
          </SwapKitQueryClientProvider>
        </QueryClientProvider>,
      ),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));

    const keysIn = (client: QueryClient | null) =>
      client
        ?.getQueryCache()
        .getAll()
        .map((query) => query.queryKey);
    expect(keysIn(swapKitClient)).toEqual([["widget"]]);
    expect(keysIn(hostClient)).toEqual([["host"]]);

    act(() => root.unmount());
  });
});
