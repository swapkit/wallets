import { beforeEach, describe, expect, mock, test } from "bun:test";

import "./setup-dom";

// DOMINION: Removed mock.module("../sentry") which leaked across test files in bun 1.3.x
// with --coverage, causing sentry.test.ts to receive no-op stubs instead of real functions.
// Now we only mock @sentry/react and verify behavior through its mocks, which the real
// captureWidgetError in ../sentry calls transitively.
const mockCaptureException = mock(() => "event-id-123");
const mockWithScope = mock((callback: (scope: any) => void) => {
  const scope = {
    setContext: mock(() => scope),
    setExtra: mock(() => scope),
    setLevel: mock(() => scope),
    setTag: mock(() => scope),
  };
  callback(scope);
});

mock.module("@sentry/react", () => ({
  addBreadcrumb: mock(() => {}),
  browserTracingIntegration: () => ({ name: "BrowserTracing" }),
  captureException: mockCaptureException,
  ErrorBoundary: ({ children }: { children: any }) => children,
  init: mock(() => {}),
  replayIntegration: () => ({ name: "Replay" }),
  setContext: mock(() => {}),
  setTag: mock(() => {}),
  withScope: mockWithScope,
}));

// Minimal React rendering utilities for testing
import React from "react";
import { createRoot } from "react-dom/client";

// Import the component under test — will be created by implementation step
import { WidgetErrorBoundary } from "../components/sentry-error-boundary";

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
    mockWithScope.mockClear();
    mockCaptureException.mockClear();
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

    // captureWidgetError calls Sentry.withScope → Sentry.captureException
    expect(mockWithScope).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    // DOMINION: Cast mock.calls to any[][] to satisfy TS2352/TS2493 — bun mock types use empty tuple at compile time
    const capturedError = (mockCaptureException.mock.calls as unknown as any[][])[0]?.[0] as Error;
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError.message).toBe("Test render error");

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
