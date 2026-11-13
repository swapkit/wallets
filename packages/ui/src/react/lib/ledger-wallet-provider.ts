import { Chain, SKConfig } from "@swapkit/helpers";
import type {
  ConnectLedgerWalletProviderOptions,
  LedgerWalletProviderEip1193,
} from "@swapkit/wallets/ledger-wallet-provider";

export type LedgerWalletProviderConfig = { apiKey?: string; dAppIdentifier?: string };

function getConnectOptions(provider?: LedgerWalletProviderEip1193): ConnectLedgerWalletProviderOptions {
  const integrations = SKConfig.getState().integrations as
    | Record<string, LedgerWalletProviderConfig | undefined>
    | undefined;
  const config = integrations?.ledgerWalletProvider;

  return {
    hideButton: true,
    ...(config?.apiKey && { apiKey: config.apiKey }),
    ...(config?.dAppIdentifier && { dAppIdentifier: config.dAppIdentifier }),
    ...(provider && { provider }),
  };
}

const LEDGER_WALLET_UI_HOST = "ledger-button-app";
const LEDGER_WALLET_UI_ISOLATED_ATTRIBUTE = "data-swapkit-isolated";
const LEDGER_WALLET_UI_CONTAINED_EVENTS = ["pointerdown", "focusin", "keydown"];

let keepsFocusInsideLedgerWalletUi = false;

function keepFocusInsideLedgerWalletUi(event: FocusEvent) {
  const target = event.relatedTarget as Element | null;
  if (target?.closest?.(LEDGER_WALLET_UI_HOST)) event.stopPropagation();
}

function isolateLedgerWalletUi() {
  const document = globalThis.document;
  if (!document) return;

  if (!keepsFocusInsideLedgerWalletUi) {
    keepsFocusInsideLedgerWalletUi = true;
    document.addEventListener("focusout", keepFocusInsideLedgerWalletUi, true);
  }

  for (const host of document.querySelectorAll(LEDGER_WALLET_UI_HOST)) {
    if (host.hasAttribute(LEDGER_WALLET_UI_ISOLATED_ATTRIBUTE)) continue;

    host.setAttribute(LEDGER_WALLET_UI_ISOLATED_ATTRIBUTE, "");
    host.setAttribute("aria-live", "polite");
    for (const type of LEDGER_WALLET_UI_CONTAINED_EVENTS) {
      host.addEventListener(type, (event) => event.stopPropagation());
    }
  }
}

async function releaseProvider(provider: LedgerWalletProviderEip1193) {
  try {
    await provider.disconnect?.();
  } catch (error) {
    console.warn("[SwapKit] Ledger Wallet disconnect failed:", error);
  }
}

export async function connectWithLedgerWalletProvider(
  chains: Chain[],
  connect: (options: ConnectLedgerWalletProviderOptions) => Promise<unknown>,
) {
  const { initializeLedgerWalletProvider, resolveLedgerWalletProvider } = await import(
    "@swapkit/wallets/ledger-wallet-provider"
  );

  // Solana accounts come through Wallet Standard, so there is no EVM provider to wait for
  if (chains.every((chain) => chain === Chain.Solana)) {
    await initializeLedgerWalletProvider(getConnectOptions());
    isolateLedgerWalletUi();
    await connect(getConnectOptions());
    return;
  }

  const provider = await resolveLedgerWalletProvider(getConnectOptions());
  isolateLedgerWalletUi();

  try {
    await connect(getConnectOptions(provider));
  } catch (error) {
    await releaseProvider(provider);
    throw error;
  }
}
