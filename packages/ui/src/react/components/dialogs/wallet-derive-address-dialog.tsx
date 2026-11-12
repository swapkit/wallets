"use client";

import {
  type AssetValue,
  type Chain,
  type DerivationPathArray,
  derivationPathToString,
  type ErrorKeys,
  getChainConfig,
  NetworkDerivationPath,
  SwapKitError,
  type UTXOChain,
  UTXOChains,
  type UTXOScriptType,
} from "@swapkit/helpers";
import type { GetExtendedPublicKey } from "@swapkit/wallets";
import { AlertTriangleIcon, CheckIcon, LoaderIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "../../../lib/utils";
import { useModal } from "../../hooks/use-modal";
import { pathForStandard, purposeForStandard, scriptTypeForPurpose } from "../../lib/derivation-presets";
import {
  type HardwareStandard,
  type HardwareStandardId,
  hardwareStandardsToOffer,
} from "../../lib/hardware-derivation";
import { truncateMiddle } from "../../lib/truncate";
import { useWalletsConfig } from "../../swapkit-config-context";
import type { WalletDescriptor } from "../../types";
import { ChainIcon } from "../simple/chain-icon";
import { WalletIcon } from "../simple/wallet-icon";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { IndexStepper } from "../ui/index-stepper";

function isUtxoChain(chain: Chain): chain is UTXOChain {
  return (UTXOChains as readonly Chain[]).includes(chain);
}

/** Whether to show the derive-address flow for a given wallet+chain combo. */
export type WalletDescriptorWithXpub = WalletDescriptor & { getExtendedPublicKey: GetExtendedPublicKey };

export function supportsXpubDerivation(chain: Chain, wallet: WalletDescriptor): wallet is WalletDescriptorWithXpub {
  return isUtxoChain(chain) && typeof wallet.getExtendedPublicKey === "function";
}

export type DeriveAddressResult = { address?: string; derivationPath: DerivationPathArray; index: number };

function useHardwareStandards(chain: Chain, wallet: WalletDescriptor) {
  const { allowDerivationSelection } = useWalletsConfig();

  return useMemo(
    () => hardwareStandardsToOffer(chain, wallet.walletOption, allowDerivationSelection),
    [allowDerivationSelection, chain, wallet.walletOption],
  );
}

function StandardPicker({
  disabled,
  onChange,
  standards,
  value,
}: {
  disabled?: boolean;
  onChange: (standard: HardwareStandardId) => void;
  standards: HardwareStandard[];
  value: HardwareStandardId | null;
}) {
  if (standards.length === 0) return null;

  return (
    <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2 sk-ui-rounded-md sk-ui-border sk-ui-border-border sk-ui-bg-bg-surface sk-ui-px-2.5 sk-ui-py-2">
      <span className="sk-ui-text-[10px] sk-ui-font-semibold sk-ui-uppercase sk-ui-tracking-wider sk-ui-text-muted-foreground">
        Derivation standard
      </span>

      <div className="sk-ui-flex sk-ui-flex-wrap sk-ui-gap-1.5">
        {standards.map((standard) => (
          <Chip
            disabled={disabled}
            key={standard.id}
            onClick={() => onChange(standard.id)}
            selected={value === standard.id}
            title={standard.template}>
            {standard.label}
          </Chip>
        ))}
      </div>

      <span className="sk-ui-min-w-0 sk-ui-truncate sk-ui-font-mono sk-ui-text-[11px] sk-ui-text-muted-foreground">
        {standards.find((standard) => standard.id === value)?.template}
      </span>
    </div>
  );
}

// Number of indices derived per batch. Each index expands to 2 rows (receive + change),
// so a batch of 5 renders 10 rows at a time.
const ADDRESS_BATCH_SIZE = 5;

type DerivedRow = {
  index: number;
  change: boolean;
  path: DerivationPathArray;
  pathString: string;
  address: string;
  balance: AssetValue | null;
  balanceLoading: boolean;
};

type XpubRequest = { chain: Chain; derivationPath: DerivationPathArray; wallet: WalletDescriptorWithXpub };

async function fetchXpub({ request, account }: { request: XpubRequest; account: number }): Promise<string> {
  const raw = await request.wallet.getExtendedPublicKey(request.chain, request.derivationPath, {
    accountIndex: account,
  });
  const xpub = raw?.xpub;
  if (!xpub || typeof xpub !== "string") {
    console.warn("[derive-address] unexpected getExtendedPublicKey return:", raw);
    throw new Error(`Wallet did not return a usable extended public key for account ${account}`);
  }
  return xpub;
}

async function deriveBatchFromXpub({
  xpub,
  chain,
  startIndex,
  count,
  account,
  derivationPath,
  purpose,
  scriptType,
}: {
  xpub: string;
  chain: UTXOChain;
  startIndex: number;
  count: number;
  account: number;
  derivationPath: DerivationPathArray;
  purpose?: number;
  scriptType: UTXOScriptType;
}): Promise<DerivedRow[]> {
  const { deriveAddressesFromXpub, getUTXOAddressPath } = await import("@swapkit/toolboxes/utxo");
  const derived = deriveAddressesFromXpub({
    accountIndex: account,
    chain,
    count,
    purpose,
    scriptType,
    startIndex,
    xpub,
  });

  // deriveAddressesFromXpub returns both receiving (change=false) and change (change=true) branches.
  // Order pairs so the grid reads: index0/receive, index0/change, index1/receive, …
  const rows = derived.map((item) => {
    const path = getUTXOAddressPath({
      accountIndex: account,
      chain,
      change: item.change,
      derivationPath,
      index: item.index,
    });
    const row: DerivedRow = {
      address: item.address,
      balance: null,
      balanceLoading: true,
      change: item.change,
      index: item.index,
      path,
      pathString: derivationPathToString(path),
    };
    return row;
  });

  rows.sort((a, b) => a.index - b.index || Number(a.change) - Number(b.change));
  return rows;
}

const DEVICE_ERROR_MESSAGES = {
  appNotOpen: "The wallet app on your device is not open. Open the app for this chain and retry.",
  busy: "Device is busy with another request. Wait a moment and retry.",
  denied: "Permission denied at the browser or device prompt. Grant access and retry.",
  disconnected: "Device disconnected. Reconnect it, unlock, and open the app for this chain.",
  locked: "Device is locked. Unlock it and keep the app for this chain open.",
  timeout: "Device didn't respond in time. Reconnect and retry.",
  transport: "Couldn't communicate with the device. Reconnect it and retry.",
  unsupportedBrowser: "This browser can't reach USB devices. Use a Chromium-based browser on desktop.",
} as const;

const DEVICE_ERROR_BY_KEY: Partial<Record<ErrorKeys, string>> = {
  wallet_connection_rejected_by_user: DEVICE_ERROR_MESSAGES.denied,
  wallet_ledger_app_not_open: DEVICE_ERROR_MESSAGES.appNotOpen,
  wallet_ledger_connection_error: DEVICE_ERROR_MESSAGES.disconnected,
  wallet_ledger_device_locked: DEVICE_ERROR_MESSAGES.locked,
  wallet_ledger_transport_error: DEVICE_ERROR_MESSAGES.transport,
  wallet_ledger_webhid_not_supported: DEVICE_ERROR_MESSAGES.unsupportedBrowser,
};

const MAX_ERROR_CAUSE_DEPTH = 4;

function deviceErrorFromKey(err: unknown): string | undefined {
  let current = err;

  for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH && current instanceof Error; depth++) {
    if (current instanceof SwapKitError) {
      const message = DEVICE_ERROR_BY_KEY[current.errorKey];
      if (message) return message;
    }
    current = current.cause;
  }

  return undefined;
}

