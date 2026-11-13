import { describe, expect, test } from "bun:test";

import "./setup-dom";

import { WalletOption } from "@swapkit/helpers";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SwapKitConfigProvider, useWalletsConfig } from "../swapkit-config-context";

function readWalletsConfig(showExperimentalWallets?: boolean) {
  let config: ReturnType<typeof useWalletsConfig> | undefined;
  function Probe() {
    config = useWalletsConfig();
    return null;
  }

  const root = createRoot(document.createElement("div"));
  act(() => {
    root.render(
      <SwapKitConfigProvider showExperimentalWallets={showExperimentalWallets}>
        <Probe />
      </SwapKitConfigProvider>,
    );
  });
  act(() => root.unmount());
  return config as ReturnType<typeof useWalletsConfig>;
}

describe("SwapKitConfigProvider experimental wallets", () => {
  test("hides experimental wallets unless the integrator opts in", () => {
    expect(readWalletsConfig().isWalletAllowed(WalletOption.LEDGER_WALLET_PROVIDER)).toBe(false);

    const optedIn = readWalletsConfig(true);
    expect(optedIn.showExperimental).toBe(true);
    expect(optedIn.isWalletAllowed(WalletOption.LEDGER_WALLET_PROVIDER)).toBe(true);
  });
});
