import { describe, expect, test } from "bun:test";
import { Chain, type LimitOrderCancelBuildResponse, ProviderName, SwapKitError } from "@swapkit/helpers";
import { SwapKitPlugin } from "@swapkit/plugins/swapkit";

import {
  classifyCancelBuild,
  classifyCancelError,
  getCancelGate,
  getCancelVariant,
  getInitialCancelState,
  getRacedOutcome,
  INITIAL_CANCEL_STATE,
  type LimitCancelState,
  limitCancelReducer,
  needsCancelSignature,
} from "../cancel";
import { makeOrder } from "./fixtures";

const BTC_ADDRESS = "bc1qmakeraddress";
const USDC = "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48";

const CANCEL_TX = { chainId: 1, data: "0xdead", from: "0xMaker", to: "0xrouter", value: "0" };

const TYPED_DATA = {
  domain: { name: "Harbor", version: "1" },
  message: {
    action: "cancel_and_withdraw",
    chain: "ethereum",
    expiry: 1,
    l1Address: "0xmaker",
    nonce: 1,
    payload: { orderId: "order-1" },
  },
  primaryType: "CancelAndWithdraw",
  types: { CancelAndWithdraw: [], CancelAndWithdrawPayload: [], EIP712Domain: [] },
} as unknown as NonNullable<LimitOrderCancelBuildResponse["typedData"]>;

function makeBuild(overrides: Partial<LimitOrderCancelBuildResponse> = {}): LimitOrderCancelBuildResponse {
  return {
    btcSignaturePreimage: null,
    cancelTx: null,
    nextActions: [],
    orderId: "order-1",
    typedData: null,
    ...overrides,
  };
}

function walletCanSignCancel(order: ReturnType<typeof makeOrder>, wallet: Record<string, unknown>) {
  return SwapKitPlugin.swapkit({ getWallet: () => wallet } as never).limitOrderCanCancel({ order });
}

function gate(overrides: Partial<Parameters<typeof getCancelGate>[0]> = {}) {
  return getCancelGate({
    cancelPhase: undefined,
    canSignCancel: true,
    connectedAddress: "0xmaker",
    isFresh: true,
    order: makeOrder({ maker: "0xMaker" }),
    ...overrides,
  });
}

describe("classifyCancelBuild", () => {
  test("dispatches on the artifact the build carries", () => {
    expect(classifyCancelBuild(makeBuild({ cancelTx: CANCEL_TX }))).toBe("evmTx");
    expect(classifyCancelBuild(makeBuild({ typedData: TYPED_DATA }))).toBe("typedData");
    expect(classifyCancelBuild(makeBuild({ btcSignaturePreimage: "preimage" }))).toBe("btcMessage");
    expect(classifyCancelBuild(makeBuild())).toBe("none");
  });

  test("only the no-artifact shape skips the signature", () => {
    expect(needsCancelSignature("none")).toBe(false);
    expect(needsCancelSignature("evmTx")).toBe(true);
    expect(needsCancelSignature("typedData")).toBe(true);
  });
});

describe("getCancelVariant", () => {
  test("1inch ERC-20 resting order costs gas", () => {
    expect(getCancelVariant(makeOrder({ sellAsset: USDC }), "evmTx")).toBe("inWallet");
  });

  test("native 1inch sell is a refund", () => {
    expect(getCancelVariant(makeOrder({ sellAsset: "ETH.ETH" }), "evmTx")).toBe("escrowed");
  });

  test("Harbor typed data and NEAR without artifact are free returns", () => {
    expect(getCancelVariant(makeOrder({ provider: ProviderName.HARBOR }), "typedData")).toBe("deposited");
    expect(getCancelVariant(makeOrder({ provider: ProviderName.NEAR }), "none")).toBe("deposited");
  });

  test("fills win over the shape", () => {
    const partial = makeOrder({ filledBuyAmount: "1060", filledSellAmount: "0.4", status: "PARTIAL" });
    expect(getCancelVariant(partial, "evmTx")).toBe("partiallyFilled");
    expect(getCancelVariant(partial, "none")).toBe("partiallyFilled");
  });
});

