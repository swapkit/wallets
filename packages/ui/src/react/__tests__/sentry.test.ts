import { beforeEach, describe, expect, test } from "bun:test";

import { sanitizeEvent } from "../sanitize";
import {
  installFakeSentryClient,
  loadFreshSentry,
  loadInitialisedSentry,
  type SentryModule,
  TEST_DSN,
} from "./fake-sentry-client";

const fakeSentry = installFakeSentryClient();

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
  let sentry: SentryModule;

  beforeEach(async () => {
    sentry = await loadInitialisedSentry();
  });

  test("reports the error with tags for its category and custom tags", () => {
    const error = new Error("test");

    sentry.captureWidgetError(error, { category: "api", tags: { endpoint: "quote" } });

    expect(fakeSentry.captureException).toHaveBeenCalledTimes(1);
    const { exception, scopeData } = fakeSentry.captured();
    expect(exception).toBe(error);
    expect(scopeData?.tags.category).toBe("api");
    expect(scopeData?.tags.endpoint).toBe("quote");
  });

  test("wraps non-Error values in new Error(String(value))", () => {
    sentry.captureWidgetError("string error", { category: "api" });

    expect(fakeSentry.captureException).toHaveBeenCalledTimes(1);
    const { exception } = fakeSentry.captured();
    expect(exception).toBeInstanceOf(Error);
    expect((exception as Error).message).toBe("string error");
  });

  describe("supports all 5 categories", () => {
    const categories = ["ui", "api", "wallet", "transaction", "data"] as const;

    for (const category of categories) {
      test(`accepts category '${category}'`, () => {
        sentry.captureWidgetError(new Error(`${category} error`), { category });

        expect(fakeSentry.captureException).toHaveBeenCalledTimes(1);
        expect(fakeSentry.captured().scopeData?.tags.category).toBe(category);
      });
    }
  });
});

// ────────────────────────────────────────────────────────────
// 3. setSentryContext
// ────────────────────────────────────────────────────────────
describe("setSentryContext", () => {
  let sentry: SentryModule;

  beforeEach(async () => {
    sentry = await loadInitialisedSentry();
  });

  test("attaches the 'swapkit' context and wallet tags to later reports", () => {
    sentry.setSentryContext({ connectedChains: ["ETH", "BTC"], walletType: "METAMASK" });
    sentry.captureWidgetError(new Error("after context"), { category: "wallet" });

    const { scopeData } = fakeSentry.captured();
    expect(scopeData?.contexts.swapkit).toEqual({ connectedChains: ["ETH", "BTC"], walletType: "METAMASK" });
    expect(scopeData?.tags.walletType).toBe("METAMASK");
  });

  test("does not set undefined values as tags", () => {
    sentry.setSentryContext({ connectedChains: ["ETH"], walletType: undefined });
    sentry.captureWidgetError(new Error("after context"), { category: "wallet" });

    const { scopeData } = fakeSentry.captured();
    expect(scopeData?.tags.connectedChains).toBe("ETH");
    expect(scopeData?.tags).not.toHaveProperty("walletType");
  });
});

// ────────────────────────────────────────────────────────────
// 4. initSentry
// ────────────────────────────────────────────────────────────
describe("initSentry", () => {
  test("builds no client and reports nothing outside a telemetry environment", async () => {
    fakeSentry.telemetryEnvironment = false;
    const sentry = await loadFreshSentry();

    sentry.initSentry({ dsn: TEST_DSN });
    sentry.captureWidgetError(new Error("local error"), { category: "ui" });
    sentry.setSentryContext({ walletType: "METAMASK" });
    sentry.addSentryBreadcrumb("local breadcrumb", "test");

    expect(fakeSentry.clientOptions).toHaveLength(0);
    expect(fakeSentry.captureException).not.toHaveBeenCalled();
  });

  test("builds the client with the given DSN and sanitises events before sending", async () => {
    const { initSentry } = await loadFreshSentry();

    initSentry({ dsn: TEST_DSN });

    expect(fakeSentry.clientOptions).toHaveLength(1);
    expect(fakeSentry.init).toHaveBeenCalledTimes(1);
    const options = fakeSentry.clientOptions[0];
    expect(options?.dsn).toBe(TEST_DSN);

    const sent = await options?.beforeSend?.({ extra: { privateKey: "0xdeadbeef", status: 200 }, type: undefined }, {});
    expect(sent?.extra).toEqual({ status: 200 });
  });

  test("calling initSentry twice only builds one client (guard check)", async () => {
    const { initSentry } = await loadFreshSentry();

    initSentry({ dsn: TEST_DSN });
    initSentry({ dsn: "https://other@sentry.invalid/2" });

    expect(fakeSentry.clientOptions).toHaveLength(1);
    expect(fakeSentry.clientOptions[0]?.dsn).toBe(TEST_DSN);
  });
});
