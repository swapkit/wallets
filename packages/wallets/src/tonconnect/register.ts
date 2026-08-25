import { registerWalletOption } from "@swapkit/helpers";

declare module "@swapkit/helpers" {
  interface WalletOptionRegistry {
    TON_CONNECT: "TON_CONNECT";
  }
}

registerWalletOption("TON_CONNECT", "TON_CONNECT");
