import { describe, expect, test } from "bun:test";

import { getSubmitState, type SubmitStateInput } from "../submit-state";

const ready: SubmitStateInput = {
  amount: "1",
  gasShortfallTicker: null,
  hasCustomDestinationAddress: false,
  hasDestinationAddress: true,
  hasDestinationAddressError: false,
  hasInsufficientBalance: false,
  hasRoute: true,
  inputAsset: "BTC.BTC",
  inputChain: "BTC",
  isCustomAddressValidated: false,
  isFetchingQuote: false,
  isInProgress: false,
  isInputChainConnected: true,
  isOutputChainConnected: true,
  isWalletConnected: true,
  outputAsset: "ETH.ETH",
  outputChain: "ETH",
};

const disconnected: Partial<SubmitStateInput> = {
  hasDestinationAddress: false,
  isInputChainConnected: false,
  isOutputChainConnected: false,
  isWalletConnected: false,
};

const cases: [string, Partial<SubmitStateInput>, ReturnType<typeof getSubmitState>][] = [
  [
    "in progress beats everything",
    { ...disconnected, amount: "", inputAsset: null, isFetchingQuote: true, isInProgress: true },
    { action: "none", disabled: true, kind: "inProgress", label: "Swapping..." },
  ],
  [
    "fetching quote beats wallet and form rungs",
    { ...disconnected, hasInsufficientBalance: true, isFetchingQuote: true },
    {
      action: "connectInputChainWallet",
      disabled: true,
      kind: "fetchingQuote",
      label: "Checking for the best quote...",
    },
  ],
  [
    "no wallet and no route leads with a plain connect, even without tokens or amount",
    { ...disconnected, amount: "", hasRoute: false, inputAsset: null },
    { action: "none", disabled: false, kind: "connectWallet", label: "Connect wallet" },
  ],
  [
    "no wallet and no route with tokens connects without a chain",
    { ...disconnected, hasRoute: false },
    { action: "connectWallet", disabled: false, kind: "connectWallet", label: "Connect wallet" },
  ],
  [
    "missing input asset asks to select tokens",
    { hasRoute: false, inputAsset: undefined },
    { action: "none", disabled: true, kind: "selectTokens", label: "Select tokens" },
  ],
  [
    "missing output asset asks to select tokens",
    { hasRoute: false, outputAsset: null },
    { action: "none", disabled: true, kind: "selectTokens", label: "Select tokens" },
  ],
  [
    "empty amount beats input chain wallet",
    { amount: "", isInputChainConnected: false },
    { action: "connectInputChainWallet", disabled: false, kind: "enterAmount", label: "Enter transfer amount" },
  ],
  [
    "empty amount with everything connected is disabled",
    { amount: "", hasRoute: false },
    { action: "submit", disabled: true, kind: "enterAmount", label: "Enter transfer amount" },
  ],
  [
    "input chain wallet beats a disconnected wallet",
    { ...disconnected },
    {
      action: "connectInputChainWallet",
      disabled: false,
      kind: "connectInputChainWallet",
      label: "Connect BTC wallet",
    },
  ],
  [
    "disconnected wallet with a route but no input chain",
    { ...disconnected, inputChain: undefined },
    { action: "connectInputChainWallet", disabled: false, kind: "connectWallet", label: "Connect wallet" },
  ],
  [
    "insufficient balance beats gas shortfall",
    { gasShortfallTicker: "ETH", hasInsufficientBalance: true },
    { action: "submit", disabled: true, kind: "insufficientBalance", label: "Insufficient balance" },
  ],
  [
    "gas shortfall beats destination error",
    { gasShortfallTicker: "ETH", hasCustomDestinationAddress: true, hasDestinationAddressError: true },
    { action: "submit", disabled: true, kind: "insufficientGas", label: "Insufficient ETH for network fee" },
  ],
  [
    "destination error",
    { hasCustomDestinationAddress: true, hasDestinationAddressError: true },
    { action: "submit", disabled: true, kind: "invalidDestinationAddress", label: "Invalid destination address" },
  ],
  [
    "output chain wallet beats missing destination and stays clickable",
    { hasDestinationAddress: false, isOutputChainConnected: false },
    {
      action: "connectOutputChainWallet",
      disabled: false,
      kind: "connectOutputChainWallet",
      label: "Connect ETH wallet",
    },
  ],
  [
    "custom destination removes the need for an output chain wallet",
    { hasCustomDestinationAddress: true, isCustomAddressValidated: true, isOutputChainConnected: false },
    { action: "submit", disabled: false, kind: "ready", label: "Swap" },
  ],
  [
    "missing destination address",
    { hasDestinationAddress: false, hasRoute: false },
    { action: "submit", disabled: true, kind: "enterDestinationAddress", label: "Enter destination address" },
  ],
  [
    "pending custom address validation keeps the ready label but disables",
    { hasCustomDestinationAddress: true },
    { action: "submit", disabled: true, kind: "ready", label: "Swap" },
  ],
  [
    "non-positive amount keeps the ready label but disables",
    { amount: "0" },
    { action: "submit", disabled: true, kind: "ready", label: "Swap" },
  ],
  ["ready", {}, { action: "submit", disabled: false, kind: "ready", label: "Swap" }],
  [
    "a blocker beats the wallet rungs and keeps its own disabled state",
    {
      ...disconnected,
      blocker: { disabled: true, id: "unsupportedPair", label: "Select a supported pair" },
      hasRoute: false,
    },
    { action: "none", blockerId: "unsupportedPair", disabled: true, kind: "blocked", label: "Select a supported pair" },
  ],
];

describe("getSubmitState", () => {
  test.each(cases)("%s", (_name, overrides, expected) => {
    expect(getSubmitState({ ...ready, ...overrides })).toEqual(expected);
  });

  test("uses the mode's own labels", () => {
    const labels = { inProgress: "Placing order...", submit: "Place sell order" };
    expect(getSubmitState({ ...ready, labels })).toMatchObject({ kind: "ready", label: "Place sell order" });
    expect(getSubmitState({ ...ready, isInProgress: true, labels })).toMatchObject({
      kind: "inProgress",
      label: "Placing order...",
    });
  });
});
