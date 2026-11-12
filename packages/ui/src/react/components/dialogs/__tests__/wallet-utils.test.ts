import { describe, expect, test } from "bun:test";

import { Chain, WalletOption } from "@swapkit/helpers";
import {
  getAvailableFamilies,
  getChainFamilies,
  getChainFamily,
  getConflictingLedgerWallet,
  getConnectedLedgerWalletFamilies,
  sortSupportedWalletsFirst,
  walletSupportsChains,
} from "../wallet-utils";

describe("sortSupportedWalletsFirst", () => {
  test("lists wallets supporting the selected chains first, keeping order within each half", () => {
    const chains: Partial<Record<WalletOption, Chain[]>> = {
      [WalletOption.BITGET]: [Chain.Bitcoin, Chain.Ethereum],
      [WalletOption.BRAVE]: [Chain.Ethereum],
      [WalletOption.KEEPKEY]: [Chain.Bitcoin],
      [WalletOption.METAMASK]: [Chain.Ethereum],
    };
    const wallets = [WalletOption.BRAVE, WalletOption.BITGET, WalletOption.METAMASK, WalletOption.KEEPKEY];

    const sorted = sortSupportedWalletsFirst(wallets, (w) => walletSupportsChains(chains[w] ?? [], [Chain.Bitcoin]));

    expect(sorted).toEqual([WalletOption.BITGET, WalletOption.KEEPKEY, WalletOption.BRAVE, WalletOption.METAMASK]);
  });

  test("keeps the original order when no chain is selected", () => {
    const wallets = [WalletOption.BRAVE, WalletOption.BITGET];

    expect(sortSupportedWalletsFirst(wallets, () => walletSupportsChains([], []))).toEqual(wallets);
  });
});

describe("getConflictingLedgerWallet", () => {
  test("blocks the direct Ledger connection while Ledger Wallet is connected", () => {
    const connected = [{ walletType: WalletOption.LEDGER_WALLET_PROVIDER }];

    expect(getConflictingLedgerWallet(WalletOption.LEDGER, connected)).toBe(WalletOption.LEDGER_WALLET_PROVIDER);
  });

  test("blocks Ledger Wallet while the direct Ledger connection is connected", () => {
    const connected = [{ walletType: WalletOption.METAMASK }, { walletType: WalletOption.LEDGER }];

    expect(getConflictingLedgerWallet(WalletOption.LEDGER_WALLET_PROVIDER, connected)).toBe(WalletOption.LEDGER);
  });

  test("leaves the Ledger options alone when the other one is not connected", () => {
    const connected = [{ walletType: WalletOption.LEDGER }, { walletType: WalletOption.PHANTOM }];

    expect(getConflictingLedgerWallet(WalletOption.LEDGER, connected)).toBeUndefined();
    expect(getConflictingLedgerWallet(WalletOption.LEDGER_WALLET_PROVIDER, [])).toBeUndefined();
  });

  test("never blocks other wallets", () => {
    const connected = [{ walletType: WalletOption.LEDGER }, { walletType: WalletOption.LEDGER_WALLET_PROVIDER }];

    expect(getConflictingLedgerWallet(WalletOption.TREZOR, connected)).toBeUndefined();
  });
});

describe("wallet family select", () => {
  test("splits Solana from the EVM networks", () => {
    expect(getChainFamily(Chain.Solana)).toBe("solana");
    expect(getChainFamily(Chain.Ethereum)).toBe("evm");
    expect(getChainFamily(Chain.Base)).toBe("evm");
  });

  test("lists each family once", () => {
    expect(getChainFamilies([Chain.Ethereum, Chain.Base, Chain.Solana])).toEqual(["evm", "solana"]);
    expect(getChainFamilies([Chain.Ethereum, Chain.Base])).toEqual(["evm"]);
    expect(getChainFamilies([Chain.Solana])).toEqual(["solana"]);
  });

  test("only counts chains connected through Ledger Wallet", () => {
    expect(
      getConnectedLedgerWalletFamilies([
        { chain: Chain.Ethereum, walletType: WalletOption.LEDGER_WALLET_PROVIDER },
        { chain: Chain.Base, walletType: WalletOption.LEDGER_WALLET_PROVIDER },
        { chain: Chain.Solana, walletType: WalletOption.PHANTOM },
      ]),
    ).toEqual(["evm"]);
    expect(getConnectedLedgerWalletFamilies([{ chain: Chain.Ethereum, walletType: WalletOption.METAMASK }])).toEqual(
      [],
    );
  });

  test("leaves out families already connected", () => {
    const chains = [Chain.Ethereum, Chain.Base, Chain.Solana];

    expect(getAvailableFamilies(chains, [])).toEqual(["evm", "solana"]);
    expect(getAvailableFamilies(chains, ["evm"])).toEqual(["solana"]);
    expect(getAvailableFamilies(chains, ["evm", "solana"])).toEqual([]);
    expect(getAvailableFamilies([Chain.Ethereum, Chain.Base], ["evm"])).toEqual([]);
  });
});
