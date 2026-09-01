import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- Mock @sentry/react before importing the modules under test ---
const mockInit = mock(() => {});
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
const mockSetContext = mock(() => {});
const mockSetTag = mock(() => {});
const mockAddBreadcrumb = mock(() => {});

mock.module("@sentry/react", () => ({
  addBreadcrumb: mockAddBreadcrumb,
  browserTracingIntegration: () => ({ name: "BrowserTracing" }),
  captureException: mockCaptureException,
  ErrorBoundary: ({ children }: { children: any }) => children,
  init: mockInit,
  replayIntegration: () => ({ name: "Replay" }),
  setContext: mockSetContext,
  setTag: mockSetTag,
  withScope: mockWithScope,
}));

import { sanitizeEvent } from "../sanitize";
import { captureWidgetError, initSentry, setSentryContext } from "../sentry";

// ────────────────────────────────────────────────────────────
// 1. sanitizeEvent
// ────────────────────────────────────────────────────────────
describe("sanitizeEvent", () => {
  describe("hex string redaction", () => {
    test("replaces a 64-char hex string in extras with [REDACTED]", () => {
      const hexString = "a".repeat(64);
      const event = { extra: { normalField: "hello", txHash: hexString } } as any;

      const result = sanitizeEvent(event);

      expect(result.extra?.txHash).toBe(hexString); // tx hashes are fine — they're public
      // But a hex string that looks like a private key should be redacted
      const privateKeyHex = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
      const eventWithKey = { extra: { key: privateKeyHex, status: 200 } } as any;

      const resultWithKey = sanitizeEvent(eventWithKey);
      // A standalone 64-char hex that is NOT a known-safe field should be redacted
      expect(resultWithKey.extra?.key).toBe("[REDACTED]");
      expect(resultWithKey.extra?.status).toBe(200);
    });
  });

  describe("seed phrase redaction", () => {
    test("strips mnemonic key from contexts (sensitive key takes priority)", () => {
      const seedPhrase = "abandon ability able about above absent absorb abstract absurd abuse access accident";
      const event = { contexts: { wallet: { mnemonic: seedPhrase } } } as any;

      const result = sanitizeEvent(event);

      expect(result.contexts?.wallet?.mnemonic).toBeUndefined();
    });

    test("redacts a 12-word seed phrase in a non-sensitive extra key", () => {
      const seedPhrase = "abandon ability able about above absent absorb abstract absurd abuse access accident";
      const event = { extra: { debugLog: seedPhrase } } as any;

      const result = sanitizeEvent(event);

      expect(result.extra?.debugLog).toBe("[REDACTED]");
    });
  });

  describe("sensitive key stripping", () => {
    test("strips keys named privateKey, mnemonic, seed, password from extras", () => {
      const event = {
        extra: {
          mnemonic: "word1 word2 word3",
          password: "secret123",
          privateKey: "0xdeadbeef",
          safeField: "keep-me",
          seed: "someseeddata",
        },
      } as any;

      const result = sanitizeEvent(event);

      expect(result.extra?.privateKey).toBeUndefined();
      expect(result.extra?.mnemonic).toBeUndefined();
      expect(result.extra?.seed).toBeUndefined();
      expect(result.extra?.password).toBeUndefined();
      expect(result.extra?.safeField).toBe("keep-me");
    });
  });

  describe("passthrough of normal data", () => {
    test("normal error data (endpoint, status code, chain name) passes through unchanged", () => {
      const event = {
        extra: { chain: "ETH", endpoint: "/api/quote", errorMessage: "Internal Server Error", statusCode: 500 },
      } as any;

      const result = sanitizeEvent(event);

      expect(result.extra?.endpoint).toBe("/api/quote");
      expect(result.extra?.statusCode).toBe(500);
      expect(result.extra?.chain).toBe("ETH");
      expect(result.extra?.errorMessage).toBe("Internal Server Error");
    });
  });
});

