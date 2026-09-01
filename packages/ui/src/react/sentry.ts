import {
  BrowserClient,
  breadcrumbsIntegration,
  dedupeIntegration,
  defaultStackParser,
  functionToStringIntegration,
  globalHandlersIntegration,
  linkedErrorsIntegration,
  makeFetchTransport,
  Scope,
} from "@sentry/react";

import { sanitizeEvent } from "./sanitize";

export { sanitizeEvent };

/**
 * Default DSN for @swapkit/ui widget telemetry. Errors from inside the widget
 * are reported here regardless of whether the host app has its own Sentry.
 * We use a dedicated BrowserClient bound to a private Scope so we never
 * collide with the host's global Sentry client.
 */
const DEFAULT_WIDGET_DSN =
  "https://ede7a7b9b7dd3de03b64903fc5385421@o4511145607036928.ingest.us.sentry.io/4511150591180800";

declare const __SWAPKIT_VERSION__: string;

let widgetScope: Scope | null = null;
let telemetryDisabled = false;

export function disableTelemetry() {
  telemetryDisabled = true;
  widgetScope = null;
}

export function initSentry(options?: { dsn?: string; environment?: string; release?: string; sampleRate?: number }) {
  if (telemetryDisabled || widgetScope) return;

  const dsn =
    options?.dsn ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SENTRY_DSN) ||
    (typeof window !== "undefined" && (window as any).__SWAPKIT_SENTRY_DSN__) ||
    DEFAULT_WIDGET_DSN;

  if (!dsn) return;

  const environment =
    options?.environment || (typeof import.meta !== "undefined" && (import.meta as any).env?.MODE) || "production";

  const release =
    options?.release ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SENTRY_RELEASE) ||
    (typeof __SWAPKIT_VERSION__ !== "undefined" ? `@swapkit/ui@${__SWAPKIT_VERSION__}` : "@swapkit/ui");

  const client = new BrowserClient({
    beforeSend(event) {
      return sanitizeEvent(event) as typeof event;
    },
    dsn,
    environment,
    integrations: [
      breadcrumbsIntegration(),
      dedupeIntegration(),
      functionToStringIntegration(),
      globalHandlersIntegration(),
      linkedErrorsIntegration(),
    ],
    release,
    sampleRate: options?.sampleRate ?? 1.0,
    stackParser: defaultStackParser,
    transport: makeFetchTransport,
  });

  const scope = new Scope();
  scope.setClient(client);
  client.init();

  scope.setTag("package", "@swapkit/ui");

  widgetScope = scope;
}

function getScope(): Scope | null {
  if (telemetryDisabled) return null;
  if (!widgetScope) initSentry();
  return widgetScope;
}

const capturedErrors = new WeakMap<Error, Set<string>>();

export function isErrorCaptured(error: unknown, category?: string) {
  if (!(error instanceof Error)) return false;
  const categories = capturedErrors.get(error);
  if (!categories) return false;
  return category ? categories.has(category) : true;
}

export function captureWidgetError(
  error: unknown,
  context: {
    category: "ui" | "api" | "wallet" | "transaction" | "data";
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  },
) {
  if (error instanceof Error) {
    const existing = capturedErrors.get(error);
    if (existing) {
      if (existing.has(context.category)) return;
      existing.add(context.category);
    } else {
      capturedErrors.set(error, new Set([context.category]));
    }
  }

  const scope = getScope();
  if (!scope) return;

  // Fork the scope so per-event tags/extra don't leak into subsequent events
  const eventScope = scope.clone();
  eventScope.setTag("category", context.category);

  if (context.tags) {
    for (const [key, value] of Object.entries(context.tags)) {
      eventScope.setTag(key, value);
    }
  }

  if (context.extra) {
    for (const [key, value] of Object.entries(context.extra)) {
      eventScope.setExtra(key, value);
    }
  }

  eventScope.captureException(error instanceof Error ? error : new Error(String(error)));
}

export function setSentryContext(ctx: {
  walletType?: string;
  connectedChains?: string[];
  currentProvider?: string;
  routeId?: string;
}) {
  const scope = getScope();
  if (!scope) return;

  scope.setContext("swapkit", ctx);

  for (const [key, value] of Object.entries(ctx)) {
    if (value !== undefined) {
      scope.setTag(key, String(value));
    }
  }
}

export function addSentryBreadcrumb(message: string, category: string, data?: Record<string, unknown>) {
  const scope = getScope();
  if (!scope) return;
  scope.addBreadcrumb({ category, data, level: "info", message });
}
