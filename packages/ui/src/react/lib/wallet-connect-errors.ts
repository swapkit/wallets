const WALLET_CONNECT_ERROR_DESCRIPTIONS: Readonly<Record<string, string>> = {
  core_transaction_user_rejected: "The connection was rejected in your wallet.",
  wallet_connection_rejected_by_user: "The connection was rejected in your wallet.",
  wallet_ledger_wallet_provider_no_accounts:
    "No account selected. Approve the connection on your Ledger and pick an account.",
  wallet_ledger_wallet_provider_not_announced: "This browser can't talk to Ledger",
  wallet_ledger_wallet_provider_unsupported_platform: "Ledger Wallet is only available in a browser.",
  wallet_provider_not_found: "Wallet extension not found. Install it or enable it for this site and try again.",
  wallet_tronlink_locked: "TronLink is locked. Open the extension, unlock it and try again.",
  wallet_tronlink_request_accounts_failed:
    "TronLink did not grant access. Unlock the extension and approve the connection for this site.",
};

function getErrorKey(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const key = (error as { errorKey?: unknown }).errorKey;
  return typeof key === "string" ? key : undefined;
}

// Walks the cause chain so the SDK error survives the wrapping done in the connect flow.
export function getWalletConnectErrorDescription(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const key = getErrorKey(current);
    if (key && key in WALLET_CONNECT_ERROR_DESCRIPTIONS) return WALLET_CONNECT_ERROR_DESCRIPTIONS[key];
    current = (current as { cause?: unknown }).cause;
  }

  return undefined;
}
