"use client";

import type { Chain } from "@swapkit/helpers";
import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useWidgetFormStore } from "../stores/widget-form-store";
import { useSwapKit } from "../swapkit-context";
import { useDebouncedEffect } from "./use-debounced-effect";

export function useDestinationAddress(outputAssetChain: Chain | undefined) {
  const { swapKit, isWalletConnected, connectedWallets } = useSwapKit();
  const {
    customDestinationAddress,
    isDestinationFieldExpanded,
    resetDestinationIfScopeChanged,
    setCustomDestinationAddress,
    setIsDestinationFieldExpanded,
  } = useWidgetFormStore(
    useShallow((state) => ({
      customDestinationAddress: state.customDestinationAddress,
      isDestinationFieldExpanded: state.isDestinationFieldExpanded,
      resetDestinationIfScopeChanged: state.resetDestinationIfScopeChanged,
      setCustomDestinationAddress: state.setCustomDestinationAddress,
      setIsDestinationFieldExpanded: state.setIsDestinationFieldExpanded,
    })),
  );
  const [destinationAddressError, setDestinationAddressError] = useState<string | null>(null);
  const [isCustomAddressValidated, setIsCustomAddressValidated] = useState(false);

  const isOutputChainConnected = outputAssetChain ? connectedWallets.has(outputAssetChain) : false;
  const walletDestinationAddress = (outputAssetChain && connectedWallets.get(outputAssetChain)?.address) || "";

  const effectiveDestinationAddress = customDestinationAddress || walletDestinationAddress;

  // Validate custom destination address with debounce
  useDebouncedEffect(
    () => {
      if (!customDestinationAddress || !outputAssetChain || !swapKit) {
        setDestinationAddressError(null);
        setIsCustomAddressValidated(false);
        return;
      }

      let cancelled = false;

      void swapKit.validateAddress({ address: customDestinationAddress, chain: outputAssetChain }).then((isValid) => {
        if (cancelled) return;
        setDestinationAddressError(isValid ? null : `Invalid ${outputAssetChain} address`);
        setIsCustomAddressValidated(isValid);
      });

      return () => {
        cancelled = true;
      };
    },
    [customDestinationAddress, outputAssetChain, swapKit],
    { delay: 500, runImmediately: false },
  );

  useEffect(() => {
    if (!resetDestinationIfScopeChanged({ chain: outputAssetChain, walletConnected: isWalletConnected })) return;
    setDestinationAddressError(null);
    setIsCustomAddressValidated(false);
  }, [outputAssetChain, isWalletConnected, resetDestinationIfScopeChanged]);

  const onAddressChange = useCallback(
    (address: string) => {
      setCustomDestinationAddress(address);
      setIsCustomAddressValidated(false);
      setDestinationAddressError(null);
    },
    [setCustomDestinationAddress],
  );

  const onExpandedChange = useCallback(
    (expanded: boolean) => {
      setIsDestinationFieldExpanded(expanded);
      if (!expanded) {
        setCustomDestinationAddress("");
        setDestinationAddressError(null);
        setIsCustomAddressValidated(false);
      }
    },
    [setCustomDestinationAddress, setIsDestinationFieldExpanded],
  );

  return {
    customDestinationAddress,
    destinationAddressError,
    effectiveDestinationAddress,
    isCustomAddressValidated,
    isDestinationFieldExpanded,
    isOutputChainConnected,
    onAddressChange,
    onExpandedChange,
    walletDestinationAddress,
  };
}
