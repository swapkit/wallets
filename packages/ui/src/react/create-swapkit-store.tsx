import type { Chain, EIP6963ProviderInfo, UTXOScriptType, WalletOption } from "@swapkit/helpers";
import { create } from "zustand";
import type { SwapKitState } from "./types";

type SwapKitStoreState = SwapKitState & {
  eip6963WalletInfo: EIP6963ProviderInfo | null;
  isInitialized: boolean;
  setInitialized: (initialized: boolean) => void;
  walletRefreshKey: number;
  incrementWalletRefreshKey: () => void;
  isRefreshingBalances: boolean;
  setIsRefreshingBalances: (refreshing: boolean) => void;
  balanceRefreshError: string | null;
  setBalanceRefreshError: (error: string | null) => void;
  walletChainsMap: Partial<Record<WalletOption, Chain[]>>;
  setWalletChains: (wallet: WalletOption, chains: Chain[]) => void;
  derivationPaths: Partial<Record<Chain, string>>;
  setDerivationPaths: (paths: Partial<Record<Chain, string>>) => void;
  forcedScriptTypes: Partial<Record<Chain, UTXOScriptType>>;
  setForcedScriptTypes: (types: Partial<Record<Chain, UTXOScriptType>>) => void;
  clearDerivationPaths: () => void;
};

export const createSwapKitStore = () =>
  create<SwapKitStoreState>((set) => ({
    balanceRefreshError: null,
    balances: [],
    clearDerivationPaths: () => set({ derivationPaths: {}, forcedScriptTypes: {} }),
    derivationPaths: {},
    eip6963WalletInfo: null,
    forcedScriptTypes: {},
    incrementWalletRefreshKey: () => set((state) => ({ walletRefreshKey: state.walletRefreshKey + 1 })),
    isConnectingWallet: false,
    isInitialized: false,
    isRefreshingBalances: false,
    isWalletConnected: false,
    setBalanceRefreshError: (balanceRefreshError) => set({ balanceRefreshError }),
    setDerivationPaths: (paths) => set((state) => ({ derivationPaths: { ...state.derivationPaths, ...paths } })),
    setForcedScriptTypes: (types) => set((state) => ({ forcedScriptTypes: { ...state.forcedScriptTypes, ...types } })),
    setInitialized: (isInitialized) => set({ isInitialized }),
    setIsConnectingWallet: (isConnectingWallet) => set({ isConnectingWallet }),
    setIsRefreshingBalances: (isRefreshingBalances) => set({ isRefreshingBalances }),
    setSwapKit: (swapKit) => set({ swapKit }),
    setWalletChains: (wallet, chains) =>
      set((state) => ({ walletChainsMap: { ...state.walletChainsMap, [wallet]: chains } })),
    setWalletState: ({ connected, type, eip6963Info }) =>
      set({ eip6963WalletInfo: eip6963Info ?? null, isWalletConnected: connected, walletType: type }),
    swapKit: null,
    walletChainsMap: {},
    walletRefreshKey: 0,
    walletType: null,
  }));
