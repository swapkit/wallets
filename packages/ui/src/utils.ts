import { type SKConfigState, SwapKitError, type WalletOption } from "@swapkit/helpers";
import type { PluginName } from "@swapkit/plugins";
import type { LoadedPlugins, LoadedWallet, SwapKitInstance } from "./swapkit-types";

export async function getSkClient<W extends WalletOption, P extends PluginName[]>({
  walletOption,
  pluginNames,
}: {
  walletOption: W;
  pluginNames: P;
}): Promise<{ client: SwapKitInstance<LoadedPlugins<P>, LoadedWallet>; connectMethod: string }> {
  const { loadWallet } = await import("@swapkit/wallets");
  const { SwapKit } = await import("@swapkit/core");
  const connectedPlugins = await loadPlugins(pluginNames);
  const walletPkg = (await loadWallet(walletOption)) as LoadedWallet;
  const connectMethod = Object.keys(walletPkg).find((key) => key.startsWith("connect"));
  if (!connectMethod) {
    throw new SwapKitError("core_wallet_connection_not_found", { walletOption });
  }

  return {
    client: SwapKit({ plugins: connectedPlugins, wallets: { ...walletPkg } }) as SwapKitInstance<
      LoadedPlugins<P>,
      LoadedWallet
    >,
    connectMethod,
  };
}

export async function loadPlugins<P extends PluginName[]>(pluginNames: P): Promise<LoadedPlugins<P>> {
  let connectedPlugins = {} as LoadedPlugins<P>;
  const { loadPlugin } = await import("@swapkit/plugins");

  if (pluginNames?.length) {
    for (const pluginName of pluginNames) {
      const plugin = await loadPlugin(pluginName);
      connectedPlugins = { ...connectedPlugins, ...plugin };
    }
  }

  return connectedPlugins;
}

export const getStableConfigMemoKey = (config: SKConfigState | undefined) => {
  if (!config) return null;

  try {
    return JSON.stringify(config);
  } catch (error) {
    console.error("Failed to get stable config memo key:", error);
    return null;
  }
};
