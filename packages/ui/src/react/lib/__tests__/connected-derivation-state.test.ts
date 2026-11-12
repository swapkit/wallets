import { describe, expect, test } from "bun:test";
import { Chain, type DerivationPathArray, UTXOScriptType } from "@swapkit/helpers";
import type { KeystoreDerivationPathMapOrIndex } from "@swapkit/wallet-keystore";
import { createSwapKitStore } from "../../create-swapkit-store";
import { type ConnectedDerivationState, keystoreDerivationState, walletDerivationState } from "../derivation-presets";

const legacyForcedSegWit = {
  [Chain.Bitcoin]: { derivationPath: [44, 0, 0, 0, 0], scriptType: UTXOScriptType.P2WPKH },
} as unknown as KeystoreDerivationPathMapOrIndex;

function connect(store: ReturnType<typeof createSwapKitStore>, state: ConnectedDerivationState) {
  store.getState().setDerivationPaths(state.derivationPaths);
  store.getState().setForcedScriptTypes(state.forcedScriptTypes);
}

describe("keystoreDerivationState", () => {
  test("writes an entry for every chain being connected, forced or not", () => {
    const state = keystoreDerivationState([Chain.Bitcoin, Chain.Ethereum], 0);

    expect(Object.keys(state.derivationPaths)).toEqual([Chain.Bitcoin, Chain.Ethereum]);
    expect(Object.keys(state.forcedScriptTypes)).toEqual([Chain.Bitcoin, Chain.Ethereum]);
    expect(state.forcedScriptTypes[Chain.Bitcoin]).toBeUndefined();
  });

  test("drops a forced encoding the next connect does not ask for", () => {
    const store = createSwapKitStore();

    connect(store, keystoreDerivationState([Chain.Bitcoin], legacyForcedSegWit));
    expect(store.getState().forcedScriptTypes[Chain.Bitcoin]).toBe(UTXOScriptType.P2WPKH);

    connect(store, keystoreDerivationState([Chain.Bitcoin], 0));
    expect(store.getState().forcedScriptTypes[Chain.Bitcoin]).toBeUndefined();
    expect(store.getState().derivationPaths[Chain.Bitcoin]).toBe("m/84'/0'/0'/0/0");
  });
});

describe("walletDerivationState", () => {
  test("drops the previous connection's path when the chain connects without one", () => {
    const store = createSwapKitStore();

    connect(store, keystoreDerivationState([Chain.Bitcoin], legacyForcedSegWit));

    connect(store, walletDerivationState([Chain.Bitcoin]));
    expect(store.getState().derivationPaths[Chain.Bitcoin]).toBeUndefined();
    expect(store.getState().forcedScriptTypes[Chain.Bitcoin]).toBeUndefined();
  });

  test("records the path a hardware connect does ask for", () => {
    const store = createSwapKitStore();

    connect(store, keystoreDerivationState([Chain.Bitcoin], legacyForcedSegWit));

    connect(store, walletDerivationState([Chain.Bitcoin], [84, 0, 1, 0, 0] as unknown as DerivationPathArray));
    expect(store.getState().derivationPaths[Chain.Bitcoin]).toBe("m/84'/0'/1'/0/0");
    expect(store.getState().forcedScriptTypes[Chain.Bitcoin]).toBeUndefined();
  });

  test("leaves a chain the new connection does not touch alone", () => {
    const store = createSwapKitStore();

    connect(store, keystoreDerivationState([Chain.Bitcoin, Chain.Ethereum], legacyForcedSegWit));

    connect(store, walletDerivationState([Chain.Ethereum]));
    expect(store.getState().forcedScriptTypes[Chain.Bitcoin]).toBe(UTXOScriptType.P2WPKH);
  });
});
