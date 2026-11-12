import {
  ACCOUNT_INDEXED_CHAINS,
  Chain,
  type DerivationPathArray,
  type DerivationPathLike,
  derivationPathToString,
  type EVMChain,
  EVMChains,
  getDerivationPathFor,
  getUTXOScriptTypeForPurpose,
  NetworkDerivationPath,
  SINGLE_WALLET_CHAINS,
  type UpdatableDerivationPath,
  UTXO_SCRIPT_TYPE_LIST,
  type UTXOChain,
  UTXOChains,
  UTXOPurpose,
  UTXOScriptType,
  updateDerivationPath,
} from "@swapkit/helpers";
import type { KeystoreDerivationPathMap, KeystoreDerivationPathMapOrIndex } from "@swapkit/wallet-keystore";

export type DerivationStandardId = "default" | "legacy" | "segwit" | "taproot" | "ledgerLive" | "custom";

// These chains derive every level hardened, so a path typed without hardening still resolves hardened.
const ALL_HARDENED_CHAINS: readonly Chain[] = [Chain.Aleo, Chain.Aptos, Chain.Solana, Chain.Stellar, Chain.Sui];

function derivesAllHardened(chain: Chain) {
  return ALL_HARDENED_CHAINS.includes(chain);
}

function pathToString(chain: Chain, path: DerivationPathLike) {
  return derivationPathToString(path, { allHardened: derivesAllHardened(chain) });
}

const SHORT_NAMES: Record<Exclude<DerivationStandardId, "default">, string> = {
  custom: "Custom",
  ledgerLive: "Ledger Live",
  legacy: "Legacy",
  segwit: "SegWit",
  taproot: "Taproot",
};

function defaultName(chain: Chain, purpose: number) {
  if (purpose === UTXOPurpose.bech32) return "Native SegWit";
  if (purpose === 1852) return "Shelley";
  if (purpose === 44) return EVMChains.includes(chain as EVMChain) ? "MetaMask · BIP44" : "BIP44";

  return `Purpose ${purpose}'`;
}

export type ChainDerivationConfig = {
  index: number | "";
  standard: DerivationStandardId;
  customPath: string;
  forceScriptType?: UTXOScriptType;
};

export type DerivationSettings = {
  accountIndex: number | "";
  overrides: Partial<Record<Chain, ChainDerivationConfig>>;
};

export const DEFAULT_DERIVATION_SETTINGS: DerivationSettings = { accountIndex: 0, overrides: {} };

const EVM_CHAINS_WITH_STANDARDS: readonly Chain[] = [Chain.Ethereum, Chain.BinanceSmartChain, Chain.Avalanche];

export function hasNamedStandards(chain: Chain) {
  return (
    EVM_CHAINS_WITH_STANDARDS.includes(chain) ||
    (NetworkDerivationPath[chain] as readonly number[])[0] === UTXOPurpose.bech32
  );
}

const CUSTOM_PATH_ONLY_CHAINS: readonly Chain[] = [Chain.Solana];

export function allowsCustomPath(chain: Chain) {
  return hasNamedStandards(chain) || CUSTOM_PATH_ONLY_CHAINS.includes(chain);
}

export function pathCountFor(chain: Chain) {
  return Math.max(1, standardsFor(chain).length);
}

// Must mirror `createKeystoreWallet`'s four-level trim: a five-level shape moves Solana's default address.
const FOUR_LEVEL_CHAINS: readonly Chain[] = [Chain.Solana, Chain.Aleo];

export function connectorDefaultPath(chain: Chain, index: number) {
  const trimmed = (NetworkDerivationPath[chain] as readonly number[]).slice(
    0,
    FOUR_LEVEL_CHAINS.includes(chain) ? 4 : 5,
  ) as unknown as UpdatableDerivationPath;

  return updateDerivationPath(trimmed, ACCOUNT_INDEXED_CHAINS.includes(chain) ? { account: index } : { index });
}

export function pathForStandard(chain: Chain, standard: DerivationStandardId, index: number) {
  if (standard === "default" || standard === "custom") return connectorDefaultPath(chain, index);

  if (standard === "taproot") {
    return updateDerivationPath(NetworkDerivationPath[chain], {
      account: 0,
      index,
      purpose: UTXOPurpose.taproot,
    }) as DerivationPathArray;
  }

  return getDerivationPathFor({ chain, index, type: standard }) as DerivationPathArray;
}

