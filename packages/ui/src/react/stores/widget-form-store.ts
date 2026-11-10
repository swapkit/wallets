import { create } from "zustand";
import { DEFAULT_SLIPPAGE_PERCENT } from "../lib/slippage";

export type WidgetOperation = "swap" | "limit";

type AssetProps = { input: string | null; output: string | null };

type DestinationScope = { chain: string | null; walletConnected: boolean };

type WidgetFormValues = {
  amount: string;
  inputAsset: string | null;
  outputAsset: string | null;
  assetProps: AssetProps | null;
  slippagePercent: number;
  customDestinationAddress: string;
  isDestinationFieldExpanded: boolean;
  destinationScope: DestinationScope | null;
  pendingOperation: WidgetOperation | null;
};

type WidgetFormState = WidgetFormValues & {
  setAmount: (amount: string) => void;
  setInputAsset: (asset: string) => void;
  setOutputAsset: (asset: string) => void;
  applyAssetPropChanges: (props: AssetProps) => void;
  setSlippagePercent: (slippagePercent: number) => void;
  setCustomDestinationAddress: (address: string) => void;
  setIsDestinationFieldExpanded: (expanded: boolean) => void;
  resetDestinationIfScopeChanged: (scope: { chain?: string | null; walletConnected: boolean }) => boolean;
  startOperation: (operation: WidgetOperation) => boolean;
  finishOperation: () => void;
};

const initialWidgetFormValues: WidgetFormValues = {
  amount: "",
  assetProps: null,
  customDestinationAddress: "",
  destinationScope: null,
  inputAsset: null,
  isDestinationFieldExpanded: false,
  outputAsset: null,
  pendingOperation: null,
  slippagePercent: DEFAULT_SLIPPAGE_PERCENT,
};

export const useWidgetFormStore = create<WidgetFormState>()((set, get) => ({
  ...initialWidgetFormValues,
  applyAssetPropChanges: (props) => {
    const previous = get().assetProps;
    if (previous?.input === props.input && previous?.output === props.output) return;
    set({
      assetProps: props,
      ...(previous && previous.input !== props.input && { inputAsset: props.input }),
      ...(previous && previous.output !== props.output && { outputAsset: props.output }),
    });
  },
  finishOperation: () => set({ pendingOperation: null }),
  resetDestinationIfScopeChanged: ({ chain = null, walletConnected }) => {
    const current = get().destinationScope;
    if (current?.chain === chain && current.walletConnected === walletConnected) return false;
    set({
      customDestinationAddress: "",
      destinationScope: { chain, walletConnected },
      isDestinationFieldExpanded: false,
    });
    return true;
  },
  setAmount: (amount) => set({ amount }),
  setCustomDestinationAddress: (customDestinationAddress) => set({ customDestinationAddress }),
  setInputAsset: (inputAsset) => set({ inputAsset }),
  setIsDestinationFieldExpanded: (isDestinationFieldExpanded) => set({ isDestinationFieldExpanded }),
  setOutputAsset: (outputAsset) => set({ outputAsset }),
  setSlippagePercent: (slippagePercent) => set({ slippagePercent }),
  startOperation: (operation) => {
    if (get().pendingOperation) return false;
    set({ pendingOperation: operation });
    return true;
  },
}));

export function resetWidgetFormStore() {
  useWidgetFormStore.setState(initialWidgetFormValues);
}