describe("getCancelGate", () => {
  test("ready when fresh, maker connected and the wallet can sign the cancel", () => {
    expect(gate()).toEqual({ kind: "ready" });
  });

  test("not fresh keeps the button waiting", () => {
    expect(gate({ isFresh: false })).toEqual({ kind: "stale" });
  });

  test("EVM maker match is case-insensitive", () => {
    expect(gate({ connectedAddress: "0xMAKER" })).toEqual({ kind: "ready" });
    expect(gate({ connectedAddress: "0xother" })).toEqual({ kind: "wallet", reason: "wrongWallet" });
  });

  test("non-EVM maker match is exact", () => {
    const order = makeOrder({ maker: BTC_ADDRESS, provider: ProviderName.NEAR, sellAsset: "BTC.BTC" });
    expect(gate({ connectedAddress: BTC_ADDRESS, order })).toEqual({ kind: "ready" });
    expect(gate({ connectedAddress: BTC_ADDRESS.toUpperCase(), order })).toEqual({
      kind: "wallet",
      reason: "wrongWallet",
    });
  });

  test("no wallet on the sell chain asks to connect", () => {
    expect(gate({ connectedAddress: null })).toEqual({ kind: "wallet", reason: "noWallet" });
  });

  test("a wallet that cannot sign the cancel is blocked", () => {
    expect(gate({ canSignCancel: false })).toEqual({ kind: "wallet", reason: "cannotSignCancel" });
  });

  test("a NEAR cancel needs no signature, so any wallet of the maker is enough", () => {
    const order = makeOrder({ maker: BTC_ADDRESS, provider: ProviderName.NEAR, sellAsset: "BTC.BTC" });
    const canSignCancel = walletCanSignCancel(order, { chain: Chain.Bitcoin, signing: { direct: false } });
    expect(gate({ canSignCancel, connectedAddress: BTC_ADDRESS, order })).toEqual({ kind: "ready" });
  });

  test("a Harbor Bitcoin cancel needs a wallet that signs Bitcoin messages", () => {
    const order = makeOrder({ maker: BTC_ADDRESS, provider: ProviderName.HARBOR, sellAsset: "BTC.BTC" });
    const canSignCancel = walletCanSignCancel(order, { chain: Chain.Bitcoin, signing: {}, signMessage: () => "" });
    expect(gate({ canSignCancel, connectedAddress: BTC_ADDRESS, order })).toEqual({
      kind: "wallet",
      reason: "cannotSignCancel",
    });
  });

  test("nothing to offer once a cancel is requested, in flight or the order is terminal", () => {
    expect(gate({ order: makeOrder({ cancelRequestedAt: "2026-10-01T11:00:00.000Z", maker: "0xmaker" }) })).toEqual({
      kind: "none",
    });
    expect(gate({ cancelPhase: "signing" })).toEqual({ kind: "none" });
    expect(gate({ cancelPhase: "submitting" })).toEqual({ kind: "none" });
    expect(gate({ order: makeOrder({ maker: "0xmaker", status: "FILLED" }) })).toEqual({ kind: "none" });
    expect(gate({ order: makeOrder({ maker: "0xmaker", status: "PENDING" }) })).toEqual({ kind: "none" });
  });

  test("a failed submit offers to resume, even without the signing wallet", () => {
    expect(gate({ cancelPhase: "submitFailed", connectedAddress: null, isFresh: false })).toEqual({ kind: "resume" });
    expect(
      gate({
        cancelPhase: "submitFailed",
        order: makeOrder({ cancelRequestedAt: "2026-10-01T11:00:00.000Z", maker: "0xmaker" }),
      }),
    ).toEqual({ kind: "none" });
  });
});

describe("classifyCancelError", () => {
  test("409 limitOrderInvalidState is a race, not a failure", () => {
    const error = new SwapKitError(
      { errorKey: "limitOrderInvalidState" as never, info: { status: 409 } },
      { status: 409 },
    );
    expect(classifyCancelError(error)).toBe("invalidState");
  });

  test("wallet rejection", () => {
    expect(classifyCancelError({ code: 4001, message: "User rejected the request." })).toBe("rejected");
  });

  test("503 means the action is switched off", () => {
    const error = new SwapKitError({ errorKey: "limitOrderActionUnavailable" as never }, { status: 503 });
    expect(classifyCancelError(error)).toBe("unavailable");
  });

  test("plugin shape and wallet errors", () => {
    expect(classifyCancelError(new SwapKitError("plugin_swapkit_limit_order_unsupported_cancel_shape" as never))).toBe(
      "unsupportedShape",
    );
    expect(classifyCancelError(new SwapKitError("plugin_swapkit_limit_order_wallet_cannot_sign" as never))).toBe(
      "walletCannotSign",
    );
    expect(classifyCancelError(new Error("boom"))).toBe("failed");
  });
});

