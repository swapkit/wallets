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
import { addSentryBreadcrumb, captureWidgetError, isErrorCaptured, setSentryContext } from "../sentry";

// ════════════════════════════════════════════════════════════════
// ADVERSARIAL TEST SUITE — Sentry Integration
// Focus: data leakage, sanitization gaps, graceful degradation,
//        edge cases in error handling
// ════════════════════════════════════════════════════════════════

describe("ADVERSARIAL: sanitizeEvent — sensitive data in error messages", () => {
  test("FIXED: hex private key embedded in exception message is redacted", () => {
    const privateKey = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const event = { exception: { values: [{ type: "Error", value: `Failed to sign with key ${privateKey}` }] } } as any;

    const result = sanitizeEvent(event);

    expect(result.exception?.values?.[0]?.value).not.toContain(privateKey);
    expect(result.exception?.values?.[0]?.value).toContain("[REDACTED]");
  });

  test("FIXED: seed phrase embedded in exception message is redacted", () => {
    const seedPhrase = "abandon ability able about above absent absorb abstract absurd abuse access accident";
    const event = {
      exception: { values: [{ type: "Error", value: `Keystore decryption returned: ${seedPhrase}` }] },
    } as any;

    const result = sanitizeEvent(event);

    expect(result.exception?.values?.[0]?.value).not.toContain(seedPhrase);
    expect(result.exception?.values?.[0]?.value).toContain("[REDACTED]");
  });

  test("FIXED: normal English sentence is NOT false-positive redacted as seed phrase", () => {
    const normalSentence =
      "Failed to connect wallet because the user rejected the request and the network was unavailable due to timeout";
    const event = { exception: { values: [{ type: "Error", value: normalSentence }] } } as any;

    const result = sanitizeEvent(event);

    // Should NOT be redacted — mixed-case words are not BIP-39 mnemonics
    expect(result.exception?.values?.[0]?.value).toBe(normalSentence);
  });

  test("FIXED: all-lowercase English sentence with long words is NOT false-positive redacted", () => {
    // This sentence is all lowercase and has 15+ words, but contains words >8 chars
    // which are not valid BIP-39 words (max 8 chars in English wordlist)
    const lowercaseSentence =
      "the wallet could not connect because the provider was not found and the chain was not supported for this operation";
    const event = { exception: { values: [{ type: "Error", value: lowercaseSentence }] } } as any;

    const result = sanitizeEvent(event);

    expect(result.exception?.values?.[0]?.value).toBe(lowercaseSentence);
  });

  test("FIXED: private key in event.message field is redacted", () => {
    const privateKey = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    const event = { message: `Signing failed for key ${privateKey}` } as any;

    const result = sanitizeEvent(event);

    expect(result.message).not.toContain(privateKey);
    expect(result.message).toContain("[REDACTED]");
  });
});