function templateFor(chain: Chain, standard: DerivationStandardId) {
  const atZero = pathForStandard(chain, standard, 0);
  const atOne = pathForStandard(chain, standard, 1) as readonly number[];
  const movedSlot = (atZero as readonly number[]).findIndex((slot, position) => slot !== atOne[position]);

  const rendered = pathToString(chain, atZero).split("/");
  if (movedSlot >= 0) {
    rendered[movedSlot + 1] = rendered[movedSlot + 1]?.replace(/^\d+/, "{index}") ?? "{index}";
  }

  return rendered.join("/");
}

function belongsToChain(chain: Chain, generated: readonly number[]) {
  const own = NetworkDerivationPath[chain] as readonly number[];

  if (generated[1] !== own[1]) return false;

  return generated[0] === own[0] || own[0] === UTXOPurpose.bech32;
}

const NAMED_STANDARDS: DerivationStandardId[] = ["legacy", "segwit", "taproot", "ledgerLive"];

function namedStandardsFor(chain: Chain) {
  if (!hasNamedStandards(chain)) return [];

  return isUTXOChain(chain) ? NAMED_STANDARDS.filter((standard) => standard !== "ledgerLive") : NAMED_STANDARDS;
}

export function standardsFor(chain: Chain) {
  const named = namedStandardsFor(chain);
  const seen: { id: DerivationStandardId; label: string; template: string }[] = [];

  for (const standard of ["default", ...named] as DerivationStandardId[]) {
    const generated = pathForStandard(chain, standard, 0) as readonly number[];
    if (standard !== "default" && !belongsToChain(chain, generated)) continue;
    if (!canEncodePath(chain, generated)) continue;

    const template = templateFor(chain, standard);
    if (seen.some((option) => option.template === template)) continue;

    seen.push({
      id: standard,
      label: standard === "default" ? defaultName(chain, generated[0] as number) : SHORT_NAMES[standard],
      template,
    });
  }

  if (seen.length < 2 && !allowsCustomPath(chain)) return [];

  return allowsCustomPath(chain) ? [...seen, { id: "custom" as const, label: SHORT_NAMES.custom, template: "" }] : seen;
}

export function isUTXOChain(chain: Chain): chain is UTXOChain {
  return UTXOChains.includes(chain as UTXOChain);
}

function scriptTypesFor(chain: Chain): readonly UTXOScriptType[] {
  if (!isUTXOChain(chain)) return [];

  return (NetworkDerivationPath[chain] as readonly number[])[0] === UTXOPurpose.bech32
    ? UTXO_SCRIPT_TYPE_LIST
    : [UTXOScriptType.P2PKH];
}

export function chainDefaultScriptType(chain: UTXOChain) {
  return getUTXOScriptTypeForPurpose((NetworkDerivationPath[chain] as readonly number[])[0]) ?? UTXOScriptType.P2PKH;
}

export function purposeForStandard(chain: Chain, standard: DerivationStandardId) {
  return (pathForStandard(chain, standard, 0) as readonly number[])[0] as number;
}

export function scriptTypeForPurpose(chain: UTXOChain, purpose?: number) {
  return getUTXOScriptTypeForPurpose(purpose) ?? chainDefaultScriptType(chain);
}

export function canEncodePath(chain: Chain, path: readonly number[]) {
  const scriptType = getUTXOScriptTypeForPurpose(path[0]);

  return !isUTXOChain(chain) || scriptType === undefined || scriptTypesFor(chain).includes(scriptType);
}

export function allowsForcedScriptType(chain: Chain) {
  return scriptTypesFor(chain).length > 1;
}

// Free-form paths only: forcing an encoding onto a named standard derives an address no other wallet reproduces.
export function offersForcedScriptType(chain: Chain, config: ChainDerivationConfig) {
  if (config.standard !== "custom" || !allowsForcedScriptType(chain)) return false;

  const slots = parseDerivationPath(config.customPath, chain);
  if (!slots) return false;

  return slots[0] !== UTXOPurpose.bech32;
}

export function forcedScriptTypeFor(chain: Chain, config: ChainDerivationConfig) {
  return offersForcedScriptType(chain, config) ? config.forceScriptType : undefined;
}

export const MAX_DERIVATION_INDEX = 2 ** 31 - 1;

export function isIndexInRange(index: number | "") {
  return index === "" || (Number.isInteger(index) && index >= 0 && index <= MAX_DERIVATION_INDEX);
}

function levelCountsFor(chain: Chain) {
  const counts = new Set<number>([(connectorDefaultPath(chain, 0) as readonly number[]).length]);

  for (const option of standardsFor(chain)) {
    if (option.id === "custom") continue;

    counts.add((pathForStandard(chain, option.id, 0) as readonly number[]).length);
  }

  return counts;
}

type ReadDerivationPath = { hardened: boolean[]; slots: DerivationPathArray };

