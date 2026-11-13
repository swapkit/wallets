import type { Chain, ChainWallet } from "@swapkit/helpers";

export type ConnectedWallet = { address: string; walletType: ChainWallet<Chain>["walletType"] };

type WalletsRecord = Partial<Record<Chain, Pick<ChainWallet<Chain>, "address" | "walletType"> | undefined>>;

export function connectedWalletsKey(wallets: WalletsRecord) {
  return Object.entries(wallets)
    .filter(([, wallet]) => wallet?.address)
    .map(([chain, wallet]) => `${chain}:${wallet?.address}:${wallet?.walletType}`)
    .join(",");
}

export function buildConnectedWallets(wallets: WalletsRecord) {
  const connectedWallets = new Map<Chain, ConnectedWallet>();

  for (const [chain, wallet] of Object.entries(wallets)) {
    if (!wallet?.address) continue;
    connectedWallets.set(chain as Chain, { address: wallet.address, walletType: wallet.walletType });
  }

  return connectedWallets;
}
