import { registerWalletOption } from "@swapkit/helpers";

declare module "@swapkit/helpers" {
  interface WalletOptionRegistry {
    BITGET_MOBILE: "BITGET_MOBILE";
  }
}

registerWalletOption("BITGET_MOBILE", "BITGET_MOBILE");
