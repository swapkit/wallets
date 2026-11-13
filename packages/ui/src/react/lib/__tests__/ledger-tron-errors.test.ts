import { describe, expect, test } from "bun:test";
import { Chain, SwapKitError } from "@swapkit/helpers";
import { isLedgerTronDataNotAllowedError } from "../ledger-tron-errors";

const ledgerError = (statusWord: string) =>
  new SwapKitError({ errorKey: "wallet_ledger_transport_error", info: { statusWord } });

describe("detecting a Ledger Tron swap blocked by the 'Allow data' setting", () => {
  test("finds the status word after the SDK wraps the device error", () => {
    const wrapped = new SwapKitError("core_swap_invalid_params", { error: ledgerError("6a8b") });

    expect(isLedgerTronDataNotAllowedError(wrapped, Chain.Tron)).toBe(true);
  });

  test("ignores the same status word from another chain's app", () => {
    expect(isLedgerTronDataNotAllowedError(ledgerError("6a8b"), Chain.Bitcoin)).toBe(false);
  });

  test("ignores other Ledger errors", () => {
    expect(isLedgerTronDataNotAllowedError(ledgerError("6a80"), Chain.Tron)).toBe(false);
  });
});
