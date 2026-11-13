import { afterAll, beforeAll, beforeEach, describe, expect, type Mock, mock, spyOn, test } from "bun:test";

import "./setup-dom";

// Minimal React rendering utilities for testing
import React from "react";
import { createRoot } from "react-dom/client";

import { WidgetErrorBoundary } from "../components/sentry-error-boundary";
import * as sentry from "../sentry";

// The boundary's contract is to report through captureWidgetError; what that call
// sends is covered by sentry.test.ts. A spy (restored after this file) replaces
// the earlier process-wide mock.module calls, which leaked into later test files,
// and keeps this file from initialising or disabling the shared Sentry module.
let captureWidgetErrorSpy: Mock<typeof sentry.captureWidgetError>;

beforeAll(() => {
  captureWidgetErrorSpy = spyOn(sentry, "captureWidgetError").mockImplementation(() => {});
});

afterAll(() => {
  captureWidgetErrorSpy.mockRestore();
});

// Helper: render into a real DOM node and return the container
function renderIntoDocument(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(element);
  // Force synchronous flush for React 19
  return { container, root };
}

function cleanup(container: HTMLElement, root: ReturnType<typeof createRoot>) {
  root.unmount();
  container.remove();
}

// A component that throws on render
function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test render error");
  }
  return React.createElement("div", { "data-testid": "child" }, "Child content");
}

describe("WidgetErrorBoundary", () => {
  beforeEach(() => {
    captureWidgetErrorSpy.mockClear();
  });

  test("renders children when no error occurs", async () => {
    const element = React.createElement(
      WidgetErrorBoundary,
      null,
      React.createElement("div", { "data-testid": "child" }, "Hello"),
    );

    const { container, root } = renderIntoDocument(element);

    // Wait for React to flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(container.textContent).toContain("Hello");
    cleanup(container, root);
  });

  test("catches child errors and calls captureWidgetError with category 'ui'", async () => {
    // Suppress console.error from React error boundary
    const originalConsoleError = console.error;
    console.error = mock(() => {});

    const element = React.createElement(
      WidgetErrorBoundary,
      null,
      React.createElement(ThrowingChild, { shouldThrow: true }),
    );

    const { container, root } = renderIntoDocument(element);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(captureWidgetErrorSpy).toHaveBeenCalledTimes(1);
    const [capturedError, context] = captureWidgetErrorSpy.mock.calls[0] ?? [];
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toBe("Test render error");
    expect(context?.category).toBe("ui");

    cleanup(container, root);
    console.error = originalConsoleError;
  });

  test("renders fallback UI when an error occurs", async () => {
    const originalConsoleError = console.error;
    console.error = mock(() => {});

    const element = React.createElement(
      WidgetErrorBoundary,
      null,
      React.createElement(ThrowingChild, { shouldThrow: true }),
    );

    const { container, root } = renderIntoDocument(element);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // The fallback UI should be rendered instead of the child
    const childEl = container.querySelector('[data-testid="child"]');
    expect(childEl).toBeNull();

    // Fallback should contain some error indication
    expect(container.textContent?.length).toBeGreaterThan(0);

    cleanup(container, root);
    console.error = originalConsoleError;
  });

  test("clicking 'Try Again' resets the error state", async () => {
    const originalConsoleError = console.error;
    console.error = mock(() => {});

    // Use a ref-like pattern: first render throws, after reset it should not
    let shouldThrow = true;

    function ConditionalThrower() {
      if (shouldThrow) {
        throw new Error("Resettable error");
      }
      return React.createElement("div", { "data-testid": "recovered" }, "Recovered!");
    }

    const element = React.createElement(WidgetErrorBoundary, null, React.createElement(ConditionalThrower, null));

    const { container, root } = renderIntoDocument(element);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should show fallback with a "Try Again" button
    const tryAgainButton = container.querySelector("button");
    expect(tryAgainButton).not.toBeNull();
    expect(tryAgainButton?.textContent?.toLowerCase()).toContain("try again");

    // Stop throwing before clicking retry
    shouldThrow = false;

    // Click the retry button
    tryAgainButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should now render the recovered content
    const recovered = container.querySelector('[data-testid="recovered"]');
    expect(recovered).not.toBeNull();
    expect(container.textContent).toContain("Recovered!");

    cleanup(container, root);
    console.error = originalConsoleError;
  });
});
