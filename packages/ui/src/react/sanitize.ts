const SENSITIVE_SUBSTRINGS = [
  "password",
  "secret",
  "privatekey",
  "mnemonic",
  "passphrase",
  "seed",
  "apikey",
  "authtoken",
  "accesstoken",
  "secretkey",
];

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase().replace(/[_-]/g, "");
  return SENSITIVE_SUBSTRINGS.some((s) => normalized.includes(s));
}
const SAFE_HEX_FIELDS = new Set(["txHash", "hash", "transactionHash", "txId", "blockHash"]);
const HEX_64_PATTERN = /(?:0x)?[a-fA-F0-9]{64}\b/;
const SEED_PHRASE_PATTERN = /\b(?:[a-z]+\s){11,23}[a-z]+\b/;
const BIP39_MAX_WORD_LENGTH = 8;

function isSeedPhraseCandidate(matched: string) {
  return matched.split(/\s+/).every((word) => word.length >= 3 && word.length <= BIP39_MAX_WORD_LENGTH);
}

function scrubString(value: string) {
  if (HEX_64_PATTERN.test(value)) {
    return value.replace(/(?:0x)?[a-fA-F0-9]{64}/g, "[REDACTED]");
  }
  if (SEED_PHRASE_PATTERN.test(value)) {
    return value.replace(/\b(?:[a-z]+\s){11,23}[a-z]+\b/g, (match) =>
      isSeedPhraseCandidate(match) ? "[REDACTED]" : match,
    );
  }
  return value;
}

function scrubArray(arr: unknown[], stripSensitiveKeys: boolean): unknown[] {
  return arr.map((item) => {
    if (typeof item === "string") return scrubString(item);
    if (Array.isArray(item)) return scrubArray(item, stripSensitiveKeys);
    if (item && typeof item === "object") return scrubRecord(item as Record<string, unknown>, stripSensitiveKeys);
    return item;
  });
}

function scrubRecord(record: Record<string, unknown>, stripSensitiveKeys: boolean): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (stripSensitiveKeys && isSensitiveKey(key)) {
      continue;
    }

    if (typeof value === "string") {
      result[key] = SAFE_HEX_FIELDS.has(key) ? value : scrubString(value);
    } else if (Array.isArray(value)) {
      result[key] = scrubArray(value, stripSensitiveKeys);
    } else if (value && typeof value === "object") {
      result[key] = scrubRecord(value as Record<string, unknown>, stripSensitiveKeys);
    } else {
      result[key] = value;
    }
  }

  return result;
}

export function sanitizeEvent<
  T extends {
    breadcrumbs?: Array<{ data?: Record<string, unknown> }>;
    contexts?: Record<string, Record<string, unknown> | undefined>;
    exception?: { values?: Array<{ value?: string }> };
    extra?: Record<string, unknown>;
    message?: string;
    tags?: Record<string, unknown>;
  },
>(event: T) {
  if (event.exception?.values) {
    for (const exValue of event.exception.values) {
      if (typeof exValue.value === "string") {
        exValue.value = scrubString(exValue.value);
      }
    }
  }

  if (typeof event.message === "string") {
    event.message = scrubString(event.message);
  }

  if (event.extra) {
    event.extra = scrubRecord(event.extra as Record<string, unknown>, true);
  }

  if (event.contexts) {
    for (const [contextKey, contextValue] of Object.entries(event.contexts)) {
      if (contextValue && typeof contextValue === "object") {
        event.contexts[contextKey] = scrubRecord(contextValue as Record<string, unknown>, true);
      }
    }
  }

  if (event.tags) {
    event.tags = scrubRecord(event.tags as Record<string, unknown>, true);
  }

  if (event.breadcrumbs) {
    for (const breadcrumb of event.breadcrumbs) {
      if (breadcrumb.data && typeof breadcrumb.data === "object") {
        breadcrumb.data = scrubRecord(breadcrumb.data as Record<string, unknown>, true);
      }
    }
  }

  return event;
}
