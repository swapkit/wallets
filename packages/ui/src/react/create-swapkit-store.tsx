import type { Chain, EIP6963ProviderInfo, WalletOption } from "@swapkit/helpers";
import type { SwapToAsset } from "@swapkit/helpers/api";
import { create } from "zustand";
import type { SwapKitState } from "./types";

type SwapKitStoreState = SwapKitState & {
  eip6963WalletInfo: EIP6963ProviderInfo | null;
  isInitialized: boolean;
  setInitialized: (initialized: boolean) => void;
  walletRefreshKey: number;
  incrementWalletRefreshKey: () => void;
  swapToAssets: SwapToAsset[];
  swapToSellAsset: string | null;
  isFetchingSwapTo: boolean;
  setSwapToData: (assets: SwapToAsset[], sellAsset: string) => void;
  setIsFetchingSwapTo: (loading: boolean) => void;
  clearSwapToData: () => void;
  isRefreshingBalances: boolean;
  setIsRefreshingBalances: (refreshing: boolean) => void;
  balanceRefreshError: string | null;
  setBalanceRefreshError: (error: string | null) => void;
  walletChainsMap: Partial<Record<WalletOption, Chain[]>>;
  setWalletChains: (wallet: WalletOption, chains: Chain[]) => void;
};

export const createSwapKitStore = () =>
  create<SwapKitStoreState>((set) => ({
    balanceRefreshError: null,
    balances: [],
    clearSwapToData: () => set({ swapToAssets: [], swapToSellAsset: null }),
    eip6963WalletInfo: null,
    incrementWalletRefreshKey: () => set((state) => ({ walletRefreshKey: state.walletRefreshKey + 1 })),
    isConnectingWallet: false,
    isFetchingSwapTo: false,
    isInitialized: false,
    isRefreshingBalances: false,
    isWalletConnected: false,
    setBalanceRefreshError: (balanceRefreshError) => set({ balanceRefreshError }),
    setInitialized: (isInitialized) => set({ isInitialized }),
    setIsConnectingWallet: (isConnectingWallet) => set({ isConnectingWallet }),
    setIsFetchingSwapTo: (isFetchingSwapTo) => set({ isFetchingSwapTo }),
    setIsRefreshingBalances: (isRefreshingBalances) => set({ isRefreshingBalances }),
    setSwapKit: (swapKit) => set({ swapKit }),
    setSwapToData: (swapToAssets, swapToSellAsset) => set({ swapToAssets, swapToSellAsset }),
    setWalletChains: (wallet, chains) =>
      set((state) => ({ walletChainsMap: { ...state.walletChainsMap, [wallet]: chains } })),
    setWalletState: ({ connected, type, eip6963Info }) =>
      set({ eip6963WalletInfo: eip6963Info ?? null, isWalletConnected: connected, walletType: type }),
    swapKit: null,
    swapToAssets: [],
    swapToSellAsset: null,
    walletChainsMap: {},
    walletRefreshKey: 0,
    walletType: null,
  }));