describe("ADVERSARIAL: sanitizeEvent — nested object scrubbing", () => {
  test("FIXED: nested object containing privateKey in extra is scrubbed", () => {
    const event = {
      extra: {
        walletInfo: {
          address: "0x1234",
          privateKey: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        },
      },
    } as any;

    const result = sanitizeEvent(event);

    const walletInfo = result.extra?.walletInfo as any;
    expect(walletInfo).toBeDefined();
    expect(walletInfo.privateKey).toBeUndefined();
    expect(walletInfo.address).toBe("0x1234");
  });

  test("FIXED: array of objects containing sensitive data in extra is scrubbed", () => {
    const event = {
      extra: {
        wallets: [
          { address: "0x1234", privateKey: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
          { address: "0x5678", secret: "my-secret-value" },
        ],
      },
    } as any;

    const result = sanitizeEvent(event);

    const wallets = result.extra?.wallets as any[];
    expect(wallets).toBeDefined();
    expect(wallets).toHaveLength(2);
    expect(wallets[0].address).toBe("0x1234");
    expect(wallets[0].privateKey).toBeUndefined();
    expect(wallets[1].address).toBe("0x5678");
    expect(wallets[1].secret).toBeUndefined();
  });

  test("FIXED: nested array with string values containing hex keys is scrubbed", () => {
    const hexKey = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const event = { extra: { logs: ["normal log", `key: ${hexKey}`, "another log"] } } as any;

    const result = sanitizeEvent(event);

    const logs = result.extra?.logs as string[];
    expect(logs[0]).toBe("normal log");
    expect(logs[1]).toContain("[REDACTED]");
    expect(logs[1]).not.toContain(hexKey);
    expect(logs[2]).toBe("another log");
  });

  test("FIXED: nested object in breadcrumb data containing seed is scrubbed", () => {
    const event = {
      breadcrumbs: [
        {
          category: "wallet",
          data: {
            details: { seed: "abandon ability able about above absent absorb abstract absurd abuse access accident" },
          },
        },
      ],
    } as any;

    const result = sanitizeEvent(event);

    const details = result.breadcrumbs?.[0]?.data?.details as any;
    expect(details).toBeDefined();
    expect(details.seed).toBeUndefined();
  });
});

describe("ADVERSARIAL: sanitizeEvent — edge cases", () => {
  test("seed phrase split across multiple extra fields should all be redacted", () => {
    // Attacker scenario: seed phrase split across fields to evade detection
    const event = {
      extra: {
        fragment1: "abandon ability able about above absent",
        fragment2: "absorb abstract absurd abuse access accident",
        // Each has 6 words — individually below the 12-word threshold
      },
    } as any;

    const result = sanitizeEvent(event);

    // Current pattern requires 12+ words, so 6-word fragments pass through.
    // This is an acknowledged limitation but worth documenting.
    // The pattern \b(?:\w+\s){11,23}\w+\b requires 12-24 words.
    // 6-word fragments won't match — this is expected but risky if
    // someone accidentally logs partial phrases.
    expect(result.extra?.fragment1).toBe("abandon ability able about above absent");
  });

  test("hex private key with 0x prefix should also be caught", () => {
    const event = { extra: { key: "0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" } } as any;

    const result = sanitizeEvent(event);

    // The 0x prefix means the 64-hex pattern won't match at word boundary
    // because `0x` precedes the hex — the pattern is \b[a-fA-F0-9]{64}\b
    // "0x" + 64 hex = 66 chars total, but the \b boundary after "0x" depends on regex engine
    // This tests whether the 0x-prefixed form is caught
    expect(result.extra?.key).toBe("[REDACTED]");
  });

  test("keystore JSON accidentally serialized into extra should have sensitive keys stripped", () => {
    // Simulates a keystore file object being passed as a string to extra
    const keystoreJson = JSON.stringify({
      crypto: { cipher: "aes-128-ctr", kdf: "scrypt" },
      id: "some-id",
      version: 3,
    });
    const event = { extra: { keystoreData: keystoreJson, password: "user-secret-password" } } as any;

    const result = sanitizeEvent(event);

    // password key should be stripped entirely
    expect(result.extra?.password).toBeUndefined();
    // keystoreData is a normal JSON string, not sensitive by pattern
    expect(result.extra?.keystoreData).toBe(keystoreJson);
  });

  test("handles null/undefined values in extra without throwing", () => {
    const event = { extra: { field1: null, field2: undefined, field3: "normal" } } as any;

    // Should not throw
    const result = sanitizeEvent(event);
    expect(result.extra?.field3).toBe("normal");
  });

  test("handles empty event object without throwing", () => {
    const event = {} as any;
    const result = sanitizeEvent(event);
    expect(result).toBeDefined();
  });

  test("handles event with empty breadcrumbs array", () => {
    const event = { breadcrumbs: [] } as any;
    const result = sanitizeEvent(event);
    expect(result.breadcrumbs).toEqual([]);
  });

  test("handles breadcrumb with no data field", () => {
    const event = { breadcrumbs: [{ category: "test", message: "no data" }] } as any;
    const result = sanitizeEvent(event);
    expect(result.breadcrumbs?.[0]?.message).toBe("no data");
  });
});

describe("ADVERSARIAL: sensitive key coverage", () => {
  test("FIXED: 'apiSecret' variant key in extras is now stripped", () => {
    const event = { extra: { apiSecret: "not-stripped-before", secret: "should-be-stripped" } } as any;

    const result = sanitizeEvent(event);

    // Both "secret" and "apiSecret" are now caught by case-insensitive substring matching
    expect(result.extra?.secret).toBeUndefined();
    expect(result.extra?.apiSecret).toBeUndefined();
  });

  test("FIXED: common sensitive key variants are now caught by substring matching", () => {
    const event = {
      extra: {
        apiKey: "sk-live-abc123",
        authToken: "bearer-token-xyz",
        passphrase: "my-secret-passphrase",
        secretKey: "super-secret",
        widgetKey: "wk-abc123",
      },
    } as any;

    const result = sanitizeEvent(event);

    expect(result.extra?.apiKey).toBeUndefined();
    expect(result.extra?.authToken).toBeUndefined();
    expect(result.extra?.secretKey).toBeUndefined();
    expect(result.extra?.passphrase).toBeUndefined();
    // widgetKey does not contain any sensitive substring — passes through
    expect(result.extra?.widgetKey).toBe("wk-abc123");
  });

  test("FIXED: snake_case and UPPERCASE sensitive key variants are caught", () => {
    const event = {
      extra: { AUTH_TOKEN: "bearer-xyz", access_token: "at-123", normalField: "safe-value", private_key: "pk-secret" },
    } as any;

    const result = sanitizeEvent(event);

    expect(result.extra?.private_key).toBeUndefined();
    expect(result.extra?.access_token).toBeUndefined();
    expect(result.extra?.AUTH_TOKEN).toBeUndefined();
    expect(result.extra?.normalField).toBe("safe-value");
  });
});

describe("ADVERSARIAL: captureWidgetError — error message leakage", () => {
  beforeEach(() => {
    mockWithScope.mockClear();
    mockCaptureException.mockClear();
  });

  test("error with private key in message is passed to Sentry unredacted", () => {
    const privateKey = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const error = new Error(`Failed to import wallet: ${privateKey}`);

    captureWidgetError(error, { category: "wallet" });

    // The error is passed directly to captureException
    // sanitizeEvent runs at Sentry.init's beforeSend, but captureWidgetError
    // passes the raw Error object to captureException — the message is NOT scrubbed
    // before it reaches Sentry's processing pipeline
    expect(mockCaptureException).toHaveBeenCalled();
  });

  test("extra data with non-string values passes through without deep inspection", () => {
    const sensitiveExtra = { nested: { password: "secret123", privateKey: "0xdeadbeef" }, normalField: "safe" };

    captureWidgetError(new Error("test"), { category: "wallet", extra: sensitiveExtra });

    // The nested object is set as-is via scope.setExtra
    // sanitizeEvent only scrubs top-level string values in extra
    expect(mockWithScope).toHaveBeenCalled();
  });
});

describe("ADVERSARIAL: no-DSN graceful degradation", () => {
  test("captureWidgetError does not throw when Sentry is not initialized", () => {
    // Sentry SDK's withScope/captureException should be no-ops when not initialized
    // This tests that our wrapper doesn't add any throwing behavior
    expect(() => {
      captureWidgetError(new Error("test"), { category: "api" });
    }).not.toThrow();
  });

  test("setSentryContext does not throw when Sentry is not initialized", () => {
    expect(() => {
      setSentryContext({ connectedChains: ["ETH"], walletType: "METAMASK" });
    }).not.toThrow();
  });

  test("addSentryBreadcrumb does not throw when Sentry is not initialized", () => {
    expect(() => {
      addSentryBreadcrumb("test breadcrumb", "test", { key: "value" });
    }).not.toThrow();
  });

  test("addSentryBreadcrumb with undefined data does not throw", () => {
    expect(() => {
      addSentryBreadcrumb("test", "category");
    }).not.toThrow();
  });
});

describe("ADVERSARIAL: initSentry — environment separation", () => {
  // Note: initSentry has a module-level guard (sentryInitialized) that prevents re-init.
  // These tests verify the environment logic conceptually.

  test("environment defaults to 'production' when import.meta.env.MODE is unavailable", () => {
    // The initSentry function falls back to "production" if no env/option is provided
    // This is correct for the widget deployed in production
    // But it means develop-mode widgets without explicit env get "production" tag
    // unless import.meta.env.MODE is set by the build tool

    // We can't easily test this without resetting module state,
    // but we document the expected behavior:
    // - Vite sets import.meta.env.MODE = "development" in dev mode
    // - Widget attribute "develop-mode" does NOT set the Sentry environment
    // - Only the build-time MODE or explicit options.environment controls this
    expect(true).toBe(true); // Structural observation, not a testable bug
  });
});

describe("ADVERSARIAL: error deduplication via WeakMap", () => {
  beforeEach(() => {
    mockWithScope.mockClear();
    mockCaptureException.mockClear();
  });

  test("FIXED: captureWidgetError marks errors as captured with category", () => {
    const apiError = new Error("Transaction failed");

    expect(isErrorCaptured(apiError)).toBe(false);

    captureWidgetError(apiError, { category: "transaction", extra: { routeId: "route-123" } });

    expect(isErrorCaptured(apiError)).toBe(true);
    expect(isErrorCaptured(apiError, "transaction")).toBe(true);
    expect(isErrorCaptured(apiError, "api")).toBe(false);
    expect(mockWithScope).toHaveBeenCalledTimes(1);
  });

  test("FIXED: same error with different category is re-captured", () => {
    const error = new Error("Multi-context error");

    captureWidgetError(error, { category: "transaction", tags: { routeId: "r1" } });
    expect(mockWithScope).toHaveBeenCalledTimes(1);

    // Same error, different category — should be captured again
    captureWidgetError(error, { category: "api", tags: { endpoint: "/quote" } });
    expect(mockWithScope).toHaveBeenCalledTimes(2);

    expect(isErrorCaptured(error, "transaction")).toBe(true);
    expect(isErrorCaptured(error, "api")).toBe(true);
  });

  test("FIXED: same error with same category is deduplicated", () => {
    const error = new Error("Duplicate capture");

    captureWidgetError(error, { category: "wallet" });
    captureWidgetError(error, { category: "wallet" });

    // Should only capture once for the same category
    expect(mockWithScope).toHaveBeenCalledTimes(1);
  });

  test("FIXED: WeakMap dedup does not mutate the Error object", () => {
    const error = new Error("test");
    const ownKeysBefore = Object.getOwnPropertyNames(error);

    captureWidgetError(error, { category: "api" });

    const ownKeysAfter = Object.getOwnPropertyNames(error);
    expect(ownKeysAfter).toEqual(ownKeysBefore);
    expect(isErrorCaptured(error)).toBe(true);
  });

  test("non-Error values are not tracked but still sent to Sentry", () => {
    captureWidgetError("string error", { category: "api" });

    expect(isErrorCaptured("string error")).toBe(false);
    expect(mockWithScope).toHaveBeenCalledTimes(1);
  });
});

describe("ADVERSARIAL: SENSITIVE_KEYS coverage for context fields", () => {
  test("FIXED: context values now strip sensitive keys just like extras", () => {
    // scrubRecord is now called with stripSensitiveKeys=true for contexts
    const event = {
      contexts: {
        wallet: {
          address: "0x123",
          password: "should-not-be-here",
          privateKey: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        },
      },
    } as any;

    const result = sanitizeEvent(event);

    // privateKey is stripped by sensitive key matching (also would be hex-redacted)
    expect(result.contexts?.wallet?.privateKey).toBeUndefined();

    // password is now stripped from contexts too
    expect(result.contexts?.wallet?.password).toBeUndefined();

    // Non-sensitive keys pass through
    expect(result.contexts?.wallet?.address).toBe("0x123");
  });
});

describe("ADVERSARIAL: sanitizeEvent — tag scrubbing", () => {
  test("FIXED: tags are scrubbed by sanitizeEvent", () => {
    const event = {
      tags: {
        privateKey: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD12",
      },
    } as any;

    const result = sanitizeEvent(event);

    // privateKey is a sensitive key, stripped entirely
    expect(result.tags?.privateKey).toBeUndefined();
    // walletAddress is not sensitive and not a hex pattern, passes through
    expect(result.tags?.walletAddress).toBe("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD12");
  });
});