describe("getRacedOutcome", () => {
  test("filled reports what was received", () => {
    const outcome = getRacedOutcome(makeOrder({ filledBuyAmount: "2650", filledSellAmount: "1", status: "FILLED" }));
    expect(outcome.title).toBe("Too late — it filled");
    expect(outcome.body).toContain("You received 2,650 USDC.");
  });

  test("other terminal statuses use the status line", () => {
    expect(getRacedOutcome(makeOrder({ status: "CANCELLED" }))).toEqual({
      body: "Cancelled · nothing filled",
      title: "Already cancelled",
    });
    expect(getRacedOutcome(makeOrder({ status: "EXPIRED" })).title).toBe("It already expired");
    expect(getRacedOutcome(null).title).toBe("It can no longer be cancelled");
  });
});

describe("limitCancelReducer", () => {
  const build = makeBuild({ cancelTx: CANCEL_TX });
  const ready = limitCancelReducer(INITIAL_CANCEL_STATE, { build, shape: "evmTx", type: "built", variant: "inWallet" });

  function failSubmit() {
    const signing = limitCancelReducer(ready, { type: "sign" });
    const submitting = limitCancelReducer(signing, { artifact: { txHash: "0xcancel" }, type: "signed" });
    return limitCancelReducer(submitting, { message: "Couldn't cancel", type: "submitFailed" });
  }

  test("a user rejection returns to ready with the same build", () => {
    const signing = limitCancelReducer(ready, { type: "sign" });
    const back = limitCancelReducer(signing, { type: "signRejected" });
    expect(back.phase).toBe("ready");
    expect(back).toMatchObject({ build, shape: "evmTx", variant: "inWallet" });
  });

  test("submitFailed keeps the artifact and retry goes straight to submit", () => {
    const failed = failSubmit();
    expect(failed.phase).toBe("submitFailed");
    expect(failed).toMatchObject({ artifact: { txHash: "0xcancel" } });

    const retried = limitCancelReducer(failed, { type: "retry" });
    expect(retried.phase).toBe("submitting");
    expect(retried).toMatchObject({ artifact: { txHash: "0xcancel" } });
  });

  test("retry never re-enters signing", () => {
    const phases: LimitCancelState["phase"][] = [];
    let state = failSubmit();
    for (const event of [{ type: "retry" as const }, { type: "sign" as const }]) {
      state = limitCancelReducer(state, event);
      phases.push(state.phase);
    }
    expect(phases).toEqual(["submitting", "submitting"]);
  });

  test("a stored failed submit reopens on retry with the saved artifact", () => {
    const resumed = getInitialCancelState({
      artifact: { signature: "0xsig" },
      message: "Couldn't cancel",
      phase: "submitFailed",
      shape: "typedData",
    });
    expect(resumed).toEqual({
      artifact: { signature: "0xsig" },
      message: "Couldn't cancel",
      phase: "submitFailed",
      shape: "typedData",
    });
    expect(limitCancelReducer(resumed, { type: "retry" })).toEqual({
      artifact: { signature: "0xsig" },
      phase: "submitting",
      shape: "typedData",
    });
    expect(getInitialCancelState({ phase: "signing" })).toBe(INITIAL_CANCEL_STATE);
    expect(getInitialCancelState(undefined)).toBe(INITIAL_CANCEL_STATE);
  });

  test("a race replaces any phase and settles with the refetched order", () => {
    const racing = limitCancelReducer(failSubmit(), { type: "race" });
    const order = makeOrder({ status: "FILLED" });
    expect(limitCancelReducer(racing, { order, type: "raceSettled" })).toEqual({ order, phase: "raced" });
  });
});
