import { registerErrorCodes, registerWalletOption } from "@swapkit/helpers";

declare module "@swapkit/helpers" {
  interface WalletOptionRegistry {
    NOIR_WALLET: "NOIR_WALLET";
  }
  interface SwapKitErrorRegistry {
    wallet_noir_wallet_not_found: 80101;
    wallet_noir_wallet_connection_failed: 80102;
    wallet_noir_wallet_memo_not_supported: 80103;
  }
}

registerWalletOption("NOIR_WALLET", "NOIR_WALLET");
registerErrorCodes({
  wallet_noir_wallet_connection_failed: 80102,
  wallet_noir_wallet_memo_not_supported: 80103,
  wallet_noir_wallet_not_found: 80101,
});
