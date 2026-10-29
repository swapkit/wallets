import { Chain, SwapKitError, WalletOption } from "@swapkit/helpers";
import { getTonConnectWallet } from "../helpers/tonConnect";

export async function getOneKeyTonWallet() {
  const bridge = window.$onekey?.tonconnect;
  if (!bridge) {
    throw new SwapKitError({ errorKey: "wallet_onekey_not_found", info: { chain: Chain.Ton } });
  }

  return await getTonConnectWallet({
    bridge,
    mainnetOnlyError: () =>
      new SwapKitError({
        errorKey: "wallet_chain_not_supported",
        info: { chain: Chain.Ton, message: "Mainnet only", wallet: WalletOption.ONEKEY },
      }),
    noAccountError: () => new SwapKitError({ errorKey: "wallet_onekey_not_found", info: { chain: Chain.Ton } }),
    wallet: WalletOption.ONEKEY,
  });
}
