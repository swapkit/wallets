import { describe, expect, test } from "bun:test";
import {
  ACCOUNT_INDEXED_CHAINS,
  Chain,
  type DerivationPathArray,
  NetworkDerivationPath,
  type UpdatableDerivationPath,
  updateDerivationPath,
} from "@swapkit/helpers";
import { createKeystoreWallet, KEYSTORE_SUPPORTED_CHAINS } from "@swapkit/wallet-keystore";
import { buildKeystoreDerivation, connectorDefaultPath, type DerivationSettings } from "../derivation-presets";

const PHRASE = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

function createKeystoreWalletPath(chain: Chain, index: number) {
  const trimmed = (NetworkDerivationPath[chain] as readonly number[]).slice(
    0,
    chain === Chain.Solana || chain === Chain.Aleo ? 4 : 5,
  ) as unknown as UpdatableDerivationPath;

  return updateDerivationPath(trimmed, ACCOUNT_INDEXED_CHAINS.includes(chain) ? { account: index } : { index });
}

function pathsAt(index: number, pathFor: (chain: Chain, index: number) => DerivationPathArray) {
  return Object.fromEntries(KEYSTORE_SUPPORTED_CHAINS.map((chain) => [chain, pathFor(chain, index)]));
}

function settingsAt(chain: Chain, index: number): DerivationSettings {
  return { accountIndex: index, overrides: { [chain]: { customPath: "", index, standard: "default" } } };
}

async function addressAt(chain: Chain, derivation: number | DerivationSettings) {
  const wallets = await createKeystoreWallet({
    chains: [chain],
    derivationPathMapOrIndex:
      typeof derivation === "number" ? derivation : (buildKeystoreDerivation([chain], derivation) as never),
    phrase: PHRASE,
  });

  return wallets[chain]?.address;
}

describe("the path the widget sends for a wallet index", () => {
  test("matches the one createKeystoreWallet derives, on every keystore chain", () => {
    for (const index of [0, 1, 7]) {
      expect(pathsAt(index, connectorDefaultPath)).toEqual(pathsAt(index, createKeystoreWalletPath));
    }
  });

  test("moves the account slot on the account-indexed chains", () => {
    expect(connectorDefaultPath(Chain.Near, 2)).toEqual([44, 397, 2, 0, 0] as unknown as DerivationPathArray);
    expect(connectorDefaultPath(Chain.Stellar, 2)).toEqual([44, 148, 2, 0, 0] as unknown as DerivationPathArray);
    expect(connectorDefaultPath(Chain.Sui, 2)).toEqual([44, 784, 2, 0, 0] as unknown as DerivationPathArray);
  });

  test("moves the address slot everywhere else", () => {
    expect(connectorDefaultPath(Chain.Ethereum, 2)).toEqual([44, 60, 0, 0, 2] as unknown as DerivationPathArray);
    expect(connectorDefaultPath(Chain.Bitcoin, 2)).toEqual([84, 0, 0, 0, 2] as unknown as DerivationPathArray);
  });

  test("keeps the four-level shape on the chains the connector trims", () => {
    expect(connectorDefaultPath(Chain.Solana, 2)).toEqual([44, 501, 0, 2] as unknown as DerivationPathArray);
    expect(connectorDefaultPath(Chain.Aleo, 2)).toEqual([44, 683, 0, 2] as unknown as DerivationPathArray);
  });
});

describe("an account-indexed chain given a per-chain override", () => {
  test("derives the wallet the SDK derives for the same wallet index", async () => {
    for (const chain of [Chain.Near, Chain.Stellar, Chain.Sui]) {
      const [overridden, indexed] = await Promise.all([addressAt(chain, settingsAt(chain, 2)), addressAt(chain, 2)]);

      expect([chain, overridden]).toEqual([chain, indexed as string]);
      expect(overridden).toBeTruthy();
    }
  });
});
