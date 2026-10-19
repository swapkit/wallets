import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { AssetValue, Chain } from "@swapkit/helpers";
import * as realApi from "@swapkit/helpers/api";

const realApiSnapshot = { ...realApi };
const SUI_ADDRESS = "0x1ec5c8aa48a1b6d5b4a20236706420a315e486b6467ce7d1dda729f9bf3d8c93";
const USDC = "SUI.USDC-0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

let apiResponse: Array<Record<string, unknown>> | Error = [];
const apiCalls: Array<Record<string, unknown>> = [];

mock.module("@swapkit/helpers/api", () => ({
  ...realApi,
  SwapKitApi: {
    ...realApi.SwapKitApi,
    getChainBalance: (params: Record<string, unknown>) => {
      apiCalls.push(params);
      return apiResponse instanceof Error ? Promise.reject(apiResponse) : Promise.resolve(apiResponse);
    },
  },
}));

const { getBalanceViaApi } = await import("../src/helpers/apiBalance");

afterAll(() => mock.module("@swapkit/helpers/api", () => realApiSnapshot));

describe("getBalanceViaApi", () => {
  const fallbackCalls: string[] = [];
  const fallback = (address: string) => {
    fallbackCalls.push(address);
    return Promise.resolve([AssetValue.from({ chain: Chain.Sui, value: "1" })]);
  };
  const getBalance = getBalanceViaApi(Chain.Sui, fallback);

  beforeEach(() => {
    apiCalls.length = 0;
    fallbackCalls.length = 0;
  });

  it("maps the API balances to AssetValues without touching the fallback", async () => {
    apiResponse = [
      { chain: Chain.Sui, decimal: 9, identifier: "SUI.SUI", symbol: "SUI", ticker: "SUI", value: "12.937149794" },
      { chain: Chain.Sui, decimal: 6, identifier: USDC, symbol: "USDC", ticker: "USDC", value: "2.5" },
    ];

    const balances = await getBalance(SUI_ADDRESS, false);

    expect(apiCalls).toEqual([{ address: SUI_ADDRESS, chain: Chain.Sui, scamFilter: false }]);
    expect(fallbackCalls).toEqual([]);
    expect(balances.map((balance) => `${balance}=${balance.getValue("string")}`)).toEqual([
      "SUI.SUI=12.937149794",
      `${USDC}=2.5`,
    ]);
    expect(balances[1]?.decimal).toBe(6);
  });

  it("adds a zero gas asset when the API lists only tokens", async () => {
    apiResponse = [{ chain: Chain.Sui, decimal: 6, identifier: USDC, symbol: "USDC", ticker: "USDC", value: "2.5" }];

    const balances = await getBalance(SUI_ADDRESS);

    expect(balances.map((balance) => `${balance}=${balance.getValue("string")}`)).toEqual(["SUI.SUI=0", `${USDC}=2.5`]);
  });

  it("falls back to the toolbox when the API call fails", async () => {
    apiResponse = new Error("401 Unauthorized");

    const balances = await getBalance(SUI_ADDRESS);

    expect(fallbackCalls).toEqual([SUI_ADDRESS]);
    expect(balances.map((balance) => balance.getValue("string"))).toEqual(["1"]);
  });
});
