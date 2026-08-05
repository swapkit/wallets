import { SwapKitError } from "@swapkit/helpers";
import type { TONTransactionInput } from "@swapkit/toolboxes/ton";
// Type-only: @tonconnect/ui's module init requires localStorage/DOM, so every
// value import from it must stay behind a dynamic import (SSR/node consumers
// and the bun test runner crash on an eager load).
import type { Account, CHAIN, TonConnectUI } from "@tonconnect/ui";
import type { TonConnectConfig } from "./types";

const DEFAULT_VALID_SECONDS = 300;
// SendMode.CARRY_ALL_REMAINING_BALANCE — cannot be expressed over TON Connect,
// where the wallet chooses the send mode (typically PAY_GAS_SEPARATELY + IGNORE_ERRORS).
const CARRY_ALL_REMAINING_BALANCE = 128;
// CHAIN.MAINNET from @tonconnect/protocol; inlined so this module never loads
// @tonconnect/ui at evaluation time.
const TON_MAINNET = "-239" as CHAIN.MAINNET;

let sharedInstance: TonConnectUI | undefined;

export async function getTonConnectInstance(config: TonConnectConfig = {}): Promise<TonConnectUI> {
  if (config.instance) {
    // Remember injected instances (e.g. from @tonconnect/ui-react) so later
    // config-less calls reuse them instead of demanding a manifestUrl.
    sharedInstance = config.instance;
    return config.instance;
  }
  if (sharedInstance) return sharedInstance;

  if (!config.manifestUrl) {
    throw new SwapKitError("wallet_missing_params", { param: "manifestUrl", wallet: "TON Connect" });
  }

  const { TonConnectUI } = await import("@tonconnect/ui");
  const tonConnectUI = new TonConnectUI({ manifestUrl: config.manifestUrl, ...config.uiOptions });

  try {
    // Abort connections coming from a non-mainnet wallet early. Only possible
    // before a connection is established, hence the try/catch around restore races.
    tonConnectUI.setConnectionNetwork(TON_MAINNET);
  } catch {
    // A session was already restored — the network is validated in connectTonConnect instead.
  }

  sharedInstance = tonConnectUI;
  return tonConnectUI;
}

export async function connectTonConnect(tonConnectUI: TonConnectUI): Promise<string> {
  await tonConnectUI.connectionRestored;

  const account =
    tonConnectUI.connected && tonConnectUI.account
      ? tonConnectUI.account
      : await new Promise<Account>((resolve, reject) => {
          const unsubscribeModal = tonConnectUI.onModalStateChange((state) => {
            if (state.status === "closed" && state.closeReason === "action-cancelled") {
              cleanup();
              reject(new SwapKitError("wallet_connection_rejected_by_user", { wallet: "TON Connect" }));
            }
          });

          const unsubscribeStatus = tonConnectUI.onStatusChange(
            (wallet) => {
              if (wallet) {
                cleanup();
                resolve(wallet.account);
              }
            },
            (error) => {
              cleanup();
              reject(new SwapKitError("core_wallet_connection_failed", { error, wallet: "TON Connect" }));
            },
          );

          function cleanup() {
            unsubscribeStatus();
            unsubscribeModal();
          }

          tonConnectUI.openModal().catch((error) => {
            cleanup();
            reject(new SwapKitError("core_wallet_connection_failed", { error, wallet: "TON Connect" }));
          });
        });

  if (account.chain !== TON_MAINNET) {
    await tonConnectUI.disconnect().catch(() => undefined);
    throw new SwapKitError("wallet_chain_not_supported", { chain: account.chain, wallet: "TON Connect" });
  }

  // TON Connect exposes the address in raw `<workchain>:<hex>` form;
  // convert to the user-friendly non-bounceable base64url form (UQ…) —
  // wallet (account) addresses are non-bounceable by TEP-2 convention.
  const { Address } = await import("@ton/core");
  return Address.parse(account.address).toString({ bounceable: false, urlSafe: true });
}

// TON Connect wallets reject raw `0:<hex>` destinations — normalize to TEP-2 friendly form.
// The bounce flag travels inside the friendly address, so the conversion must preserve the
// TON toolbox's convention (raw-form destinations default to bounceable=true, refunding
// failed contract sends). @tonconnect/sdk's toUserFriendlyAddress can only emit the
// non-bounceable form and must not be used here; already-friendly addresses keep the
// caller's explicit flag untouched.
export function toFriendlyDestination(address: string, AddressCtor: typeof import("@ton/core").Address) {
  return AddressCtor.isFriendly(address)
    ? address
    : AddressCtor.parse(address).toString({ bounceable: true, urlSafe: true });
}

export async function sendTonConnectTransaction({
  tonConnectUI,
  transaction,
  validSeconds = DEFAULT_VALID_SECONDS,
}: {
  tonConnectUI: TonConnectUI;
  transaction: TONTransactionInput;
  validSeconds?: number;
}): Promise<string> {
  const messages = Array.isArray(transaction) ? transaction : transaction.messages;
  // The legacy bare-array shape carries sendMode per message (the toolbox reads
  // messages[0].sendMode the same way) — the sweep guard must see it too.
  const sendMode = Array.isArray(transaction) ? transaction[0]?.sendMode : transaction.sendMode;

  if (!messages.length) {
    throw new SwapKitError("wallet_missing_params", { param: "messages", wallet: "TON Connect" });
  }

  if (sendMode !== undefined && (sendMode & CARRY_ALL_REMAINING_BALANCE) !== 0) {
    throw new SwapKitError({
      errorKey: "core_swap_invalid_params",
      info: { reason: "TON Connect does not support sweep (CARRY_ALL_REMAINING_BALANCE) transactions", sendMode },
    });
  }

  if (!tonConnectUI.connected) {
    throw new SwapKitError("core_wallet_connection_not_found");
  }

  const { Address, Cell } = await import("@ton/core");

  const { boc } = await tonConnectUI.sendTransaction({
    messages: messages.map(({ address, amount, payload, stateInit }) => ({
      address: toFriendlyDestination(address, Address),
      amount,
      payload,
      stateInit,
    })),
    network: TON_MAINNET,
    validUntil: Math.floor(Date.now() / 1000) + validSeconds,
  });

  // Same hash the TON toolbox returns from broadcastTransaction:
  // the hash of the signed external message cell.
  return Cell.fromBase64(boc).hash().toString("hex");
}
