import { afterEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import { ChainId } from "@swapkit/helpers";
import { SwapKitApi } from "@swapkit/helpers/api";
import { useTransactionHistoryStore } from "../../stores/transaction-history-store";
import { startTransactionTracking } from "../transaction-tracker";

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 50 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe("startTransactionTracking", () => {
  let spies: Mock<(...args: never[]) => unknown>[] = [];
  let stops: (() => void)[] = [];

  afterEach(() => {
    for (const stop of stops) stop();
    for (const spy of spies) spy.mockRestore();
    stops = [];
    spies = [];
    useTransactionHistoryStore.getState().clearHistory();
  });

  test("shares one polling loop between callers and marks completed transactions", async () => {
    const trackerSpy = spyOn(SwapKitApi, "getTrackerDetails").mockResolvedValue({
      legs: [],
      status: "completed",
    } as unknown as Awaited<ReturnType<typeof SwapKitApi.getTrackerDetails>>);
    const setIntervalSpy = spyOn(globalThis, "setInterval");
    const clearIntervalSpy = spyOn(globalThis, "clearInterval");
    spies = [trackerSpy, setIntervalSpy, clearIntervalSpy];

    useTransactionHistoryStore
      .getState()
      .addTransaction({ chainId: ChainId.Ethereum, hash: "0xabc", status: "pending", type: "swap" });

    const stopFirst = startTransactionTracking();
    const stopSecond = startTransactionTracking();
    stops = [stopFirst, stopSecond];

    const isCompleted = () => useTransactionHistoryStore.getState().transactions[0]?.status === "completed";
    await waitFor(isCompleted);

    expect(isCompleted()).toBe(true);
    expect(trackerSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    stopFirst();
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    stopSecond();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
