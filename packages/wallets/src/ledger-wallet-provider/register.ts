import { registerErrorCodes, registerWalletOption } from "@swapkit/helpers";

declare module "@swapkit/helpers" {
  interface WalletOptionRegistry {
    LEDGER_WALLET_PROVIDER: "LEDGER_WALLET_PROVIDER";
  }
  interface SwapKitErrorRegistry {
    wallet_ledger_wallet_provider_not_announced: 80201;
    wallet_ledger_wallet_provider_unsupported_platform: 80202;
    wallet_ledger_wallet_provider_no_accounts: 80203;
  }
}

registerWalletOption("LEDGER_WALLET_PROVIDER", "LEDGER_WALLET_PROVIDER");
registerErrorCodes({
  wallet_ledger_wallet_provider_no_accounts: 80203,
  wallet_ledger_wallet_provider_not_announced: 80201,
  wallet_ledger_wallet_provider_unsupported_platform: 80202,
});
