import { afterAll, beforeAll, beforeEach, type Mock, mock, spyOn } from "bun:test";
import type { Scope } from "@sentry/react";
import * as SentryReact from "@sentry/react";

import * as nodeEnv from "../lib/node-env";

export type SentryModule = typeof import("../sentry");
type BrowserClientOptions = ConstructorParameters<typeof SentryReact.BrowserClient>[0];

// Annotated rather than inferred: the d.ts build cannot name Sentry's internal client options type.
export interface FakeSentryClient {
  captureException: Mock<(exception: unknown, hint?: unknown, scope?: Scope) => string>;
  /** The error and the scope data (tags, extra, contexts, breadcrumbs) of the first reported error. */
  captured(): { exception: unknown; scopeData: ReturnType<Scope["getScopeData"]> | undefined };
  /** Options of every client built since the current test started. */
  clientOptions: BrowserClientOptions[];
  init: Mock<() => void>;
  /** What the telemetry gate returns; reset to true before each test. */
  telemetryEnvironment: boolean;
}

// `.invalid` never resolves (RFC 2606), so even a real client built by mistake cannot deliver an event.
export const TEST_DSN = "https://public@sentry.invalid/1";

let instanceCount = 0;

/**
 * Evaluates a private copy of `../sentry`. The module keeps its client and its
 * telemetry-disabled flag in module state, and other test files reach the shared
 * copy through widget code, so each caller here starts clean and leaves the
 * shared copy untouched.
 */
export function loadFreshSentry(): Promise<SentryModule> {
  instanceCount += 1;
  return import(`../sentry?instance=${instanceCount}`);
}

/** A fresh `../sentry` with its client already built. Call it from a hook or test, after the spies are installed. */
export async function loadInitialisedSentry() {
  const sentry = await loadFreshSentry();
  sentry.initSentry({ dsn: TEST_DSN });
  return sentry;
}

/**
 * Runs the calling test file as a telemetry environment and replaces Sentry's
 * BrowserClient with a recorder, so no event is sent and no global integration
 * (console, fetch or error handlers) is installed. Errors still go through the
 * real Sentry Scope. Both spies are restored after the file.
 */
export function installFakeSentryClient(): FakeSentryClient {
  const captureException = mock((_exception: unknown, _hint?: unknown, _scope?: Scope) => "test-event-id");
  const clientOptions: BrowserClientOptions[] = [];
  const init = mock(() => {});
  const spies: { mockRestore(): void }[] = [];

  const fake: FakeSentryClient = {
    captured() {
      const [exception, , scope] = captureException.mock.calls[0] ?? [];
      return { exception, scopeData: scope?.getScopeData() };
    },
    captureException,
    clientOptions,
    init,
    telemetryEnvironment: true,
  };

  beforeAll(() => {
    spies.push(
      spyOn(nodeEnv, "isTelemetryEnvironment").mockImplementation(() => fake.telemetryEnvironment),
      // bun-types only types spies on plain functions, so the constructor stand-in needs a cast.
      spyOn(SentryReact, "BrowserClient").mockImplementation(((options: BrowserClientOptions) => {
        clientOptions.push(options);
        return { captureException, init };
      }) as never),
    );
  });

  beforeEach(() => {
    captureException.mockClear();
    init.mockClear();
    clientOptions.length = 0;
    fake.telemetryEnvironment = true;
  });

  afterAll(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
  });

  return fake;
}
