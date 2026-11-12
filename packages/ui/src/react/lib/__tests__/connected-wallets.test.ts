import { describe, expect, test } from "bun:test";
import { Chain, WalletOption } from "@swapkit/helpers";

import { buildConnectedWallets, connectedWalletsKey } from "../connected-wallets";

const BTC_ADDRESS = "bc1qexampleaddress";

describe("connected wallets", () => {
  test("switching wallet type on the same chain changes the key and the entry", () => {
    const keystore = { [Chain.Bitcoin]: { address: BTC_ADDRESS, walletType: WalletOption.KEYSTORE } };
    const ledger = { [Chain.Bitcoin]: { address: BTC_ADDRESS, walletType: WalletOption.LEDGER } };

    expect(connectedWalletsKey(keystore)).not.toBe(connectedWalletsKey(ledger));
    expect(buildConnectedWallets(ledger).get(Chain.Bitcoin)).toEqual({
      address: BTC_ADDRESS,
      walletType: WalletOption.LEDGER,
    });
  });

  test("a balance-only change keeps the same key", () => {
    const wallet = { address: BTC_ADDRESS, walletType: WalletOption.KEYSTORE };

    const before = { [Chain.Bitcoin]: { ...wallet, balance: ["0"] } };
    const after = { [Chain.Bitcoin]: { ...wallet, balance: ["1"] } };

    expect(connectedWalletsKey(before)).toBe(connectedWalletsKey(after));
  });

  test("skips wallets without an address", () => {
    const wallets = {
      [Chain.Bitcoin]: { address: BTC_ADDRESS, walletType: WalletOption.KEYSTORE },
      [Chain.Ethereum]: { address: "", walletType: WalletOption.KEYSTORE },
    };

    expect([...buildConnectedWallets(wallets).keys()]).toEqual([Chain.Bitcoin]);
    expect(connectedWalletsKey(wallets)).toBe(`${Chain.Bitcoin}:${BTC_ADDRESS}:${WalletOption.KEYSTORE}`);
  });
});
