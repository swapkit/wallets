"use client";

import { Chain, type WalletOption } from "@swapkit/helpers";
import { ChevronDown, LogOut, RefreshCw, Search, ShieldCheck, Wallet2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { cn, formatCurrency } from "../lib/utils";
import { WALLET_DISPLAY_NAMES } from "./components/config";
import { UnshieldDialog } from "./components/dialogs/unshield-dialog";
import { WalletConnectDialog } from "./components/dialogs/wallet-connect-dialog";
import { ChainIcon } from "./components/simple/chain-icon";
import { TokenBalance } from "./components/simple/token-balance";
import { TruncatedAddress } from "./components/simple/truncated-address";
import { WalletIcon } from "./components/simple/wallet-icon";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./components/ui/sheet";
import { showModal, useModal } from "./hooks/use-modal";
import { useTokenPrices } from "./hooks/use-token-prices";
import { getAleoShieldedDeliveryHashes } from "./lib/aleo-shielded-deliveries";
import { useTransactionHistoryStore } from "./stores/transaction-history-store";
import { API_SUPPORTED_CHAINS, useSwapKit } from "./swapkit-context";
import type { BalanceDetails } from "./types";

type SwapKitWalletDrawerProps = { inputAssetChain?: Chain };

type ChainEntry = [Chain, BalanceDetails[]];

type WalletGroup = { walletType: string; chains: ChainEntry[]; tokenCount: number; totalUsd: number };

export function showSwapKitWalletDrawer(props?: SwapKitWalletDrawerProps) {
  return showModal(<SwapKitWalletDrawer {...props} />);
}

function AleoShieldedRow({ address }: { address: string }) {
  const { swapKit, refreshBalances } = useSwapKit();
  const [hashes, setHashes] = useState(() => getAleoShieldedDeliveryHashes(address));

  if (!(hashes.length && swapKit)) return null;
  const wallet = swapKit.getWallet(Chain.Aleo);
  if (!wallet) return null;

  const handleUnshield = () => {
    void showModal(
      <UnshieldDialog
        address={address}
        onCompleted={(completedHashes) => {
          // Clear the passive "Shielded" badge on matching history entries.
          const completed = new Set(completedHashes);
          const { transactions, updateTransaction } = useTransactionHistoryStore.getState();
          for (const transaction of transactions) {
            if (transaction.shieldedDeliveryHash && completed.has(transaction.shieldedDeliveryHash)) {
              updateTransaction(transaction.id, { shieldedDeliveryHash: undefined });
            }
          }
          setHashes(getAleoShieldedDeliveryHashes(address));
        }}
        onRefreshBalance={refreshBalances}
        wallet={wallet}
      />,
    );
  };

  return (
    <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-2 sk-ui-rounded-lg sk-ui-border sk-ui-border-[#00C3FF]/30 sk-ui-bg-[#00C3FF]/5 sk-ui-p-2.5">
      <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-2 sk-ui-text-sm">
        <ShieldCheck className="sk-ui-size-4 sk-ui-text-[#00A3D4]" />
        <span>
          Shielded swap deliver{hashes.length === 1 ? "y" : "ies"} ({hashes.length})
        </span>
      </div>
      <Button onClick={handleUnshield} size="sm" variant="outline">
        Unshield
      </Button>
    </div>
  );
}

function ChainSection({
  chain,
  balances,
  onSelectAsset,
}: {
  chain: Chain;
  balances: BalanceDetails[];
  onSelectAsset?: (asset: string) => void;
}) {
  const walletAddress = balances?.[0]?.wallet?.address;

  return (
    <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2">
      <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-2">
        <ChainIcon chain={chain} className="sk-ui-size-6" />

        <h3 className="sk-ui-font-semibold sk-ui-tracking-wide">{chain}</h3>

        {walletAddress && <TruncatedAddress address={walletAddress} className="sk-ui-ml-auto" />}
      </div>

      {chain === Chain.Aleo && walletAddress ? <AleoShieldedRow address={walletAddress} /> : null}

      {balances?.map(({ balance, identifier }) => (
        <TokenBalance balance={balance} key={`wallet-chain-balance-${identifier}`} onSelect={onSelectAsset} />
      ))}
    </div>
  );
}

function walletLabel(walletType: string): string {
  return WALLET_DISPLAY_NAMES[walletType as WalletOption] ?? walletType;
}

function WalletGroupSection({
  group,
  collapsible,
  open,
  onToggle,
  onSelectAsset,
}: {
  group: WalletGroup;
  collapsible: boolean;
  open: boolean;
  onToggle: () => void;
  onSelectAsset?: (asset: string) => void;
}) {
  const { walletType, chains, tokenCount, totalUsd } = group;
  const chainCount = chains.length;

  const header = (
    <>
      <WalletIcon className="sk-ui-size-6 sk-ui-shrink-0 sk-ui-rounded-md" wallet={walletType as WalletOption} />

      <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-1 sk-ui-flex-col">
        <span className="sk-ui-font-bold sk-ui-leading-tight">{walletLabel(walletType)}</span>
        <span className="sk-ui-text-xs sk-ui-text-muted-foreground">
          {chainCount} chain{chainCount === 1 ? "" : "s"} · {tokenCount} token{tokenCount === 1 ? "" : "s"}
        </span>
      </div>

      {totalUsd > 0 && (
        <span className="sk-ui-shrink-0 sk-ui-font-semibold sk-ui-tabular-nums">{formatCurrency(totalUsd)}</span>
      )}

      {collapsible && (
        <ChevronDown
          className={cn(
            "sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-muted-foreground sk-ui-transition-transform sk-ui-duration-150",
            open && "sk-ui-rotate-180",
          )}
        />
      )}
    </>
  );

  return (
    <div className="sk-ui-border-t sk-ui-border-border first:sk-ui-border-t-0">
      {collapsible ? (
        <button
          aria-expanded={open}
          className="sk-ui-flex sk-ui-w-full sk-ui-items-center sk-ui-gap-3 sk-ui-bg-transparent sk-ui-py-3 sk-ui-text-left sk-ui-transition-colors hover:sk-ui-bg-bg-hover focus-visible:sk-ui-outline-none focus-visible:sk-ui-ring-2 focus-visible:sk-ui-ring-ring"
          onClick={onToggle}
          type="button">
          {header}
        </button>
      ) : (
        <div className="sk-ui-flex sk-ui-w-full sk-ui-items-center sk-ui-gap-3 sk-ui-py-3">{header}</div>
      )}

      {open && (
        <div className="sk-ui-space-y-4 sk-ui-pb-2">
          {chains.map(([chain, balances]) => (
            <ChainSection
              balances={balances}
              chain={chain}
              key={`wallet-chain-${chain}`}
              onSelectAsset={onSelectAsset}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SwapKitWalletDrawer({ inputAssetChain }: SwapKitWalletDrawerProps = {}) {
  const modal = useModal();
  const { disconnectWallet, balancesByChain, checkIfChainConnected, isRefreshingBalances, refreshBalances } =
    useSwapKit();
  const { pricesByTokenId } = useTokenPrices();
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedWallets, setCollapsedWallets] = useState<Set<string>>(new Set());
  const needsInputAssetWallet = !!inputAssetChain && !checkIfChainConnected(inputAssetChain);

  const handleConnectWallet = useCallback(async () => {
    const { confirmed } = await showModal(
      needsInputAssetWallet && inputAssetChain ? (
        <WalletConnectDialog requiredChain={inputAssetChain} requiredFor="input" />
      ) : (
        <WalletConnectDialog />
      ),
    );
    if (confirmed) void refreshBalances();
  }, [inputAssetChain, needsInputAssetWallet, refreshBalances]);

  const { withBalanceGroups, otherChainGroups, walletCount } = useMemo(() => {
    const entries = Array.from(balancesByChain?.entries() ?? []) as ChainEntry[];

    const chainRank = (chain: Chain) => {
      const index = API_SUPPORTED_CHAINS.indexOf(chain as (typeof API_SUPPORTED_CHAINS)[number]);
      return index === -1 ? API_SUPPORTED_CHAINS.length : index;
    };
    const sortedEntries = entries.sort(([a], [b]) => chainRank(a) - chainRank(b));

    const query = searchQuery.toLowerCase();
    const filteredEntries = query
      ? sortedEntries.filter(
          ([chain, balances]) =>
            chain.toLowerCase().includes(query) ||
            balances.some(({ identifier }) => identifier.toLowerCase().includes(query)),
        )
      : sortedEntries;

    const usdOf = (balances: BalanceDetails[]) =>
      balances.reduce((sum, { balance }) => {
        const amount = balance.getValue("number") ?? 0;
        const price = pricesByTokenId.get(balance.toString())?.priceUSD ?? 0;
        return sum + amount * price;
      }, 0);

    // Group chains by the wallet that owns them (each chain is connected through
    // exactly one wallet, so the first balance's walletType is authoritative).
    const groupChains = (chainEntries: ChainEntry[]): WalletGroup[] => {
      const byWallet = new Map<string, ChainEntry[]>();
      for (const entry of chainEntries) {
        const walletType = String(entry[1][0]?.wallet?.walletType ?? "unknown");
        const list = byWallet.get(walletType) ?? [];
        list.push(entry);
        byWallet.set(walletType, list);
      }

      return Array.from(byWallet.entries())
        .map(([walletType, chains]) => ({
          chains,
          tokenCount: chains.reduce((sum, [, balances]) => sum + balances.length, 0),
          totalUsd: chains.reduce((sum, [, balances]) => sum + usdOf(balances), 0),
          walletType,
        }))
        .sort((a, b) => b.totalUsd - a.totalUsd);
    };

    const withBalance: ChainEntry[] = [];
    const otherChains: ChainEntry[] = [];
    for (const entry of filteredEntries) {
      const hasNonZeroBalance = entry[1].some(({ balance }) => balance.getValue("number") > 0);
      (hasNonZeroBalance ? withBalance : otherChains).push(entry);
    }

    const distinctWallets = new Set<string>();
    for (const [, balances] of sortedEntries) {
      distinctWallets.add(String(balances[0]?.wallet?.walletType ?? "unknown"));
    }

    return {
      otherChainGroups: groupChains(otherChains),
      walletCount: distinctWallets.size,
      withBalanceGroups: groupChains(withBalance),
    };
  }, [balancesByChain, searchQuery, pricesByTokenId]);

  const isMultiWallet = walletCount > 1;
  const hasResults = withBalanceGroups.length > 0 || otherChainGroups.length > 0;

  const subtitle = isMultiWallet
    ? `Connected to ${walletCount} wallets across ${balancesByChain.size} ${
        balancesByChain.size === 1 ? "chain" : "chains"
      }`
    : `Connected across ${balancesByChain.size} ${balancesByChain.size === 1 ? "chain" : "chains"}`;

  // Close the drawer and report the chosen asset so the widget can adopt it as
  // the swap input. Resolves the modal promise returned by showSwapKitWalletDrawer.
  const handleSelectAsset = useCallback(
    (asset: string) => {
      modal.resolve({ confirmed: true, data: asset });
    },
    [modal],
  );

  const renderGroup = (group: WalletGroup) => (
    <WalletGroupSection
      collapsible={isMultiWallet}
      group={group}
      key={`wallet-group-${group.walletType}`}
      onSelectAsset={handleSelectAsset}
      onToggle={() =>
        setCollapsedWallets((prev) => {
          const next = new Set(prev);
          next.has(group.walletType) ? next.delete(group.walletType) : next.add(group.walletType);
          return next;
        })
      }
      open={!isMultiWallet || !collapsedWallets.has(group.walletType)}
    />
  );

  const renderRefreshButton = () => (
    <Button
      aria-label="Refresh balances"
      disabled={isRefreshingBalances}
      onClick={() => void refreshBalances()}
      size="xs"
      title="Refresh balances"
      variant="ghost">
      <RefreshCw className={isRefreshingBalances ? "sk-ui-size-4 sk-ui-animate-spin" : "sk-ui-size-4"} />
    </Button>
  );

  return (
    <Sheet {...modal}>
      <SheetContent className="sk-ui-flex sk-ui-flex-col">
        <SheetHeader>
          <SheetTitle>Connected Wallets</SheetTitle>

          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>

        <div className="sk-ui-relative">
          <Search className="sk-ui-pointer-events-none sk-ui-absolute sk-ui-top-1/2 sk-ui-left-3 sk-ui-size-4 sk-ui--translate-y-1/2 sk-ui-text-muted-foreground" />

          <Input
            className="sk-ui-pl-9"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chains..."
            value={searchQuery}
          />
        </div>

        <div className="sk-ui--mr-4 sk-ui-mt-1 sk-ui-flex sk-ui-w-auto sk-ui-flex-1 sk-ui-flex-col sk-ui-space-y-6 sk-ui-overflow-y-auto sk-ui-pt-2 sk-ui-pr-4 sk-ui-pb-16">
          {withBalanceGroups.length > 0 && (
            <div>
              <div className="sk-ui-sticky sk-ui--top-4 sk-ui-z-10 sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-bg-background sk-ui-py-2">
                <span className="sk-ui-text-muted-foreground sk-ui-text-xs sk-ui-font-medium sk-ui-uppercase sk-ui-tracking-wider">
                  With Balance
                </span>

                {renderRefreshButton()}
              </div>

              {withBalanceGroups.map(renderGroup)}
            </div>
          )}

          {otherChainGroups.length > 0 && (
            <div>
              <div className="sk-ui-sticky sk-ui--top-4 sk-ui-z-10 sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-bg-background sk-ui-py-2">
                <span className="sk-ui-text-muted-foreground sk-ui-text-xs sk-ui-font-medium sk-ui-uppercase sk-ui-tracking-wider">
                  Other Chains
                </span>

                {withBalanceGroups.length === 0 && renderRefreshButton()}
              </div>

              {otherChainGroups.map(renderGroup)}
            </div>
          )}

          {!hasResults && searchQuery && (
            <p className="sk-ui-text-center sk-ui-text-muted-foreground sk-ui-py-8">
              No chains found matching "{searchQuery}"
            </p>
          )}
        </div>

        <Button
          className="sk-ui-w-full hover:!sk-ui-bg-bg-hover hover:!sk-ui-text-foreground"
          onClick={handleConnectWallet}
          variant="outline">
          <Wallet2 className="sk-ui-size-4" />
          Connect wallet
        </Button>

        <Button
          className="sk-ui-w-full"
          onClick={() => {
            disconnectWallet();
            modal.resolve({ confirmed: true, data: undefined });
          }}
          variant="destructive">
          <LogOut className="sk-ui-mr-2 sk-ui-size-4" />
          {isMultiWallet ? "Disconnect all" : "Disconnect"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