// ────────────────────────────────────────────────────────────
// 2. captureWidgetError
// ────────────────────────────────────────────────────────────
describe("captureWidgetError", () => {
  beforeEach(() => {
    mockWithScope.mockClear();
    mockCaptureException.mockClear();
  });

  test("calls Sentry.withScope and sets correct tags for category and custom tags", () => {
    captureWidgetError(new Error("test"), { category: "api", tags: { endpoint: "quote" } });

    expect(mockWithScope).toHaveBeenCalledTimes(1);

    // Verify the scope had setTag called with the right values
    const scopeCallback = mockWithScope.mock.calls[0]?.[0] as (scope: any) => void;
    const fakeScope = {
      setContext: mock(() => fakeScope),
      setExtra: mock(() => fakeScope),
      setLevel: mock(() => fakeScope),
      setTag: mock(() => fakeScope),
    };
    scopeCallback(fakeScope);

    // Should set category tag
    const tagCalls = fakeScope.setTag.mock.calls as unknown as [string, string][];
    const categoryCall = tagCalls.find(([key]) => key === "category");
    expect(categoryCall?.[1]).toBe("api");

    const endpointCall = tagCalls.find(([key]) => key === "endpoint");
    expect(endpointCall?.[1]).toBe("quote");
  });

  test("wraps non-Error values in new Error(String(value))", () => {
    captureWidgetError("string error", { category: "api" });

    expect(mockWithScope).toHaveBeenCalledTimes(1);

    // The captureException call should receive an Error object
    const scopeCallback = mockWithScope.mock.calls[0]?.[0] as (scope: any) => void;
    const fakeScope = {
      setContext: mock(() => fakeScope),
      setExtra: mock(() => fakeScope),
      setLevel: mock(() => fakeScope),
      setTag: mock(() => fakeScope),
    };
    scopeCallback(fakeScope);

    expect(mockCaptureException).toHaveBeenCalled();
    const capturedArg = (mockCaptureException.mock.calls as unknown as any[][])[0]?.[0];
    expect(capturedArg).toBeInstanceOf(Error);
    expect((capturedArg as Error).message).toBe("string error");
  });

  describe("supports all 5 categories", () => {
    const categories = ["ui", "api", "wallet", "transaction", "data"] as const;

    for (const category of categories) {
      test(`accepts category '${category}'`, () => {
        mockWithScope.mockClear();
        mockCaptureException.mockClear();

        captureWidgetError(new Error(`${category} error`), { category });

        expect(mockWithScope).toHaveBeenCalledTimes(1);

        const scopeCallback = mockWithScope.mock.calls[0]?.[0] as (scope: any) => void;
        const fakeScope = {
          setContext: mock(() => fakeScope),
          setExtra: mock(() => fakeScope),
          setLevel: mock(() => fakeScope),
          setTag: mock(() => fakeScope),
        };
        scopeCallback(fakeScope);

        const tagCalls = fakeScope.setTag.mock.calls as unknown as [string, string][];
        const categoryCall = tagCalls.find(([key]) => key === "category");
        expect(categoryCall?.[1]).toBe(category);
      });
    }
  });
});

// ────────────────────────────────────────────────────────────
// 3. setSentryContext
// ────────────────────────────────────────────────────────────
describe("setSentryContext", () => {
  beforeEach(() => {
    mockSetContext.mockClear();
    mockSetTag.mockClear();
  });

  test("sets the 'swapkit' context and tags for wallet info", () => {
    setSentryContext({ connectedChains: ["ETH", "BTC"], walletType: "METAMASK" });

    expect(mockSetContext).toHaveBeenCalledWith("swapkit", { connectedChains: ["ETH", "BTC"], walletType: "METAMASK" });

    const tagCalls = mockSetTag.mock.calls as unknown as [string, string][];
    const walletTypeTag = tagCalls.find(([key]) => key === "walletType");
    expect(walletTypeTag?.[1]).toBe("METAMASK");
  });

  test("does not set undefined values as tags", () => {
    setSentryContext({ connectedChains: ["ETH"], walletType: undefined });

    const tagCalls = mockSetTag.mock.calls as unknown as [string, string][];
    const walletTypeTag = tagCalls.find(([key]) => key === "walletType");
    expect(walletTypeTag).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// 4. initSentry
// ────────────────────────────────────────────────────────────
describe("initSentry", () => {
  beforeEach(() => {
    mockInit.mockClear();
  });

  test("does NOT call Sentry.init when DSN is not provided", () => {
    initSentry();

    expect(mockInit).not.toHaveBeenCalled();
  });

  test("calls Sentry.init with correct config when DSN is provided", () => {
    initSentry({ dsn: "https://test@sentry.io/123" });

    expect(mockInit).toHaveBeenCalledTimes(1);
    const config = (mockInit.mock.calls as unknown as any[][])[0]?.[0] as Record<string, unknown>;
    expect(config.dsn).toBe("https://test@sentry.io/123");
  });

  test("calling initSentry twice only calls Sentry.init once (guard check)", () => {
    // Reset the internal state by importing fresh — but since modules are cached,
    // we test the guard by calling twice in sequence.
    // The first call in the previous test already initialized, so this tests the guard.
    initSentry({ dsn: "https://test@sentry.io/456" });

    // init should not be called again because the guard prevents double init
    // Total calls across this describe block: 1 from the previous test
    // (the no-DSN test doesn't call init, the DSN test calls it once, this should not call again)
    expect(mockInit).not.toHaveBeenCalled();
  });
});