function readDerivationPath(value: string, chain: Chain): ReadDerivationPath | null {
  const body = value.trim().replace(/^m\//i, "");
  if (!body) return null;

  const parts = body.split("/");
  if (!levelCountsFor(chain).has(parts.length)) return null;

  const hardened: boolean[] = [];
  const slots = parts.map((part) => {
    const matched = /^(\d+)('?)$/.exec(part.trim());
    hardened.push(matched?.[2] === "'");

    return matched?.[1] === undefined ? Number.NaN : Number(matched[1]);
  });

  if (slots.some((slot) => !isIndexInRange(slot))) return null;

  return { hardened, slots: slots as unknown as DerivationPathArray };
}

// The hardening the SDK re-applies when it renders the slot array back into a path.
function sdkHardening(chain: Chain, slots: DerivationPathArray) {
  return pathToString(chain, slots)
    .replace(/^m\//, "")
    .split("/")
    .map((part) => part.endsWith("'"));
}

function keepsTypedHardening(chain: Chain, { hardened, slots }: ReadDerivationPath) {
  if (derivesAllHardened(chain)) return true;

  const expected = sdkHardening(chain, slots);

  return expected.length === hardened.length && expected.every((flag, position) => flag === hardened[position]);
}

export function resolvedCustomPath(chain: Chain, value: string) {
  const read = readDerivationPath(value, chain);

  return read ? pathToString(chain, read.slots) : null;
}

export function parseDerivationPath(value: string, chain: Chain) {
  const read = readDerivationPath(value, chain);
  if (!read || !keepsTypedHardening(chain, read)) return null;

  return read.slots;
}

export function buildChainPath(chain: Chain, config: ChainDerivationConfig) {
  if (config.standard === "custom") return parseDerivationPath(config.customPath, chain);

  return pathForStandard(chain, config.standard, config.index === "" ? 0 : config.index);
}

export function resolvedPathFor(chain: Chain, settings: DerivationSettings) {
  const override = settings.overrides[chain];
  const path = override
    ? buildChainPath(chain, override)
    : connectorDefaultPath(chain, settings.accountIndex === "" ? 0 : settings.accountIndex);

  return path ? pathToString(chain, path) : null;
}

function varyingSlot(chain: Chain, standard: DerivationStandardId) {
  const atZero = pathForStandard(chain, standard, 0) as readonly number[];
  const atOne = pathForStandard(chain, standard, 1) as readonly number[];

  return atZero.findIndex((slot, position) => slot !== atOne[position]);
}

function badgeLabel(label: string) {
  return label.replace(/\s*\([^)]*\)$/, "");
}

const FORCED_FORMAT_LABELS: Record<UTXOScriptType, string> = {
  [UTXOScriptType.P2PKH]: "Legacy",
  [UTXOScriptType.P2SH_P2WPKH]: "Nested SegWit",
  [UTXOScriptType.P2TR]: "Taproot",
  [UTXOScriptType.P2WPKH]: "SegWit",
};

export type DerivationDescription = { label: string | null; index: number | null; format: string | null };

export function derivationBadgeText({ format, index, label }: DerivationDescription) {
  const path = [label, index === null ? null : `#${index}`].filter(Boolean).join(" ");
  if (!format) return path;

  return `${path || "Default path"} → ${format}`;
}

export function describeDerivation(
  chain: Chain,
  path: string,
  forcedScriptType?: UTXOScriptType,
): DerivationDescription | null {
  const slots = parseDerivationPath(path, chain);
  if (!slots) return null;

  const format = forcedScriptType ? FORCED_FORMAT_LABELS[forcedScriptType] : null;

  const asString = pathToString(chain, slots);
  if (asString === pathToString(chain, connectorDefaultPath(chain, 0)) && !format) return null;

  const readSlot = (slot: number) => slots[slot];

  for (const option of standardsFor(chain)) {
    if (option.id === "custom") continue;

    const slot = varyingSlot(chain, option.id);
    const index = slot >= 0 ? readSlot(slot) : undefined;
    if (index === undefined) continue;

    if (pathToString(chain, pathForStandard(chain, option.id, index)) !== asString) continue;

    return {
      format,
      index: index === 0 ? null : index,
      label: option.id === "default" ? null : badgeLabel(option.label),
    };
  }

  const defaultSlot = varyingSlot(chain, "default");
  const defaultIndex = defaultSlot >= 0 ? readSlot(defaultSlot) : undefined;
  if (defaultIndex !== undefined && pathToString(chain, connectorDefaultPath(chain, defaultIndex)) === asString) {
    return { format, index: defaultIndex === 0 ? null : defaultIndex, label: null };
  }

  return { format, index: null, label: "Custom" };
}

export type DerivationIssue = "format" | "hardening" | "index";

export function derivationIssueFor(chain: Chain, config: ChainDerivationConfig): DerivationIssue | null {
  if (config.standard !== "custom") return isIndexInRange(config.index) ? null : "index";

  const read = readDerivationPath(config.customPath, chain);
  if (!read) return "format";

  return keepsTypedHardening(chain, read) ? null : "hardening";
}

export function accountIndexIssue(settings: DerivationSettings): DerivationIssue | null {
  return isIndexInRange(settings.accountIndex) ? null : "index";
}

export function invalidOverrideChains(settings: DerivationSettings) {
  return (Object.keys(settings.overrides) as Chain[]).filter((chain) => {
    const override = settings.overrides[chain];
    return override ? derivationIssueFor(chain, override) !== null : false;
  });
}

export function singleWalletChainsOffDefaultPath(chains: Chain[], settings: DerivationSettings) {
  return chains.filter((chain) => {
    if (!SINGLE_WALLET_CHAINS.includes(chain)) return false;

    const resolved = resolvedPathFor(chain, settings);

    return resolved !== null && resolved !== pathToString(chain, connectorDefaultPath(chain, 0));
  });
}

export function hasDerivationIssue(settings: DerivationSettings, chains: Chain[]) {
  return (
    accountIndexIssue(settings) !== null ||
    invalidOverrideChains(settings).length > 0 ||
    singleWalletChainsOffDefaultPath(chains, settings).length > 0
  );
}

export function scriptTypeFor(chain: UTXOChain, path: DerivationPathArray, config?: ChainDerivationConfig) {
  const forced = config && forcedScriptTypeFor(chain, config);

  return forced ?? scriptTypeForPurpose(chain, path[0]);
}

export function isOffStandardScriptType(path: DerivationPathArray, scriptType?: UTXOScriptType) {
  if (!scriptType) return false;

  const standard = getUTXOScriptTypeForPurpose(path[0]);

  return standard !== undefined && standard !== scriptType;
}

// The whole map must be sent once any chain is customised: the connector falls back to index 0 for absentees.
export function buildKeystoreDerivation(chains: Chain[], settings: DerivationSettings) {
  const accountIndex = settings.accountIndex === "" ? 0 : settings.accountIndex;
  if (Object.keys(settings.overrides).length === 0) return accountIndex;

  return chains.reduce((map, chain) => {
    const override = settings.overrides[chain];
    const path = override ? buildChainPath(chain, override) : connectorDefaultPath(chain, accountIndex);
    if (!path) return map;

    // `KeystoreDerivationPathMap` is a conditional mapped type, which `isUTXOChain` cannot narrow — hence the cast.
    (map as Record<Chain, unknown>)[chain] = isUTXOChain(chain)
      ? { derivationPath: path, scriptType: scriptTypeFor(chain, path, override) }
      : path;

    return map;
  }, {} as KeystoreDerivationPathMap);
}

export type ConnectedDerivationState = {
  derivationPaths: Partial<Record<Chain, string>>;
  forcedScriptTypes: Partial<Record<Chain, UTXOScriptType>>;
};

// Both maps merge into the store, so a chain with no entry keeps the previous connection's value.
export function keystoreDerivationState(
  chains: Chain[],
  derivation: KeystoreDerivationPathMapOrIndex,
): ConnectedDerivationState {
  const requested = chains.map((chain) => {
    const entry = typeof derivation === "number" ? undefined : derivation[chain];
    const fallback = connectorDefaultPath(chain, typeof derivation === "number" ? derivation : 0);

    if (!entry) return { chain, path: fallback, scriptType: undefined };

    if ("derivationPath" in entry) {
      const { scriptType } = entry as { scriptType?: UTXOScriptType };

      return { chain, path: entry.derivationPath as DerivationPathArray, scriptType };
    }

    return { chain, path: entry as DerivationPathArray, scriptType: undefined };
  });

  return {
    derivationPaths: Object.fromEntries(requested.map(({ chain, path }) => [chain, pathToString(chain, path)])),
    forcedScriptTypes: Object.fromEntries(
      requested.map(({ chain, path, scriptType }) => [
        chain,
        isOffStandardScriptType(path, scriptType) ? scriptType : undefined,
      ]),
    ),
  };
}

export function walletDerivationState(chains: Chain[], derivationPath?: DerivationPathArray): ConnectedDerivationState {
  return {
    derivationPaths: Object.fromEntries(
      chains.map((chain) => [chain, derivationPath ? pathToString(chain, derivationPath) : undefined]),
    ),
    forcedScriptTypes: Object.fromEntries(chains.map((chain) => [chain, undefined])),
  };
}
