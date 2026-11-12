import { registerErrorCodes, registerWalletOption } from "@swapkit/helpers";

declare module "@swapkit/helpers" {
  interface WalletOptionRegistry {
    CIP30: "CIP30";
  }
  interface SwapKitErrorRegistry {
    wallet_cip30_not_found: 80301;
    wallet_cip30_network_not_supported: 80302;
  }
}

registerWalletOption("CIP30", "CIP30");
registerErrorCodes({ wallet_cip30_network_not_supported: 80302, wallet_cip30_not_found: 80301 });
