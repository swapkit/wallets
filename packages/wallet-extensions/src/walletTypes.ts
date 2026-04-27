import type { Chain, WalletOption } from "@swapkit/helpers";
import { createWallet } from "@swapkit/wallet-core";

export type ExtensionWallet<
  Name extends string,
  SupportedChains extends Chain[] = Chain[],
  ConnectParams extends unknown[] = [chains: Chain[]],
> = ReturnType<typeof createWallet<ConnectParams, SupportedChains, Name, WalletOption>>;
