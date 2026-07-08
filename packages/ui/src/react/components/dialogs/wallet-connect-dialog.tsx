"use client";

import {
  type Chain,
  type DerivationPathArray,
  type EIP6963AnnounceProviderEvent,
  getChainConfig,
  WalletOption,
} from "@swapkit/helpers";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  KeyRoundIcon,
  ListFilterIcon,
  PlusCircleIcon,
  SearchIcon,
  UploadIcon,
  WalletMinimalIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { match } from "ts-pattern";
import { cn } from "../../../lib/utils";
import { useMediaQuery } from "../../hooks/use-media-query";
import { showModal, useModal } from "../../hooks/use-modal";
import { filterExperimentalChainsForWallet, isExperimentalWallet } from "../../lib/experimental-wallets";
import { useWalletsConfig } from "../../swapkit-config-context";
import { API_SUPPORTED_CHAINS, useSwapKit, useSwapKitStore } from "../../swapkit-context";
import type { WalletDescriptor } from "../../types";
import { ChainFilterPopover } from "../composable/chain-filter-popover";
import { ChainFilterSheet } from "../composable/chain-filter-sheet";
import { ChainIcon } from "../simple/chain-icon";
import { WalletIcon } from "../simple/wallet-icon";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { SWAPKIT_WIDGET_TOASTER_ID } from "../ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { WalletChainSelectDialog } from "./wallet-chain-select-dialog";
import { WIDGET_SUPPORTED_EVM_CHAINS } from "./wallet-chains-config";
import { supportsXpubDerivation } from "./wallet-derive-address-dialog";
import {
  discoverEIP6963Wallets,
  eip6963ToDescriptor,
  getWalletOptionForEIP6963,
  staticWalletToDescriptor,
} from "./wallet-utils";

const SINGLE_CHAIN_CONNECT_WALLETS = new Set([WalletOption.LEDGER, WalletOption.TREZOR]);

const WALLET_GROUPS = {
  "Browser Extensions": [
    WalletOption.BITGET,
    WalletOption.BRAVE,
    WalletOption.COINBASE_WEB,
    WalletOption.CTRL,
    WalletOption.KEEPKEY_BEX,
    WalletOption.KEPLR,
    WalletOption.LEAP,
    WalletOption.METAMASK,
    WalletOption.OKX,
    WalletOption.ONEKEY,
    WalletOption.PASSKEYS,
    WalletOption.PHANTOM,
    WalletOption.RADIX_WALLET,
    WalletOption.TALISMAN,
  ],
  "Hardware Wallets": [WalletOption.KEEPKEY, WalletOption.LEDGER, WalletOption.TREZOR],
  "Mobile Wallets": [
    WalletOption.COINBASE_MOBILE,
    WalletOption.OKX_MOBILE,
    WalletOption.TRUSTWALLET_WEB,
    WalletOption.VULTISIG,
    WalletOption.WALLETCONNECT,
    WalletOption.XAMAN,
  ],
  Other: [WalletOption.KEYSTORE],
};

const FEATURED_WALLETS = [
  WalletOption.METAMASK,
  WalletOption.CTRL,
  WalletOption.COINBASE_WEB,
  WalletOption.KEYSTORE,
  WalletOption.LEDGER,
  WalletOption.TREZOR,
  WalletOption.BRAVE,
  WalletOption.OKX,
];

export const ALL_WALLET_OPTIONS = Array.from(new Set([...Object.values(WALLET_GROUPS).flat(), ...FEATURED_WALLETS]));

