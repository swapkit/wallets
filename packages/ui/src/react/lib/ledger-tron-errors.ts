import { Chain } from "@swapkit/helpers";

// Status word the Ledger Tron app returns when its "Allow data" setting is off (app-tron src/app_errors.h).
const TRON_DATA_NOT_ALLOWED_STATUS_WORD = "6a8b";

export const LEDGER_TRON_ALLOW_DATA_MESSAGE =
  "Open the Tron app on your Ledger, go to Settings, enable 'Allow data' and try again.";

function statusWordOf(error: object) {
  const info = (error as { info?: { statusWord?: unknown } }).info;
  return typeof info?.statusWord === "string" ? info.statusWord.toLowerCase() : undefined;
}

// Status words are app specific, so this only holds when the swap is signed by the Tron app.
export function isLedgerTronDataNotAllowedError(error: unknown, chain: Chain | undefined) {
  if (chain !== Chain.Tron) return false;

  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (statusWordOf(current) === TRON_DATA_NOT_ALLOWED_STATUS_WORD) return true;
    const { cause, error: wrapped } = current as { cause?: unknown; error?: unknown };
    current = cause ?? wrapped;
  }

  return false;
}
