import { describe, expect, test } from "bun:test";

import {
  ACTIVE_LIMIT_ORDER_STATUSES,
  getLimitOrderStatusMeta,
  HISTORY_LIMIT_ORDER_STATUSES,
  isLiveLimitOrderStatus,
  isTerminalLimitOrderStatus,
  isUiCancellableStatus,
  LIMIT_ORDER_STATUS_META,
} from "../status";

describe("limit order status vocabulary", () => {
  test("the Active list names its statuses and never asks for PENDING", () => {
    expect([...ACTIVE_LIMIT_ORDER_STATUSES]).toEqual(["SUBMITTED", "OPEN", "PARTIAL"]);
    expect(ACTIVE_LIMIT_ORDER_STATUSES).not.toContain("PENDING" as never);
    expect([...HISTORY_LIMIT_ORDER_STATUSES]).toEqual(["FILLED", "CANCELLED", "EXPIRED", "FAILED"]);
  });

  test.each([
    ["SUBMITTED", "Submitting", "sk-ui-text-warning-foreground", true],
    ["OPEN", "Open", "sk-ui-text-muted-foreground", true],
    ["PARTIAL", "In Progress", "sk-ui-text-warning-foreground", true],
    ["FILLED", "Completed", "sk-ui-text-success-foreground", false],
    ["CANCELLED", "Cancelled", "sk-ui-text-muted-foreground", false],
    ["EXPIRED", "Expired", "sk-ui-text-muted-foreground", false],
    ["FAILED", "Failed", "sk-ui-text-error-foreground", false],
    ["PENDING", null, null, false],
  ] as const)("%s reads %s", (status, label, textClass, cancellable) => {
    expect(LIMIT_ORDER_STATUS_META[status].label).toBe(label);
    expect(LIMIT_ORDER_STATUS_META[status].textClass).toBe(textClass);
    expect(isUiCancellableStatus(status)).toBe(cancellable);
  });

  test.each([
    ["PARTIALLY_REFUNDED", "Partially refunded"],
    ["", "Unknown"],
  ])("unknown status %p falls back to a neutral meta", (status, label) => {
    expect(getLimitOrderStatusMeta(status)).toMatchObject({ cancellable: false, label });
    expect(isUiCancellableStatus(status)).toBe(false);
    expect(isLiveLimitOrderStatus(status)).toBe(false);
    expect(isTerminalLimitOrderStatus(status)).toBe(false);
  });

  test("every status has meta", () => {
    expect(Object.keys(LIMIT_ORDER_STATUS_META).sort()).toEqual(
      ["CANCELLED", "EXPIRED", "FAILED", "FILLED", "OPEN", "PARTIAL", "PENDING", "SUBMITTED"].sort(),
    );
  });
});