function RequiredChainBanner({
  requiredChain,
  requiredFor,
  filterIsApplied,
  onApply,
  onDismiss,
}: {
  requiredChain: Chain;
  /** Whether the banner is asking the user to connect the *input* chain (what they're paying from) or the *output* chain (where the swap settles). */
  requiredFor: "input" | "output";
  filterIsApplied: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const requiredCfg = getChainConfig(requiredChain);
  const chainName = requiredCfg?.name ?? requiredChain;
  const headline = requiredFor === "input" ? `You're swapping from ${chainName}` : `Your swap pays out to ${chainName}`;
  const subtitle = requiredFor === "input" ? "Pick a wallet that holds it." : "Pick a wallet that supports it.";
  return (
    <div
      className={cn(
        "sk-ui-flex sk-ui-items-center sk-ui-gap-2.5 sk-ui-rounded-lg sk-ui-border sk-ui-px-3 sk-ui-py-2",
        filterIsApplied ? "sk-ui-border-border sk-ui-bg-bg-active" : "sk-ui-border-accent/20 sk-ui-bg-accent/10",
      )}>
      <ChainIcon chain={requiredChain} className="sk-ui-size-5 sk-ui-shrink-0" />
      <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-1 sk-ui-flex-col">
        <span className="sk-ui-text-foreground sk-ui-text-sm sk-ui-leading-tight">{headline}</span>
        <span className="sk-ui-text-muted-foreground sk-ui-text-xs sk-ui-leading-tight">{subtitle}</span>
      </div>
      {filterIsApplied ? (
        <span className="sk-ui-inline-flex sk-ui-shrink-0 sk-ui-items-center sk-ui-gap-1 sk-ui-text-accent sk-ui-text-xs">
          <CheckIcon className="sk-ui-size-3" />
          Filter on
        </span>
      ) : (
        <Button className="sk-ui-shrink-0 sk-ui-text-xs" onClick={onApply} size="sm" variant="default">
          Only show {requiredCfg?.name ?? requiredChain}
        </Button>
      )}
      <button
        aria-label="Dismiss"
        className="sk-ui-shrink-0 sk-ui-rounded sk-ui-p-1 sk-ui-text-muted-foreground hover:sk-ui-bg-bg-hover hover:sk-ui-text-foreground"
        onClick={onDismiss}
        type="button">
        <XIcon className="sk-ui-size-3" />
      </button>
    </div>
  );
}

export function WalletConnectDialog({
  requiredChain,
  requiredFor = "output",
}: {
  requiredChain?: Chain;
  requiredFor?: "input" | "output";
} = {}) {
  const modal = useModal();
  const { getWalletExtendedPublicKey } = useSwapKit();
  const { enabledWallets, isWalletAllowed, isChainAllowed, isDev } = useWalletsConfig();
  const walletChainsMap = useSwapKitStore((state) => state.walletChainsMap);
  const [isShowingAllWallets, setIsShowingAllWallets] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [chainFilterOpen, setChainFilterOpen] = useState(false);
  const [selectedChains, setSelectedChains] = useState<Chain[]>([]);
  // Below 640px the popover crowds the wallet list — switch to a full-screen sheet.
  const isMobileChainFilter = useMediaQuery("(max-width: 639px)");
  const [requiredBannerDismissed, setRequiredBannerDismissed] = useState(false);
  const [eip6963Wallets, setEip6963Wallets] = useState<WalletDescriptor[]>([]);
  const chainFilterTriggerRef = useRef<HTMLButtonElement>(null);

  const getWalletChains = useCallback(
    (wallet: WalletOption): Chain[] =>
      filterExperimentalChainsForWallet(wallet, walletChainsMap[wallet] ?? [], isDev).filter(isChainAllowed),
    [walletChainsMap, isChainAllowed, isDev],
  );
  const getStaticWalletDescriptor = useCallback(
    (wallet: WalletOption) =>
      staticWalletToDescriptor(wallet, getWalletChains(wallet), getWalletExtendedPublicKey(wallet)),
    [getWalletChains, getWalletExtendedPublicKey],
  );

  // Shown while still loading (chains === undefined) OR has at least one
  // direct-signing chain the integrator has enabled.
  const hasDirectSigningChains = useCallback(
    (wallet: WalletOption): boolean => {
      const chains = walletChainsMap[wallet];
      if (chains === undefined) return true;
      return filterExperimentalChainsForWallet(wallet, chains, isDev).some(isChainAllowed);
    },
    [walletChainsMap, isChainAllowed, isDev],
  );

  // Discover EIP-6963 wallets on mount
  useEffect(() => {
    const { providers, cleanup } = discoverEIP6963Wallets();

    // Convert to descriptors
    setEip6963Wallets(providers.map((p) => eip6963ToDescriptor(p, [...WIDGET_SUPPORTED_EVM_CHAINS], walletChainsMap)));

    // Continue listening for late announcements
    const handleAnnouncement = (event: Event) => {
      const e = event as EIP6963AnnounceProviderEvent;
      setEip6963Wallets((prev) => {
        const existing = prev.find((w) => w.eip6963Info?.uuid === e.detail.info.uuid);
        if (existing) return prev;
        return [...prev, eip6963ToDescriptor(e.detail, [...WIDGET_SUPPORTED_EVM_CHAINS], walletChainsMap)];
      });
    };

    window.addEventListener("eip6963:announceProvider", handleAnnouncement);

    return () => {
      cleanup();
      window.removeEventListener("eip6963:announceProvider", handleAnnouncement);
    };
  }, [walletChainsMap]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!modal.open) {
      setChainFilterOpen(false);
      setSelectedChains([]);
      setSearchQuery("");
      setIsShowingAllWallets(false);
      setRequiredBannerDismissed(false);
    }
  }, [modal.open]);

  const filteredFeaturedWallets = useMemo(() => {
    const allowed = (wallet: WalletOption) => isWalletAllowed(wallet) && hasDirectSigningChains(wallet);
    const featured = FEATURED_WALLETS.filter(allowed);
    if (featured.length >= 8) return featured;

    const featuredSet = new Set(featured);
    const fillOrder: WalletOption[] = [
      WalletOption.WALLETCONNECT,
      WalletOption.PHANTOM,
      WalletOption.COINBASE_MOBILE,
      WalletOption.BITGET,
      WalletOption.KEEPKEY,
      WalletOption.KEPLR,
      WalletOption.TALISMAN,
      WalletOption.VULTISIG,
      WalletOption.TRUSTWALLET_WEB,
      WalletOption.ONEKEY,
    ];
    const fillOrderSet = new Set(fillOrder);
    const remaining = Object.values(WALLET_GROUPS)
      .flat()
      .filter((w) => !fillOrderSet.has(w));

    for (const wallet of [...fillOrder, ...remaining]) {
      if (featured.length >= 8) break;
      if (!featuredSet.has(wallet) && allowed(wallet)) {
        featured.push(wallet);
        featuredSet.add(wallet);
      }
    }

    return featured;
  }, [isWalletAllowed, hasDirectSigningChains]);

  const allAvailableChains = useMemo(() => {
    const chains = new Set<Chain>();
    for (const [wallet, walletChains] of Object.entries(walletChainsMap) as [WalletOption, Chain[] | undefined][]) {
      if (!isWalletAllowed(wallet)) continue;
      if (!walletChains) continue;
      for (const chain of filterExperimentalChainsForWallet(wallet, walletChains, isDev)) {
        if (isChainAllowed(chain)) chains.add(chain);
      }
    }
    // Sort by real-world importance / market cap so the filter list matches the wallet rows.
    return Array.from(chains).sort((a, b) => rankChain(a) - rankChain(b));
  }, [walletChainsMap, isWalletAllowed, isChainAllowed, isDev]);

  // Filter static wallets based on configuration
  const filteredStaticWalletGroups = useMemo(() => {
    const groupsToFilter =
      enabledWallets === "all"
        ? WALLET_GROUPS
        : Object.entries(WALLET_GROUPS).reduce(
            (acc, [groupName, wallets]) => {
              const filtered = wallets.filter((w) => enabledWallets.includes(w));
              if (filtered.length > 0) {
                acc[groupName as keyof typeof WALLET_GROUPS] = filtered;
              }
              return acc;
            },
            {} as Partial<typeof WALLET_GROUPS>,
          );

    return Object.entries(groupsToFilter)
      ?.map(([groupTitle, wallets]) => {
        const matchingWallets = wallets?.filter(
          (wallet) =>
            isWalletAllowed(wallet) &&
            hasDirectSigningChains(wallet) &&
            wallet.toLowerCase().includes(searchQuery.toLowerCase()),
        );

        if (matchingWallets?.length === 0) return null;

        return { groupTitle, wallets: matchingWallets };
      })
      ?.filter((group) => group !== null);
  }, [enabledWallets, searchQuery, isWalletAllowed, hasDirectSigningChains]);

  const filteredEip6963Wallets = useMemo(() => {
    return eip6963Wallets.filter((wallet) => {
      if (wallet.eip6963Info) {
        const mappedOption = getWalletOptionForEIP6963(wallet.eip6963Info);
        if (mappedOption && !isWalletAllowed(mappedOption)) return false;
        if (mappedOption && !hasDirectSigningChains(mappedOption)) return false;
      }
      // EIP-6963 descriptors carry their own supportedChains (EVM fallback for
      // unmapped providers), so we filter directly rather than via walletChainsMap.
      if (!wallet.supportedChains.some(isChainAllowed)) return false;
      if (searchQuery.length >= 1 && !wallet.displayName.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [eip6963Wallets, searchQuery, isWalletAllowed, hasDirectSigningChains, isChainAllowed]);

  return (
    <Dialog {...modal}>
      <DialogContent className="sk-ui-flex sk-ui-flex-col sm:sk-ui-h-[680px] sm:!sk-ui-max-h-[min(90svh,680px)] max-sm:!sk-ui-top-0 max-sm:!sk-ui-left-0 max-sm:!sk-ui-translate-x-0 max-sm:!sk-ui-translate-y-0 max-sm:!sk-ui-h-svh max-sm:!sk-ui-max-h-none max-sm:!sk-ui-w-svw max-sm:!sk-ui-max-w-none max-sm:!sk-ui-rounded-none max-sm:!sk-ui-border-0">
        <DialogHeader>
          <DialogTitle>Connect wallet</DialogTitle>
        </DialogHeader>

        {requiredChain && !requiredBannerDismissed && (
          <RequiredChainBanner
            filterIsApplied={selectedChains.length === 1 && selectedChains[0] === requiredChain}
            onApply={() => setSelectedChains([requiredChain])}
            onDismiss={() => setRequiredBannerDismissed(true)}
            requiredChain={requiredChain}
            requiredFor={requiredFor}
          />
        )}

        <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-2">
          <div className="sk-ui-relative sk-ui-flex-1">
            <Input
              className="sk-ui-h-10 sk-ui-bg-secondary sk-ui-pl-9 placeholer:sk-ui-text-muted-foreground sk-ui-text-base sk-ui-text-foreground"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search wallet provider"
              value={searchQuery}
            />
            <SearchIcon className="sk-ui--translate-y-1/2 sk-ui-absolute sk-ui-top-1/2 sk-ui-left-3 sk-ui-size-4 sk-ui-text-muted-foreground" />
          </div>

          <div className="sk-ui-relative">
            <Button
              className={cn(
                "sk-ui-h-10 sk-ui-gap-1.5 sk-ui-border sk-ui-border-transparent sk-ui-text-foreground",
                selectedChains.length > 0 && "sk-ui-border-accent/40 sk-ui-bg-bg-active",
              )}
              onClick={() => setChainFilterOpen((v) => !v)}
              ref={chainFilterTriggerRef}
              size="sm"
              variant="ghost">
              <ListFilterIcon className="sk-ui-size-4" />
              <span>Chains</span>
              <span className="sk-ui-inline-block sk-ui-min-w-[1.25rem] sk-ui-text-center sk-ui-tabular-nums sk-ui-text-muted-foreground">
                {selectedChains.length === 0 ? "All" : selectedChains.length}
              </span>
              <ChevronDownIcon
                className={cn(
                  "sk-ui-size-3 sk-ui-transition-transform sk-ui-duration-200",
                  chainFilterOpen && "sk-ui-rotate-180",
                )}
              />
            </Button>
            {isMobileChainFilter ? (
              <ChainFilterSheet
                allChains={allAvailableChains}
                onChange={setSelectedChains}
                onOpenChange={setChainFilterOpen}
                open={chainFilterOpen}
                selected={selectedChains}
              />
            ) : (
              chainFilterOpen && (
                <ChainFilterPopover
                  allChains={allAvailableChains}
                  onChange={setSelectedChains}
                  onClose={() => setChainFilterOpen(false)}
                  selected={selectedChains}
                  triggerRef={chainFilterTriggerRef}
                />
              )
            )}
          </div>
        </div>

        <div className="sk-ui-relative sk-ui-flex sk-ui-min-h-0 sk-ui-flex-1 sk-ui-flex-col">
          <div className="sk-ui--mx-6 sk-ui--mb-4 sk-ui-flex sk-ui-flex-1 sk-ui-flex-col sk-ui-gap-4 sk-ui-overflow-auto sk-ui-px-6 sk-ui-pb-6">
            {/* Detected wallets — always visible (first screen and expanded) */}
            {filteredEip6963Wallets.length > 0 && (
              <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2" key="wallet-group-detected">
                <WalletGroupHeader>Detected</WalletGroupHeader>
                <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-0.5">
                  {filteredEip6963Wallets.map((wallet) => (
                    <WalletConnectButton
                      detected
                      key={`wallet-button-${wallet.id}`}
                      requiredChain={requiredChain}
                      selectedChains={selectedChains}
                      wallet={wallet}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Popular wallets - first screen only */}
            {!isShowingAllWallets && searchQuery.length < 2 && filteredFeaturedWallets.length > 0 && (
              <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2">
                <WalletGroupHeader>Popular</WalletGroupHeader>
                <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-0.5">
                  {filteredFeaturedWallets.map((wallet) => (
                    <WalletConnectButton
                      key={`wallet-button-${wallet}`}
                      requiredChain={requiredChain}
                      selectedChains={selectedChains}
                      wallet={getStaticWalletDescriptor(wallet)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* All wallets - animated show/hide (detected already rendered above) */}
            <div
              className={cn(
                "sk-ui-grid sk-ui-transition-[grid-template-rows] sk-ui-duration-300 sk-ui-ease-in-out",
                isShowingAllWallets || searchQuery.length >= 2 ? "sk-ui-grid-rows-[1fr]" : "sk-ui-grid-rows-[0fr]",
              )}>
              <div className="sk-ui-overflow-hidden">
                <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-4">
                  {/* Static wallet groups */}
                  {filteredStaticWalletGroups?.map(({ groupTitle, wallets }) => {
                    if (wallets?.length === 0) return null;

                    const isKeystoreGroup = wallets?.length === 1 && wallets[0] === WalletOption.KEYSTORE;
                    const keystoreDescriptor = isKeystoreGroup
                      ? getStaticWalletDescriptor(WalletOption.KEYSTORE)
                      : null;

                    return (
                      <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2" key={`wallet-group-${groupTitle}`}>
                        <WalletGroupHeader count={wallets?.length ?? 0}>{groupTitle}</WalletGroupHeader>

                        <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-0.5">
                          {isKeystoreGroup && keystoreDescriptor ? (
                            <>
                              <WalletConnectButton
                                key="wallet-button-keystore"
                                selectedChains={selectedChains}
                                wallet={keystoreDescriptor}
                              />
                              <WalletConnectButton
                                key="wallet-button-keystore-create"
                                keystoreMethod="create"
                                selectedChains={selectedChains}
                                wallet={keystoreDescriptor}
                              />
                              <WalletConnectButton
                                key="wallet-button-keystore-import"
                                keystoreMethod="import"
                                selectedChains={selectedChains}
                                wallet={keystoreDescriptor}
                              />
                            </>
                          ) : (
                            wallets?.map((wallet) => (
                              <WalletConnectButton
                                key={`wallet-button-${wallet}`}
                                requiredChain={requiredChain}
                                selectedChains={selectedChains}
                                wallet={getStaticWalletDescriptor(wallet)}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          {/* Fade the last row so the scroll edge visibly "cuts off" a wallet below — a clear "there's more" hint.
              Offset by -1rem so it sits flush with the scroll container's visual bottom (which has -mb-4). */}
          <div className="sk-ui-pointer-events-none sk-ui-absolute sk-ui-inset-x-0 sk-ui--bottom-4 sk-ui-h-16 sk-ui-bg-gradient-to-t sk-ui-from-secondary sk-ui-via-secondary/80 sk-ui-to-transparent" />
        </div>

        <DialogFooter className="sk-ui-items-center sk-ui-justify-center sm:sk-ui-flex-col">
          <Button
            className="sk-ui--mt-1 sk-ui-w-auto sk-ui-text-foreground"
            onClick={() => {
              setIsShowingAllWallets((isShowingAllWallets) => !isShowingAllWallets);
            }}
            size="sm"
            variant="ghost">
            <WalletMinimalIcon className="sk-ui-size-4" />

            <span>{isShowingAllWallets ? "Hide all wallets" : "Show all wallets"}</span>
          </Button>
          <p className="sk-ui-max-w-sm sk-ui-text-center sk-ui-text-muted-foreground sk-ui-text-sm">
            By connecting your wallet, you agree to our{" "}
            <a className="sk-ui-text-foreground sk-ui-underline" href="/terms">
              Terms of Service
            </a>{" "}
            and{" "}
            <a className="sk-ui-text-foreground sk-ui-underline" href="/privacy">
              Privacy Policy
            </a>
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type KeystoreMethod = "upload" | "create" | "import";

const KEYSTORE_METHOD_CONFIG: Record<KeystoreMethod, { icon: ReactNode; label: string }> = {
  create: { icon: <PlusCircleIcon className="sk-ui-size-5" />, label: "Create Wallet" },
  import: { icon: <KeyRoundIcon className="sk-ui-size-5" />, label: "Import Phrase" },
  upload: { icon: <UploadIcon className="sk-ui-size-5" />, label: "Upload Keystore" },
};

type ConnectWallet = ReturnType<typeof useSwapKit>["connectWallet"];

async function connectNonKeystoreWallet({
  connectWallet,
  finalChains,
  requiredChain,
  wallet,
  isDev,
}: {
  connectWallet: ConnectWallet;
  finalChains: Chain[];
  requiredChain?: Chain;
  wallet: WalletDescriptor;
  isDev: boolean;
}): Promise<"connected" | "cancelled" | "idle"> {
  let chains = filterExperimentalChainsForWallet(wallet.walletOption, finalChains, isDev);

  if (SINGLE_CHAIN_CONNECT_WALLETS.has(wallet.walletOption)) {
    const { confirmed, data: selectedChain } = await showModal(
      <WalletChainSelectDialog
        chains={chains}
        defaultChain={requiredChain}
        showDeviceHint={wallet.walletOption === WalletOption.LEDGER}
        wallet={wallet}
      />,
    );

    // User dismissed the chain-select step (outside click / X / no selection).
    // Leave the outer connect-wallet modal open so they can pick a different wallet.
    if (!confirmed || !selectedChain) return "idle";
    chains = [selectedChain as Chain];
  }

  const singleChain = chains.length === 1 ? chains[0] : undefined;

  if (wallet.type === "eip6963" && wallet.walletOption === WalletOption.EIP6963 && wallet.eip6963Provider) {
    await connectWallet(WalletOption.EIP6963, chains, wallet.eip6963Provider, wallet.eip6963Info);
    return "connected";
  }

  if (singleChain && supportsXpubDerivation(singleChain, wallet)) {
    const { WalletDeriveAddressDialog } = await import("./wallet-derive-address-dialog");
    const { confirmed, data } = await showModal<{
      address: string;
      derivationPath: DerivationPathArray;
      index: number;
    }>(<WalletDeriveAddressDialog chain={singleChain} wallet={wallet} />);

    if (!confirmed) return "cancelled";

    if (data) {
      await connectWallet(wallet.walletOption, chains, undefined, undefined, data.derivationPath, {
        address: data.address,
      });
    }

    return "connected";
  }

  await connectWallet(wallet.walletOption, chains);
  return "connected";
}

function WalletConnectButton({
  wallet,
  selectedChains,
  requiredChain,
  keystoreMethod,
  detected,
}: {
  wallet: WalletDescriptor;
  selectedChains: Chain[];
  requiredChain?: Chain;
  keystoreMethod?: KeystoreMethod;
  detected?: boolean;
}) {
  const { connectWallet, isConnectingWallet, walletType } = useSwapKit();
  const { isDev, isChainAllowed } = useWalletsConfig();
  const modal = useModal();

  // EIP-6963 descriptors carry an unfiltered EVM fallback list. Filtering once
  // here keeps the chain stack and the matching-chain count consistent.
  const allowedSupportedChains = useMemo(
    () => filterExperimentalChainsForWallet(wallet.walletOption, wallet.supportedChains, isDev).filter(isChainAllowed),
    [wallet.supportedChains, wallet.walletOption, isChainAllowed, isDev],
  );

  const supportsSelectedChains =
    selectedChains.length === 0 || selectedChains.every((c) => allowedSupportedChains.includes(c));

  const handleWalletClick = useCallback(async () => {
    try {
      const supportedChains = wallet.supportedChains;

      if (!supportedChains || supportedChains?.length === 0) {
        toast.error("This wallet does not support any chains", {
          description: "Please try a different wallet.",
          toasterId: SWAPKIT_WIDGET_TOASTER_ID,
        });
        modal.resolve({ confirmed: false });
        return;
      }

      const chainsToConnect =
        selectedChains.length > 0 ? supportedChains.filter((c) => selectedChains.includes(c)) : supportedChains;

      const finalChains = chainsToConnect.length > 0 ? chainsToConnect : supportedChains;

      await match({ keystoreMethod, walletOption: wallet.walletOption })
        .with({ keystoreMethod: "create", walletOption: WalletOption.KEYSTORE }, async () => {
          const { WalletKeystoreCreateDialog } = await import("./wallet-keystore-create-dialog");
          const { confirmed } = await showModal(<WalletKeystoreCreateDialog selectedChains={finalChains} />);
          modal.resolve(confirmed ? { confirmed: true, data: WalletOption.KEYSTORE } : { confirmed: false });
        })
        .with({ keystoreMethod: "import", walletOption: WalletOption.KEYSTORE }, async () => {
          const { WalletKeystorePhraseDialog } = await import("./wallet-keystore-phrase-dialog");
          const { confirmed } = await showModal(<WalletKeystorePhraseDialog selectedChains={finalChains} />);
          modal.resolve(confirmed ? { confirmed: true, data: WalletOption.KEYSTORE } : { confirmed: false });
        })
        .with({ walletOption: WalletOption.KEYSTORE }, async () => {
          const { WalletKeystoreConnectDialog } = await import("./wallet-keystore-connect-dialog");
          const { confirmed } = await showModal(<WalletKeystoreConnectDialog selectedChains={finalChains} />);
          modal.resolve(confirmed ? { confirmed: true, data: WalletOption.KEYSTORE } : { confirmed: false });
        })
        .otherwise(async () => {
          const result = await connectNonKeystoreWallet({ connectWallet, finalChains, isDev, requiredChain, wallet });

          if (result === "connected") modal.resolve({ confirmed: true, data: wallet.walletOption });
          if (result === "cancelled") modal.resolve({ confirmed: false });
        });
    } catch {
      toast.error("Failed to connect your wallet", {
        description: "Make sure your wallet is connected and accessible by the browser.",
        toasterId: SWAPKIT_WIDGET_TOASTER_ID,
      });
      modal.resolve({ confirmed: false });
    }
  }, [connectWallet, modal, wallet, selectedChains, requiredChain, keystoreMethod, isDev]);

  const methodConfig = keystoreMethod ? KEYSTORE_METHOD_CONFIG[keystoreMethod] : null;
  const isSingleChain = SINGLE_CHAIN_CONNECT_WALLETS.has(wallet.walletOption);
  const matchingChains =
    selectedChains.length === 0
      ? allowedSupportedChains
      : allowedSupportedChains.filter((c) => selectedChains.includes(c));
  const displayName = methodConfig ? methodConfig.label : wallet.displayName;

  if (!supportsSelectedChains) {
    return (
      <Button
        className="sk-ui-group sk-ui-flex sk-ui-h-auto sk-ui-w-full sk-ui-cursor-not-allowed sk-ui-items-center sk-ui-justify-start sk-ui-gap-3 sk-ui-rounded-md sk-ui-bg-transparent sk-ui-px-3 sk-ui-py-3 sk-ui-opacity-40 hover:sk-ui-bg-transparent"
        disabled
        key={`wallet-connect-button-${wallet.id}`}>
        <WalletIcon
          className="sk-ui-size-10 sk-ui-shrink-0"
          eip6963Info={wallet.eip6963Info}
          wallet={wallet.walletOption}
        />
        <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-1 sk-ui-flex-col sk-ui-items-start sk-ui-gap-0.5">
          <span className="sk-ui-text-foreground sk-ui-text-base sk-ui-font-medium sk-ui-leading-tight">
            {displayName}
          </span>
          <span className="sk-ui-text-muted-foreground sk-ui-text-xs">Not supported on selected chains</span>
        </div>
      </Button>
    );
  }

  return (
    <Button
      className="sk-ui-group sk-ui-flex sk-ui-h-auto sk-ui-w-full sk-ui-items-center sk-ui-justify-start sk-ui-gap-3 sk-ui-rounded-md sk-ui-bg-transparent sk-ui-px-3 sk-ui-py-3 hover:sk-ui-bg-accent/30"
      isLoading={isConnectingWallet && walletType === wallet.walletOption}
      key={`wallet-connect-button-${wallet.id}`}
      onClick={handleWalletClick}>
      {methodConfig ? (
        <span className="sk-ui-flex sk-ui-size-10 sk-ui-shrink-0 sk-ui-items-center sk-ui-justify-center sk-ui-rounded-md sk-ui-bg-accent/20 sk-ui-text-accent">
          {methodConfig.icon}
        </span>
      ) : (
        <WalletIcon
          className="sk-ui-size-10 sk-ui-shrink-0"
          eip6963Info={wallet.eip6963Info}
          wallet={wallet.walletOption}
        />
      )}

      <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-1 sk-ui-flex-col sk-ui-items-start sk-ui-gap-0.5">
        <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5">
          <span className="sk-ui-text-foreground sk-ui-text-base sk-ui-font-medium sk-ui-leading-tight">
            {displayName}
          </span>
          {detected && (
            <span className="sk-ui-inline-flex sk-ui-items-center sk-ui-gap-1 sk-ui-rounded sk-ui-bg-accent/15 sk-ui-px-1.5 sk-ui-py-0.5 sk-ui-text-[10px] sk-ui-font-semibold sk-ui-uppercase sk-ui-tracking-wider sk-ui-text-accent">
              <span className="sk-ui-size-1 sk-ui-rounded-full sk-ui-bg-accent" />
              Installed
            </span>
          )}
          {isDev && isExperimentalWallet(wallet.walletOption) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="sk-ui-inline-flex sk-ui-items-center sk-ui-gap-1 sk-ui-rounded sk-ui-bg-orange-500/15 sk-ui-px-1.5 sk-ui-py-0.5 sk-ui-text-[10px] sk-ui-font-semibold sk-ui-uppercase sk-ui-tracking-wider sk-ui-text-orange-400">
                  Dev
                </span>
              </TooltipTrigger>
              <TooltipContent className="sk-ui-max-w-[220px] sk-ui-text-xs sk-ui-leading-snug">
                Development build — this wallet integration isn't ready for production use.
              </TooltipContent>
            </Tooltip>
          )}
          {isSingleChain && !methodConfig && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="sk-ui-inline-flex sk-ui-items-center sk-ui-gap-1 sk-ui-rounded sk-ui-border sk-ui-border-border sk-ui-px-1.5 sk-ui-py-0.5 sk-ui-text-[10px] sk-ui-font-semibold sk-ui-uppercase sk-ui-tracking-wider sk-ui-text-muted-foreground">
                  1 chain
                </span>
              </TooltipTrigger>
              <TooltipContent className="sk-ui-max-w-[220px] sk-ui-text-xs sk-ui-leading-snug">
                This wallet can only connect to one chain at a time. You'll pick it in the next step.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {!methodConfig && matchingChains.length > 0 && (
          <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5 sk-ui-text-muted-foreground sk-ui-text-xs">
            <ChainStack chains={matchingChains} max={6} />
            <span>
              {isSingleChain
                ? `Pick 1 of ${matchingChains.length}`
                : `${matchingChains.length} chain${matchingChains.length === 1 ? "" : "s"}`}
            </span>
          </div>
        )}
      </div>

      <ChevronRightIcon className="sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-muted-foreground sk-ui-opacity-0 sk-ui-transition-opacity group-hover:sk-ui-opacity-100" />
    </Button>
  );
}

// Rank map derived from API_SUPPORTED_CHAINS, which is already ordered by real-world
// importance / market cap. Chains not in the list land at the end in a stable order.
const CHAIN_RANK = new Map<Chain, number>(API_SUPPORTED_CHAINS.map((chain, index) => [chain, index]));

function rankChain(chain: Chain): number {
  return CHAIN_RANK.get(chain) ?? Number.MAX_SAFE_INTEGER;
}

function ChainStack({ chains, max = 6 }: { chains: Chain[]; max?: number }) {
  const sorted = [...chains].sort((a, b) => rankChain(a) - rankChain(b));
  const shown = sorted.slice(0, max);
  const extra = sorted.length - shown.length;
  return (
    <span className="sk-ui-inline-flex sk-ui-items-center">
      {shown.map((c, i) => (
        <span
          className={cn(
            "sk-ui-inline-flex sk-ui-rounded-full sk-ui-ring-2 sk-ui-ring-background",
            i === 0 ? "" : "sk-ui--ml-1",
          )}
          key={c}
          style={{ zIndex: shown.length - i }}>
          <ChainIcon chain={c} className="sk-ui-size-3" />
        </span>
      ))}
      {extra > 0 && (
        <span className="sk-ui--ml-1 sk-ui-flex sk-ui-size-3 sk-ui-items-center sk-ui-justify-center sk-ui-rounded-full sk-ui-bg-muted sk-ui-text-[7px] sk-ui-font-semibold sk-ui-text-foreground sk-ui-ring-2 sk-ui-ring-background">
          +{extra}
        </span>
      )}
    </span>
  );
}

function WalletGroupHeader({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <header className="sk-ui-flex sk-ui-items-center sk-ui-gap-2 sk-ui-px-3 sk-ui-text-[11px] sk-ui-font-semibold sk-ui-uppercase sk-ui-tracking-wider sk-ui-text-muted-foreground">
      <span>{children}</span>
      {typeof count === "number" && count > 0 && (
        <span className="sk-ui-rounded-full sk-ui-bg-muted sk-ui-px-1.5 sk-ui-py-0.5 sk-ui-text-[10px] sk-ui-font-semibold sk-ui-tracking-normal sk-ui-text-muted-foreground">
          {count}
        </span>
      )}
    </header>
  );
}
