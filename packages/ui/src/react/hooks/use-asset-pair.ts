"use client";

import { useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { getAssetChain } from "../lib/asset-chain";
import { pickDefaultAssetPair } from "../lib/chain-catalog";
import { useWidgetFormStore } from "../stores/widget-form-store";
import { useWalletsConfig } from "../swapkit-config-context";
import { useWidgetStateParam } from "./use-widget-state-param";

export function useAssetPair({
  initialInputAsset,
  initialOutputAsset,
  syncUrl,
}: {
  initialInputAsset?: string | null;
  initialOutputAsset?: string | null;
  syncUrl: boolean;
}) {
  const { effectiveChains, isChainAllowed } = useWalletsConfig();

  const defaultAssetPair = useMemo(() => pickDefaultAssetPair(effectiveChains), [effectiveChains]);

  const {
    applyAssetPropChanges,
    setStoredAmount,
    setStoredInputAsset,
    setStoredOutputAsset,
    storedAmount,
    storedInputAsset,
    storedOutputAsset,
  } = useWidgetFormStore(
    useShallow((state) => ({
      applyAssetPropChanges: state.applyAssetPropChanges,
      setStoredAmount: state.setAmount,
      setStoredInputAsset: state.setInputAsset,
      setStoredOutputAsset: state.setOutputAsset,
      storedAmount: state.amount,
      storedInputAsset: state.inputAsset,
      storedOutputAsset: state.outputAsset,
    })),
  );

  const inputAssetProp = initialInputAsset || null;
  const outputAssetProp = initialOutputAsset || null;
  useEffect(() => {
    if (syncUrl) return;
    applyAssetPropChanges({ input: inputAssetProp, output: outputAssetProp });
  }, [applyAssetPropChanges, inputAssetProp, outputAssetProp, syncUrl]);

  const [amount, setAmount] = useWidgetStateParam({
    defaultValue: "",
    key: "amount",
    onChange: setStoredAmount,
    syncUrl,
    value: storedAmount,
  });
  const [inputAsset, setInputAsset] = useWidgetStateParam({
    defaultValue: inputAssetProp || defaultAssetPair.input,
    key: "input_asset",
    onChange: setStoredInputAsset,
    syncUrl,
    value: storedInputAsset,
  });
  const [outputAsset, setOutputAsset] = useWidgetStateParam({
    defaultValue: outputAssetProp || defaultAssetPair.output,
    key: "output_asset",
    onChange: setStoredOutputAsset,
    syncUrl,
    value: storedOutputAsset,
  });

  const inputAssetChain = useMemo(() => getAssetChain(inputAsset), [inputAsset]);
  const outputAssetChain = useMemo(() => getAssetChain(outputAsset), [outputAsset]);

  // Only promote a new default on sides still holding the previous default, so manual picks survive.
  const previousDefaultPair = useRef(defaultAssetPair);
  useEffect(() => {
    const prev = previousDefaultPair.current;
    const inputDisallowed = inputAssetChain && !isChainAllowed(inputAssetChain);
    const outputDisallowed = outputAssetChain && !isChainAllowed(outputAssetChain);
    const inputUntouched = inputAsset === prev.input;
    const outputUntouched = outputAsset === prev.output;
    const defaultsChanged = prev.input !== defaultAssetPair.input || prev.output !== defaultAssetPair.output;

    if (inputDisallowed || (defaultsChanged && inputUntouched)) {
      setInputAsset(defaultAssetPair.input);
    }
    if (outputDisallowed || (defaultsChanged && outputUntouched)) {
      setOutputAsset(defaultAssetPair.output);
    }
    previousDefaultPair.current = defaultAssetPair;
  }, [
    inputAsset,
    outputAsset,
    inputAssetChain,
    outputAssetChain,
    isChainAllowed,
    defaultAssetPair,
    setInputAsset,
    setOutputAsset,
  ]);

  return {
    amount,
    inputAsset,
    inputAssetChain,
    outputAsset,
    outputAssetChain,
    setAmount,
    setInputAsset,
    setOutputAsset,
  };
}
