"use client";

import { type Chain, UTXOScriptType } from "@swapkit/helpers";
import { SearchIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { CHAIN_CATALOG } from "../../lib/chain-catalog";
import {
  accountIndexIssue,
  type ChainDerivationConfig,
  DEFAULT_DERIVATION_SETTINGS,
  type DerivationSettings,
  derivationIssueFor,
  MAX_DERIVATION_INDEX,
  offersForcedScriptType,
  pathCountFor,
  resolvedCustomPath,
  resolvedPathFor,
  singleWalletChainsOffDefaultPath,
  standardsFor,
} from "../../lib/derivation-presets";
import { ChainIcon } from "../simple/chain-icon";
import { Chip } from "../ui/chip";
import { CollapsibleSection } from "../ui/collapsible-section";
import { IndexStepper } from "../ui/index-stepper";
import { Input } from "../ui/input";

const CHAIN_NAMES = new Map(CHAIN_CATALOG.map((entry) => [entry.chain, entry.name]));

const BADGE =
  "sk-ui-shrink-0 sk-ui-rounded-full sk-ui-border sk-ui-border-border sk-ui-px-2 sk-ui-py-0.5 sk-ui-text-[11px] sk-ui-text-muted-foreground";

function ChainPicker({
  chains,
  disabled,
  onPick,
}: {
  chains: Chain[];
  disabled?: boolean;
  onPick: (chain: Chain) => void;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return chains;

    return chains.filter(
      (chain) => chain.toLowerCase().includes(needle) || (CHAIN_NAMES.get(chain) ?? "").toLowerCase().includes(needle),
    );
  }, [chains, query]);

  return (
    <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2 sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-bg-background sk-ui-p-2">
      <div className="sk-ui-relative">
        <SearchIcon className="sk-ui-pointer-events-none sk-ui-absolute sk-ui-top-3 sk-ui-left-3 sk-ui-size-3.5 sk-ui-text-muted-foreground" />

        <label className="sk-ui-sr-only" htmlFor={searchId}>
          Search chain
        </label>

        <Input
          autoComplete="off"
          className="sk-ui-h-9 sk-ui-pl-8 sk-ui-text-xs"
          disabled={disabled}
          id={searchId}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search chain..."
          value={query}
        />
      </div>

      <div className="sk-ui-flex sk-ui-max-h-48 sk-ui-flex-col sk-ui-overflow-y-auto">
        {matches.length === 0 && <p className="sk-ui-p-2 sk-ui-text-muted-foreground sk-ui-text-xs">No chain found.</p>}

        {matches.map((chain) => {
          const paths = pathCountFor(chain);

          return (
            <button
              className="sk-ui-flex sk-ui-w-full sk-ui-items-center sk-ui-gap-2 sk-ui-rounded-md sk-ui-px-2 sk-ui-py-2 sk-ui-text-left sk-ui-transition-colors hover:sk-ui-bg-bg-hover focus-visible:sk-ui-outline-none focus-visible:sk-ui-ring-1 focus-visible:sk-ui-ring-ring"
              disabled={disabled}
              key={chain}
              onClick={() => onPick(chain)}
              type="button">
              <ChainIcon chain={chain} className="sk-ui-size-6 sk-ui-shrink-0" />

              <span className="sk-ui-shrink-0 sk-ui-font-semibold sk-ui-text-xs">{chain}</span>

              <span className="sk-ui-min-w-0 sk-ui-truncate sk-ui-text-muted-foreground sk-ui-text-xs">
                {CHAIN_NAMES.get(chain)}
              </span>

              {paths > 1 && <span className={`sk-ui-ml-auto ${BADGE}`}>{paths} paths</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WalletKeystoreDerivation({
  chains,
  disabled,
  onChange,
  value,
}: {
  chains: Chain[];
  disabled?: boolean;
  onChange: (value: DerivationSettings) => void;
  value: DerivationSettings;
}) {
  const pathFieldId = useId();
  const [isPicking, setIsPicking] = useState(false);

  if (chains.length === 0) return null;

  const overridden = (Object.keys(value.overrides) as Chain[]).filter((chain) => chains.includes(chain));
  const addable = chains.filter((chain) => !value.overrides[chain]);
  const accountIndex = value.accountIndex === "" ? 0 : value.accountIndex;

  function updateOverride(chain: Chain, patch: Partial<ChainDerivationConfig>) {
    const current = value.overrides[chain] ?? { customPath: "", index: accountIndex, standard: "default" };
    onChange({ ...value, overrides: { ...value.overrides, [chain]: { ...current, ...patch } } });
  }

  function removeOverride(chain: Chain) {
    const { [chain]: _removed, ...rest } = value.overrides;
    onChange({ ...value, overrides: rest });
  }

  const summary = overridden.length
    ? `${overridden.length} ${overridden.length === 1 ? "chain" : "chains"} customised · wallet index ${accountIndex} elsewhere`
    : `Wallet index ${accountIndex} on every chain`;

  const indexIssue = accountIndexIssue(value);
  const singleWalletChains = singleWalletChainsOffDefaultPath(chains, value);

  return (
    <CollapsibleSection
      title={
        <span className="sk-ui-flex sk-ui-min-w-0 sk-ui-items-center sk-ui-gap-2">
          <span className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-col">
            <span>Derivation</span>
            <span className="sk-ui-mt-0.5 sk-ui-min-w-0 sk-ui-truncate sk-ui-font-normal sk-ui-text-muted-foreground sk-ui-text-xs">
              {summary}
            </span>
          </span>

          {overridden.length > 0 && (
            <span className="sk-ui-shrink-0 sk-ui-rounded-full sk-ui-bg-accent/10 sk-ui-px-2 sk-ui-py-0.5 sk-ui-text-[11px] sk-ui-text-accent">
              {overridden.length} custom
            </span>
          )}
        </span>
      }>
      <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-1">
        <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-3">
          <span className="sk-ui-flex sk-ui-min-w-0 sk-ui-flex-col">
            <span className="sk-ui-font-medium sk-ui-text-sm">Wallet index</span>
            <span className="sk-ui-text-muted-foreground sk-ui-text-xs">
              Picks which wallet to derive, on every chain
            </span>
          </span>

          <IndexStepper
            disabled={disabled}
            label="Wallet index"
            onChange={(accountIndex) => onChange({ ...value, accountIndex })}
            value={value.accountIndex}
          />
        </div>

        {indexIssue === "index" && (
          <span className="sk-ui-text-error-foreground sk-ui-text-xs">
            Enter a wallet index between 0 and {MAX_DERIVATION_INDEX}
          </span>
        )}

        {singleWalletChains.length > 0 && (
          <span className="sk-ui-text-error-foreground sk-ui-text-xs">
            {singleWalletChains.join(", ")} can only derive wallet index 0 — give{" "}
            {singleWalletChains.length === 1 ? "it" : "them"} a per-chain override at index 0 to keep the wallet index
            above on every other chain.
          </span>
        )}
      </div>

      <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2 sk-ui-border-t sk-ui-border-border sk-ui-pt-4">
        <div className="sk-ui-flex sk-ui-items-center sk-ui-justify-between sk-ui-gap-2">
          <span className="sk-ui-text-[11px] sk-ui-text-muted-foreground sk-ui-uppercase sk-ui-tracking-wider">
            Per-chain overrides
          </span>

          {addable.length > 0 && (
            <button
              className="sk-ui-shrink-0 sk-ui-font-medium sk-ui-text-accent sk-ui-text-xs sk-ui-transition-colors hover:sk-ui-text-foreground focus-visible:sk-ui-outline-none focus-visible:sk-ui-ring-1 focus-visible:sk-ui-ring-ring"
              disabled={disabled}
              onClick={() => setIsPicking((picking) => !picking)}
              type="button">
              {isPicking ? "Cancel" : "+ Add chain"}
            </button>
          )}
        </div>

        {isPicking && (
          <ChainPicker
            chains={addable}
            disabled={disabled}
            onPick={(chain) => {
              updateOverride(chain, { index: accountIndex, standard: "default" });
              setIsPicking(false);
            }}
          />
        )}

        {!isPicking && overridden.length === 0 && (
          <p className="sk-ui-text-muted-foreground sk-ui-text-xs">
            Every chain follows the wallet index above. Add a chain to give it its own path or index.
          </p>
        )}

        {/* `hidden` would not work here: its user-agent `display: none` loses to `sk-ui-flex`. */}
        {!isPicking && (
          <div className="sk-ui-flex sk-ui-max-h-56 sk-ui-flex-col sk-ui-gap-2 sk-ui-overflow-y-auto">
            {overridden.map((chain) => {
              const config = value.overrides[chain];
              if (!config) return null;

              const standards = standardsFor(chain);
              const isCustom = config.standard === "custom";
              const issue = derivationIssueFor(chain, config);
              const resolvedPath = resolvedPathFor(chain, value);
              const offersFormat = offersForcedScriptType(chain, config);
              const isForcingSegWit = config.forceScriptType === UTXOScriptType.P2WPKH;

              return (
                <div
                  className="sk-ui-flex sk-ui-flex-col sk-ui-gap-2.5 sk-ui-rounded-lg sk-ui-border sk-ui-border-border sk-ui-bg-card sk-ui-p-3"
                  key={chain}>
                  <div className="sk-ui-flex sk-ui-items-center sk-ui-gap-2">
                    <ChainIcon chain={chain} className="sk-ui-size-6 sk-ui-shrink-0" />

                    <span className="sk-ui-shrink-0 sk-ui-font-semibold sk-ui-text-xs">{chain}</span>

                    <span className="sk-ui-min-w-0 sk-ui-truncate sk-ui-text-muted-foreground sk-ui-text-xs">
                      {CHAIN_NAMES.get(chain)}
                    </span>

                    <span className="sk-ui-ml-auto sk-ui-flex sk-ui-shrink-0 sk-ui-items-center sk-ui-gap-2">
                      {!isCustom && (
                        <IndexStepper
                          disabled={disabled}
                          label={`${chain} wallet index`}
                          onChange={(index) => updateOverride(chain, { index })}
                          value={config.index}
                        />
                      )}

                      <button
                        className="sk-ui-text-muted-foreground sk-ui-text-xs sk-ui-transition-colors hover:sk-ui-text-foreground focus-visible:sk-ui-outline-none focus-visible:sk-ui-ring-1 focus-visible:sk-ui-ring-ring"
                        disabled={disabled}
                        onClick={() => removeOverride(chain)}
                        type="button">
                        Reset
                      </button>
                    </span>
                  </div>

                  {resolvedPath && (
                    <span className="sk-ui-min-w-0 sk-ui-truncate sk-ui-font-mono sk-ui-text-muted-foreground sk-ui-text-xs">
                      {resolvedPath}
                    </span>
                  )}

                  {issue === "index" && (
                    <span className="sk-ui-text-error-foreground sk-ui-text-xs">
                      Enter a wallet index between 0 and {MAX_DERIVATION_INDEX}
                    </span>
                  )}

                  {standards.length > 0 && (
                    <div className="sk-ui-flex sk-ui-flex-wrap sk-ui-gap-1.5">
                      {standards.map((standard) => (
                        <Chip
                          disabled={disabled}
                          key={standard.id}
                          onClick={() =>
                            updateOverride(chain, {
                              standard: standard.id,
                              ...(standard.id === "custom" && !config.customPath && resolvedPath
                                ? { customPath: resolvedPath }
                                : {}),
                            })
                          }
                          selected={config.standard === standard.id}>
                          {standard.label}
                        </Chip>
                      ))}
                    </div>
                  )}

                  {isCustom && (
                    <div className="sk-ui-flex sk-ui-flex-col sk-ui-gap-1">
                      <label className="sk-ui-sr-only" htmlFor={`${pathFieldId}-${chain}`}>
                        {chain} custom derivation path
                      </label>

                      <Input
                        autoComplete="off"
                        className="sk-ui-h-9 sk-ui-font-mono sk-ui-text-xs"
                        disabled={disabled}
                        id={`${pathFieldId}-${chain}`}
                        onChange={(event) => updateOverride(chain, { customPath: event.target.value })}
                        placeholder="m/44'/0'/0'/0/0"
                        spellCheck={false}
                        value={config.customPath}
                      />

                      {issue === "format" && (
                        <span className="sk-ui-text-error-foreground sk-ui-text-xs">
                          Enter a path this chain uses, for example{" "}
                          {resolvedPathFor(chain, DEFAULT_DERIVATION_SETTINGS)}
                        </span>
                      )}

                      {issue === "hardening" && (
                        <span className="sk-ui-text-error-foreground sk-ui-text-xs">
                          This path would derive as {resolvedCustomPath(chain, config.customPath)} — type it with that
                          hardening to use it
                        </span>
                      )}

                      {offersFormat && (
                        <div className="sk-ui-mt-1 sk-ui-flex sk-ui-flex-col sk-ui-gap-1.5 sk-ui-rounded-md sk-ui-border sk-ui-border-border sk-ui-bg-background sk-ui-p-2.5">
                          <span className="sk-ui-text-[11px] sk-ui-text-muted-foreground sk-ui-uppercase sk-ui-tracking-wider">
                            Address format
                          </span>

                          <div className="sk-ui-flex sk-ui-flex-wrap sk-ui-gap-1.5">
                            <Chip
                              disabled={disabled}
                              onClick={() => updateOverride(chain, { forceScriptType: undefined })}
                              selected={!isForcingSegWit}>
                              Follows the path
                            </Chip>

                            <Chip
                              disabled={disabled}
                              onClick={() => updateOverride(chain, { forceScriptType: UTXOScriptType.P2WPKH })}
                              selected={isForcingSegWit}>
                              Force Native SegWit
                            </Chip>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
