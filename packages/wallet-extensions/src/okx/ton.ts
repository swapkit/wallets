import { Chain, SwapKitError } from "@swapkit/helpers";
import { getTonConnectWallet } from "../helpers/tonConnect";

export async function getOkxTonWallet() {
  const bridge = window.okxTonWallet?.tonconnect;
  if (!bridge) {
    throw new SwapKitError("wallet_okx_not_found", { chain: Chain.Ton });
  }

  return await getTonConnectWallet({
    bridge,
    mainnetOnlyError: () =>
      new SwapKitError("wallet_okx_chain_not_supported", { chain: Chain.Ton, message: "Mainnet only" }),
    noAccountError: () => new SwapKitError("wallet_okx_no_accounts", { chain: Chain.Ton }),
    wallet: "OKX",
  });
}