// Ledger reports SwapKit error keys; Trezor and KeepKey only carry their SDK's text.
function friendlyDeviceError(err: unknown): string | null {
  const fromKey = deviceErrorFromKey(err);
  if (fromKey && fromKey !== DEVICE_ERROR_MESSAGES.transport) return fromKey;

  const lower = (err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? "")).toLowerCase();

  if (lower.includes("disconnected") || lower.includes("no device")) return DEVICE_ERROR_MESSAGES.disconnected;
  if (lower.includes("locked")) return DEVICE_ERROR_MESSAGES.locked;
  if (lower.includes("access denied") || lower.includes("notallowed") || lower.includes("user declined")) {
    return DEVICE_ERROR_MESSAGES.denied;
  }
  if (lower.includes("busy")) return DEVICE_ERROR_MESSAGES.busy;
  if (lower.includes("timeout") || lower.includes("timed out")) return DEVICE_ERROR_MESSAGES.timeout;
  return fromKey ?? null;
}

async function fetchBalance({ chain, address }: { chain: UTXOChain; address: string }): Promise<AssetValue | null> {
  try {
    const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");
    const toolbox = getUtxoToolbox(chain);
    const balances = await toolbox.getBalance(address, true);
    return balances?.[0] ?? null;
  } catch (error) {
    console.warn(`[derive-address] balance fetch failed for ${address}:`, error);
    return null;
  }
}

