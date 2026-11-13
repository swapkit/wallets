import type { SwapKit } from "@swapkit/core";
import type { WalletOption } from "@swapkit/helpers";
import type { createPlugin, loadDefaultPlugins, PluginName, SKPlugins } from "@swapkit/plugins";
import type { SKWallets } from "@swapkit/wallets";

type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (value: infer I) => void
  ? I
  : never;

export type LoadedWallet = SKWallets[keyof SKWallets];

export type LoadedWalletsCache = Partial<SKWallets> & Partial<Record<WalletOption, LoadedWallet>>;

export type LoadedWallets = UnionToIntersection<LoadedWallet>;

export type LoadedPlugins<P extends readonly PluginName[]> = Pick<SKPlugins, Extract<P[number], keyof SKPlugins>>;

export type DefaultPlugins = Awaited<ReturnType<typeof loadDefaultPlugins>>;

export type SwapKitInstance<Plugins extends ReturnType<typeof createPlugin>, Wallets extends LoadedWallet> = ReturnType<
  typeof SwapKit<Plugins, Wallets>
>;

export type SwapKitClient = SwapKitInstance<DefaultPlugins, LoadedWallets>;
