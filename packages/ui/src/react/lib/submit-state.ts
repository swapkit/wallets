import { match, P } from "ts-pattern";

export type SubmitStateKind =
  | "inProgress"
  | "fetchingQuote"
  | "connectWallet"
  | "selectTokens"
  | "enterAmount"
  | "blocked"
  | "connectInputChainWallet"
  | "insufficientBalance"
  | "insufficientGas"
  | "invalidDestinationAddress"
  | "connectOutputChainWallet"
  | "enterDestinationAddress"
  | "ready";

export type SubmitAction = "none" | "connectWallet" | "connectInputChainWallet" | "connectOutputChainWallet" | "submit";

export type SubmitBlocker = { disabled: boolean; id: string; label: string };

export type SubmitStateInput = {
  amount: string | null | undefined;
  blocker?: SubmitBlocker;
  gasShortfallTicker: string | null;
  hasCustomDestinationAddress: boolean;
  hasDestinationAddress: boolean;
  hasDestinationAddressError: boolean;
  hasInsufficientBalance: boolean;
  hasRoute: boolean;
  inputAsset: string | null | undefined;
  inputChain: string | undefined;
  isCustomAddressValidated: boolean;
  isFetchingQuote: boolean;
  isInProgress: boolean;
  isInputChainConnected: boolean;
  isOutputChainConnected: boolean;
  isWalletConnected: boolean;
  labels?: { fetchingQuote?: string; inProgress?: string; submit?: string };
  outputAsset: string | null | undefined;
  outputChain: string | undefined;
};

export function getSubmitState({
  amount,
  blocker,
  gasShortfallTicker,
  hasCustomDestinationAddress,
  hasDestinationAddress,
  hasDestinationAddressError,
  hasInsufficientBalance,
  hasRoute,
  inputAsset,
  inputChain,
  isCustomAddressValidated,
  isFetchingQuote,
  isInProgress,
  isInputChainConnected,
  isOutputChainConnected,
  isWalletConnected,
  labels,
  outputAsset,
  outputChain,
}: SubmitStateInput) {
  const needsInputChainWallet = hasRoute && !!inputChain && !isInputChainConnected;
  const needsOutputChainWallet =
    hasRoute && isWalletConnected && !needsInputChainWallet && !isOutputChainConnected && !hasCustomDestinationAddress;
  const isConnectWalletAction = !isWalletConnected || needsInputChainWallet || needsOutputChainWallet;
  const needsDestinationAddress = isWalletConnected && !hasDestinationAddress;
  const isCustomAddressPending =
    hasCustomDestinationAddress && !isCustomAddressValidated && !hasDestinationAddressError;

  const { kind, label } = match({
    amount,
    blocker,
    gasShortfallTicker,
    hasDestinationAddressError,
    hasInsufficientBalance,
    hasRoute,
    inputAsset,
    isFetchingQuote,
    isInProgress,
    isWalletConnected,
    needsDestinationAddress,
    needsInputChainWallet,
    needsOutputChainWallet,
    outputAsset,
  })
    .returnType<{ kind: SubmitStateKind; label: string }>()
    .with({ isInProgress: true }, () => ({ kind: "inProgress", label: labels?.inProgress ?? "Swapping..." }))
    .with({ isFetchingQuote: true }, () => ({
      kind: "fetchingQuote",
      label: labels?.fetchingQuote ?? "Checking for the best quote...",
    }))
    .with({ blocker: P.nonNullable }, ({ blocker }) => ({ kind: "blocked", label: blocker.label }))
    .with({ hasRoute: false, isWalletConnected: false }, () => ({ kind: "connectWallet", label: "Connect wallet" }))
    .with({ inputAsset: P.nullish }, () => ({ kind: "selectTokens", label: "Select tokens" }))
    .with({ outputAsset: P.nullish }, () => ({ kind: "selectTokens", label: "Select tokens" }))
    .with({ amount: P.nullish.or(P.string.length(0)) }, () => ({ kind: "enterAmount", label: "Enter transfer amount" }))
    .with({ needsInputChainWallet: true }, () => ({
      kind: "connectInputChainWallet",
      label: `Connect ${inputChain} wallet`,
    }))
    .with({ isWalletConnected: false }, () => ({ kind: "connectWallet", label: "Connect wallet" }))
    .with({ hasInsufficientBalance: true }, () => ({ kind: "insufficientBalance", label: "Insufficient balance" }))
    .with({ gasShortfallTicker: P.string }, () => ({
      kind: "insufficientGas",
      label: `Insufficient ${gasShortfallTicker} for network fee`,
    }))
    .with({ hasDestinationAddressError: true }, () => ({
      kind: "invalidDestinationAddress",
      label: "Invalid destination address",
    }))
    .with({ needsOutputChainWallet: true }, () => ({
      kind: "connectOutputChainWallet",
      label: `Connect ${outputChain} wallet`,
    }))
    .with({ needsDestinationAddress: true }, () => ({
      kind: "enterDestinationAddress",
      label: "Enter destination address",
    }))
    .otherwise(() => ({ kind: "ready", label: labels?.submit ?? "Swap" }));

  const isBlocked = kind === "blocked";
  const disabled =
    isInProgress ||
    isFetchingQuote ||
    (isBlocked && !!blocker?.disabled) ||
    (!isBlocked &&
      !isConnectWalletAction &&
      (!(inputAsset && outputAsset && Number.parseFloat(amount ?? "0") > 0) ||
        hasInsufficientBalance ||
        !!gasShortfallTicker ||
        (needsDestinationAddress && !needsOutputChainWallet) ||
        hasDestinationAddressError ||
        isCustomAddressPending));

  // Keep this match order in line with the kind/label match above.
  const action = match({
    hasAssets: !!inputAsset && !!outputAsset,
    hasRoute,
    isBlocked,
    isWalletConnected,
    needsInputChainWallet,
    needsOutputChainWallet,
  })
    .returnType<SubmitAction>()
    .with({ hasAssets: false }, () => "none")
    .with({ isBlocked: true }, () => "none")
    .with({ hasRoute: false, isWalletConnected: false }, () => "connectWallet")
    .with({ isWalletConnected: false }, () => "connectInputChainWallet")
    .with({ needsInputChainWallet: true }, () => "connectInputChainWallet")
    .with({ needsOutputChainWallet: true }, () => "connectOutputChainWallet")
    .otherwise(() => "submit");

  return { action, disabled, kind, label, ...(isBlocked && blocker ? { blockerId: blocker.id } : {}) };
}