// Fetch balances in parallel; update each row as it resolves (keyed by pathString to tell receive vs change apart).
function trackBalances({
  chain,
  isCurrent,
  rows,
  setRows,
}: {
  chain: UTXOChain;
  isCurrent: () => boolean;
  rows: DerivedRow[];
  setRows: React.Dispatch<React.SetStateAction<DerivedRow[]>>;
}) {
  for (const row of rows) {
    void fetchBalance({ address: row.address, chain }).then((balance) => {
      if (!isCurrent()) return;
      setRows((prev) =>
        prev.map((r) => (r.pathString === row.pathString ? { ...r, balance, balanceLoading: false } : r)),
      );
    });
  }
}

export function WalletDeriveAddressDialog({ wallet, chain }: { wallet: WalletDescriptor; chain: Chain }) {
  const standards = useHardwareStandards(chain, wallet);

  if (supportsXpubDerivation(chain, wallet)) {
    return <XpubAddressPicker chain={chain} standards={standards} wallet={wallet} />;
  }

  return <StandardOnlyPicker chain={chain} standards={standards} wallet={wallet} />;
}

function StandardOnlyPicker({
  wallet,
  chain,
  standards,
}: {
  wallet: WalletDescriptor;
  chain: Chain;
  standards: HardwareStandard[];
}) {
  const modal = useModal<DeriveAddressResult>();
  const [standard, setStandard] = useState<HardwareStandardId>("default");
  const [index, setIndex] = useState<number | "">(0);

  const chainConfig = getChainConfig(chain);
  const resolvedIndex = index === "" ? 0 : index;
  const derivationPath = pathForStandard(chain, standard, resolvedIndex);

  return (
    <Dialog {...modal}>
      <DialogContent className="sk-ui-flex sk-ui-flex-col sk-ui-overflow-hidden">
        <DialogHeader className="sk-ui-shrink-0">
          <DialogTitle className="sk-ui-flex sk-ui-items-center sk-ui-gap-2">
            <WalletIcon className="sk-ui-size-5" eip6963Info={wallet.eip6963Info} wallet={wallet.walletOption} />
            <ChainIcon chain={chain} className="sk-ui-size-5" />
            Select {chainConfig?.name ?? chain} path
          </DialogTitle>
        </DialogHeader>

        <div className="sk-ui-flex sk-ui-min-h-0 sk-ui-flex-1 sk-ui-flex-col sk-ui-gap-4 sk-ui-overflow-auto">
          <p className="sk-ui-text-muted-foreground sk-ui-text-sm">
            Pick the derivation your device uses. The address is resolved on connect.
          </p>

          <StandardPicker onChange={setStandard} standards={standards} value={standard} />

          <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-3 sk-ui-rounded-md sk-ui-border sk-ui-border-border sk-ui-bg-bg-surface sk-ui-px-2.5 sk-ui-py-2">
            <span className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-col">
              <span className="sk-ui-font-medium sk-ui-text-sm">Index</span>
              <span className="sk-ui-min-w-0 sk-ui-truncate sk-ui-font-mono sk-ui-text-muted-foreground sk-ui-text-xs">
                {derivationPathToString(derivationPath)}
              </span>
            </span>

            <IndexStepper label="Index" onChange={setIndex} value={index} />
          </div>
        </div>

        <DialogFooter className="sk-ui-flex sk-ui-shrink-0 sk-ui-items-center sk-ui-justify-end sm:sk-ui-flex-row">
          <div className="sk-ui-flex sk-ui-gap-2">
            <Button onClick={() => modal.resolve({ confirmed: false })} type="button">
              Cancel
            </Button>

            <Button
              onClick={() => modal.resolve({ confirmed: true, data: { derivationPath, index: resolvedIndex } })}
              type="button"
              variant="primary">
              Connect
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function XpubAddressPicker({
  wallet,
  chain,
  standards,
}: {
  wallet: WalletDescriptorWithXpub;
  chain: Chain;
  standards: HardwareStandard[];
}) {
  const modal = useModal<DeriveAddressResult>();

  const hasStandards = standards.length > 0;

  const [standard, setStandard] = useState<HardwareStandardId | null>(hasStandards ? null : "default");
  const [rows, setRows] = useState<DerivedRow[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!hasStandards);
  const [error, setError] = useState<string | null>(null);
  const [showChange, setShowChange] = useState(true);
  const [jumpIndex, setJumpIndex] = useState("");
  const [account, setAccount] = useState(0);
  const [accountDraft, setAccountDraft] = useState("0");

  const accountInputId = useId();
  const jumpInputId = useId();

  const xpubByBranch = useRef<Map<string, string>>(new Map());
  const loadedBranchRef = useRef<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  // Queue a one-shot scroll-into-view for the row we expect to land in rows.
  // Tracked by (index, change) because the exact pathString isn't known synchronously —
  // derivation uses SDK helpers that are lazy-loaded with the toolbox.
  const scrollTargetRef = useRef<{ index: number; change: boolean } | null>(null);
  // Remember the last attempted load so the Retry button can re-run exactly that call.
  const lastAttemptRef = useRef<{ startIndex: number } | null>(null);
  const [retrying, setRetrying] = useState(false);

  const chainConfig = getChainConfig(chain);

  const derivationPath = useMemo(
    () =>
      hasStandards && standard
        ? pathForStandard(chain, standard, 0)
        : (NetworkDerivationPath[chain] as DerivationPathArray),
    [chain, hasStandards, standard],
  );

  const loadMore = useCallback(
    async (startIndex: number) => {
      if (!(isUtxoChain(chain) && standard)) return false;
      const branch = `${standard}:${account}`;
      if (loadedBranchRef.current !== branch) return false;
      lastAttemptRef.current = { startIndex };
      try {
        let xpub = xpubByBranch.current.get(branch);
        if (!xpub) {
          xpub = await fetchXpub({ account, request: { chain, derivationPath, wallet } });
          xpubByBranch.current.set(branch, xpub);
        }
        if (loadedBranchRef.current !== branch) return false;

        const purpose = hasStandards ? purposeForStandard(chain, standard) : undefined;

        const newRows = await deriveBatchFromXpub({
          account,
          chain,
          count: ADDRESS_BATCH_SIZE,
          derivationPath,
          purpose,
          scriptType: scriptTypeForPurpose(chain, purpose),
          startIndex,
          xpub,
        });
        if (loadedBranchRef.current !== branch) return false;

        setRows((prev) => [...prev, ...newRows]);
        setError(null);

        trackBalances({ chain, isCurrent: () => loadedBranchRef.current === branch, rows: newRows, setRows });

        return true;
      } catch (err) {
        console.warn("[derive-address] loadMore failed:", err);
        if (loadedBranchRef.current !== branch) return false;
        const friendly = friendlyDeviceError(err);
        const raw = err instanceof Error ? err.message : "Failed to derive addresses";
        setError(friendly ?? raw);
        return false;
      }
    },
    [account, chain, derivationPath, hasStandards, standard, wallet],
  );

  const handleRetry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    setError(null);
    const attempt = lastAttemptRef.current?.startIndex ?? 0;
    await loadMore(attempt);
    setRetrying(false);
  }, [loadMore, retrying]);

  const branch = standard === null ? null : `${standard}:${account}`;
  // Every load is keyed by the `standard:account` branch this ref holds — ref-guarded so React
  // StrictMode's double-mount can't fire two concurrent device calls and trip Ledger's transport
  // lock, and so a branch the user has moved away from can never append into the live list.
  useEffect(() => {
    if (branch === null || loadedBranchRef.current === branch) return;
    const isFirstLoad = loadedBranchRef.current === null;
    loadedBranchRef.current = branch;

    if (!isFirstLoad) {
      setRows([]);
      setSelectedRowId(null);
      setError(null);
      setLoadingMore(false);
    }

    setInitialLoading(true);
    void (async () => {
      await loadMore(0);
      if (loadedBranchRef.current === branch) setInitialLoading(false);
    })();
  }, [branch, loadMore]);

  // After any derivation that might have produced our scroll target, scroll-select it once.
  useEffect(() => {
    const target = scrollTargetRef.current;
    if (!target) return;
    const row = rows.find((r) => r.index === target.index && r.change === target.change);
    if (!row) return;
    scrollTargetRef.current = null;
    setSelectedRowId(row.pathString);
    requestAnimationFrame(() => {
      rowRefs.current.get(row.pathString)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [rows]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    const nextStartIndex = rows.length ? Math.max(...rows.map((row) => row.index)) + 1 : 0;
    await loadMore(nextStartIndex);
    setLoadingMore(false);
  }, [loadMore, rows]);

  const handleConnect = useCallback(() => {
    if (!selectedRowId) return;
    const row = rows.find((r) => r.pathString === selectedRowId);
    if (!row) return;
    modal.resolve({ confirmed: true, data: { address: row.address, derivationPath: row.path, index: row.index } });
  }, [modal, rows, selectedRowId]);

  const formattedBalance = useMemo(() => {
    return (row: DerivedRow) => {
      if (row.balanceLoading) return "…";
      if (!row.balance) return "0";
      return row.balance.toSignificant(6);
    };
  }, []);

  const hasBalance = (row: DerivedRow) => {
    if (!row.balance) return false;
    try {
      return row.balance.gt(0);
    } catch {
      return Number(row.balance.toSignificant(6)) > 0;
    }
  };

  const visibleRows = useMemo(() => (showChange ? rows : rows.filter((r) => !r.change)), [rows, showChange]);

  const selectedRow = useMemo(() => rows.find((r) => r.pathString === selectedRowId) ?? null, [rows, selectedRowId]);

  const handleJumpSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const target = Number.parseInt(jumpIndex, 10);
      if (!Number.isFinite(target) || target < 0) return;

      // Queue the scroll+select for when the receive row at `target` exists in state.
      scrollTargetRef.current = { change: false, index: target };

      // If already present, the rows effect will fire on next render thanks to the ref being set.
      const existing = rows.find((r) => r.index === target && !r.change);
      if (existing) {
        setSelectedRowId(existing.pathString);
        requestAnimationFrame(() => {
          rowRefs.current.get(existing.pathString)?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        scrollTargetRef.current = null;
        return;
      }

      // Otherwise derive from current tail up through target, in batches of ADDRESS_BATCH_SIZE.
      void (async () => {
        setLoadingMore(true);
        const maxIndex = rows.length ? Math.max(...rows.map((r) => r.index)) : -1;
        let start = maxIndex + 1;
        while (start <= target) {
          if (!(await loadMore(start))) break;
          start += ADDRESS_BATCH_SIZE;
        }
        setLoadingMore(false);
      })();
    },
    [jumpIndex, loadMore, rows],
  );

  const handleAccountCommit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const next = Number.parseInt(accountDraft, 10);
      if (!Number.isFinite(next) || next < 0) {
        setAccountDraft(String(account));
        return;
      }
      if (next === account) return;
      setAccount(next);
    },
    [account, accountDraft],
  );

  return (
    <Dialog {...modal}>
      <DialogContent className="sk-ui-flex sk-ui-flex-col sk-ui-overflow-hidden">
        <DialogHeader className="sk-ui-shrink-0">
          <DialogTitle className="sk-ui-flex sk-ui-items-center sk-ui-gap-2">
            <WalletIcon className="sk-ui-size-5" eip6963Info={wallet.eip6963Info} wallet={wallet.walletOption} />
            <ChainIcon chain={chain} className="sk-ui-size-5" />
            Select {chainConfig?.name ?? chain} address
          </DialogTitle>
        </DialogHeader>

        <p className="sk-ui-text-muted-foreground sk-ui-text-sm">
          Pick the address to connect. Balances are fetched live from your wallet.
        </p>

        <StandardPicker
          disabled={initialLoading || loadingMore}
          onChange={setStandard}
          standards={standards}
          value={standard}
        />

        {/* Control strip — account switcher, jump-to-index, change-path toggle */}
        <div className="sk-ui-flex sk-ui-flex-wrap sk-ui-items-center sk-ui-gap-3 sk-ui-rounded-md sk-ui-border sk-ui-border-border sk-ui-bg-bg-surface sk-ui-px-2.5 sk-ui-py-1.5">
          <form className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5" onSubmit={handleAccountCommit}>
            <label
              className="sk-ui-text-[10px] sk-ui-font-semibold sk-ui-uppercase sk-ui-tracking-wider sk-ui-text-muted-foreground"
              htmlFor={accountInputId}>
              Account
            </label>
            <div className="sk-ui-flex sk-ui-items-center">
              <span className="sk-ui-font-mono sk-ui-text-xs sk-ui-text-muted-foreground">#</span>
              <input
                className="sk-ui-h-6 sk-ui-w-10 sk-ui-border-0 sk-ui-bg-transparent sk-ui-px-1 sk-ui-font-mono sk-ui-text-sm sk-ui-text-foreground sk-ui-outline-none focus:sk-ui-ring-0"
                id={accountInputId}
                inputMode="numeric"
                onBlur={() => handleAccountCommit()}
                onChange={(e) => setAccountDraft(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
                title="BIP44 account index (slot 2 of m/44'/coin'/account'/change/index)"
                value={accountDraft}
              />
            </div>
          </form>

          <div className="sk-ui-h-4 sk-ui-w-px sk-ui-bg-border" />

          <form className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5" onSubmit={handleJumpSubmit}>
            <label
              className="sk-ui-text-[10px] sk-ui-font-semibold sk-ui-uppercase sk-ui-tracking-wider sk-ui-text-muted-foreground"
              htmlFor={jumpInputId}>
              Jump to
            </label>
            <div className="sk-ui-flex sk-ui-items-center">
              <span className="sk-ui-font-mono sk-ui-text-xs sk-ui-text-muted-foreground">#</span>
              <input
                className="sk-ui-h-6 sk-ui-w-12 sk-ui-border-0 sk-ui-bg-transparent sk-ui-px-1 sk-ui-font-mono sk-ui-text-sm sk-ui-text-foreground sk-ui-outline-none focus:sk-ui-ring-0"
                id={jumpInputId}
                inputMode="numeric"
                onChange={(e) => setJumpIndex(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
                title="Derive through this receive index and select it"
                value={jumpIndex}
              />
            </div>
          </form>

          <div className="sk-ui-ml-auto sk-ui-flex sk-ui-items-center sk-ui-gap-1">
            <Button
              aria-pressed={showChange}
              className="sk-ui-gap-2"
              onClick={() => setShowChange((v) => !v)}
              size="sm"
              title="Show BIP44 change (1) branch alongside receive (0)"
              type="button"
              variant="ghost">
              <span
                aria-hidden
                className={cn(
                  "sk-ui-flex sk-ui-size-4 sk-ui-shrink-0 sk-ui-items-center sk-ui-justify-center sk-ui-rounded-[3px] sk-ui-border sk-ui-transition-colors",
                  showChange
                    ? "sk-ui-border-foreground sk-ui-bg-foreground sk-ui-text-bg-surface"
                    : "sk-ui-border-foreground/60 sk-ui-bg-transparent",
                )}>
                <CheckIcon
                  className={cn(
                    "sk-ui-size-3 sk-ui-stroke-[3] sk-ui-transition-opacity",
                    showChange ? "sk-ui-opacity-100" : "sk-ui-opacity-0",
                  )}
                />
              </span>
              <span className="sk-ui-text-xs">Change addresses</span>
            </Button>
          </div>
        </div>

        {error && (
          <div
            className="sk-ui-flex sk-ui-items-start sk-ui-gap-2 sk-ui-rounded-md sk-ui-border sk-ui-border-foreground/40 sk-ui-bg-bg-surface sk-ui-px-3 sk-ui-py-2"
            role="alert">
            <AlertTriangleIcon className="sk-ui-mt-0.5 sk-ui-size-4 sk-ui-shrink-0 sk-ui-text-foreground" />
            <p className="sk-ui-flex-1 sk-ui-text-foreground sk-ui-text-sm">{error}</p>
            <Button
              className="sk-ui-shrink-0 sk-ui-gap-1.5"
              disabled={retrying}
              onClick={handleRetry}
              size="sm"
              type="button"
              variant="ghost">
              <RefreshCwIcon className={cn("sk-ui-size-3.5", retrying && "sk-ui-animate-spin")} />
              <span className="sk-ui-text-xs">{retrying ? "Retrying…" : "Retry"}</span>
            </Button>
          </div>
        )}

        <div
          aria-label="Derived addresses"
          className="sk-ui-flex sk-ui-min-h-0 sk-ui-flex-1 sk-ui-flex-col sk-ui-gap-0.5 sk-ui-overflow-auto"
          role="radiogroup">
          {standard === null && (
            <div className="sk-ui-flex sk-ui-flex-col sk-ui-items-center sk-ui-gap-1 sk-ui-px-4 sk-ui-py-8 sk-ui-text-center sk-ui-text-muted-foreground">
              <span className="sk-ui-text-sm">Pick a derivation standard to list addresses.</span>
              <span className="sk-ui-text-xs">
                Your device is only asked to approve the standard you choose, so nothing is requested until you pick
                one.
              </span>
            </div>
          )}

          {initialLoading && rows.length === 0 && (
            <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-center sk-ui-gap-2 sk-ui-py-8 sk-ui-text-muted-foreground">
              <LoaderIcon className="sk-ui-size-4 sk-ui-animate-spin" />
              <span className="sk-ui-text-sm">Deriving addresses…</span>
            </div>
          )}

          {visibleRows.map((row) => {
            const isSelected = row.pathString === selectedRowId;
            const funded = hasBalance(row);
            return (
              // biome-ignore lint/a11y/useSemanticElements: button+role=radio keeps rich layout (address, path, balance) inside the clickable region; a native <input type="radio"> + <label> would force a layout we don't want.
              <button
                aria-checked={isSelected}
                className={cn(
                  "sk-ui-group sk-ui-grid sk-ui-items-center sk-ui-gap-3 sk-ui-rounded-md sk-ui-border sk-ui-border-transparent sk-ui-px-2.5 sk-ui-py-2 sk-ui-text-left sk-ui-transition-colors hover:sk-ui-bg-bg-hover",
                  isSelected && "!sk-ui-border-foreground sk-ui-bg-bg-active",
                  row.change && !isSelected && "sk-ui-opacity-40",
                )}
                key={row.pathString}
                onClick={() => setSelectedRowId(row.pathString)}
                ref={(el) => {
                  if (el) rowRefs.current.set(row.pathString, el);
                  else rowRefs.current.delete(row.pathString);
                }}
                role="radio"
                style={{ gridTemplateColumns: "16px 1fr auto" }}
                type="button">
                {/* Radio dot */}
                <span
                  aria-hidden
                  className={cn(
                    "sk-ui-flex sk-ui-size-4 sk-ui-shrink-0 sk-ui-items-center sk-ui-justify-center sk-ui-rounded-full sk-ui-border sk-ui-transition-colors",
                    isSelected ? "sk-ui-border-foreground" : "sk-ui-border-border",
                  )}>
                  <span
                    className={cn(
                      "sk-ui-size-2 sk-ui-rounded-full sk-ui-bg-foreground sk-ui-transition-transform",
                      isSelected ? "sk-ui-scale-100" : "sk-ui-scale-0",
                    )}
                  />
                </span>

                {/* Address + path meta */}
                <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-col sk-ui-gap-0.5">
                  <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5">
                    <span
                      className={cn(
                        "sk-ui-truncate sk-ui-font-mono sk-ui-text-sm sk-ui-font-medium",
                        row.change ? "sk-ui-text-muted-foreground" : "sk-ui-text-foreground",
                      )}>
                      {truncateMiddle(row.address, { end: 8, start: 14 })}
                    </span>
                    {row.change && (
                      <span className="sk-ui-shrink-0 sk-ui-rounded-sm sk-ui-border sk-ui-border-muted-foreground/40 sk-ui-px-1 sk-ui-py-[1px] sk-ui-text-[9px] sk-ui-font-bold sk-ui-uppercase sk-ui-tracking-widest sk-ui-text-muted-foreground">
                        Change
                      </span>
                    )}
                    {funded && (
                      <span
                        aria-label="Has balance"
                        className="sk-ui-size-1.5 sk-ui-shrink-0 sk-ui-rounded-full sk-ui-bg-foreground/60"
                        role="img"
                      />
                    )}
                  </div>
                  <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-1.5 sk-ui-text-[11px] sk-ui-text-muted-foreground">
                    <span>#{row.index}</span>
                    <span className="sk-ui-opacity-50">·</span>
                    <span className="sk-ui-truncate sk-ui-font-mono">{row.pathString}</span>
                  </div>
                </div>

                {/* Balance */}
                <div className="sk-ui-flex sk-ui-shrink-0 sk-ui-flex-col sk-ui-items-end sk-ui-gap-0.5">
                  <span
                    className={cn(
                      "sk-ui-font-mono sk-ui-text-sm sk-ui-font-medium sk-ui-tabular-nums",
                      funded ? "sk-ui-text-foreground" : "sk-ui-text-muted-foreground",
                    )}>
                    {row.balanceLoading ? (
                      <span className="sk-ui-inline-block sk-ui-h-2.5 sk-ui-w-12 sk-ui-animate-pulse sk-ui-rounded-sm sk-ui-bg-muted" />
                    ) : (
                      `${formattedBalance(row)} ${chain}`
                    )}
                  </span>
                </div>
              </button>
            );
          })}

          {standard !== null && !initialLoading && (
            <Button
              className="sk-ui-mt-1 sk-ui-self-center"
              disabled={loadingMore}
              onClick={handleLoadMore}
              size="sm"
              type="button"
              variant="ghost">
              {loadingMore ? (
                <>
                  <LoaderIcon className="sk-ui-size-3.5 sk-ui-animate-spin" />
                  Loading…
                </>
              ) : (
                <>Load {ADDRESS_BATCH_SIZE} more</>
              )}
            </Button>
          )}
        </div>

        {/* Selection summary strip — shows which address will be connected */}
        <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-2 sk-ui-border-t sk-ui-border-border sk-ui-bg-bg-surface sk-ui-px-4 sk-ui-py-2.5 sk-ui-text-xs sk-ui-text-muted-foreground">
          {selectedRow ? (
            <>
              <div className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-1 sk-ui-items-center sk-ui-gap-2">
                <span>Selected</span>
                <span className="sk-ui-truncate sk-ui-font-mono sk-ui-text-foreground">
                  {truncateMiddle(selectedRow.address, { end: 12, start: 18 })}
                </span>
              </div>
              <div className="sk-ui-flex sk-ui-shrink-0 sk-ui-items-center sk-ui-gap-2 sk-ui-font-mono sk-ui-tabular-nums">
                <span
                  className={cn(
                    "sk-ui-font-medium",
                    hasBalance(selectedRow) ? "sk-ui-text-foreground" : "sk-ui-text-muted-foreground",
                  )}>
                  {formattedBalance(selectedRow)} {chain}
                </span>
              </div>
            </>
          ) : (
            <span>Select an address above</span>
          )}
        </div>

        <DialogFooter className="sk-ui-flex sk-ui-shrink-0 sk-ui-items-center sk-ui-justify-end sm:sk-ui-flex-row">
          <div className="sk-ui-flex sk-ui-gap-2">
            <Button onClick={() => modal.resolve({ confirmed: false })} type="button">
              Cancel
            </Button>

            <Button disabled={!selectedRowId} onClick={handleConnect} type="button" variant="primary">
              Connect
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
