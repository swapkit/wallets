import { HDKey, type Versions } from "@scure/bip32";
import {
  Chain,
  type DerivationPathArray,
  derivationPathToString,
  FeeOption,
  filterSupportedChains,
  type GenericTransferParams,
  NetworkDerivationPath,
  SKConfig,
  SwapKitError,
  type UTXOChain,
  WalletOption,
} from "@swapkit/helpers";
import {
  assertDerivationIndex,
  createHDWalletHelpers,
  getNetworkForChain,
  getUTXOAccountIndexFromPath,
  getUTXOAccountPath,
  getUtxoApi,
  type UTXOToolboxes,
  type UTXOType,
} from "@swapkit/toolboxes/utxo";
import type { BTCNetwork, PCZT, Transaction, ZcashPSBT, ZcashTransaction } from "@swapkit/utxo-signer";
import { BCHSigHash, NETWORKS, ZcashVersionGroupId } from "@swapkit/utxo-signer";
import { createWallet, getWalletSupportedChains, type HardwareExtendedPublicKeyInfo } from "@swapkit/wallet-core";

type TrezorBip32Derivation = [Uint8Array, { fingerprint: number; path: number[] }];
type TrezorCoreMode = "auto" | "iframe" | "popup" | "suite-desktop" | "suite-web";
type TrezorTransport = "BridgeTransport" | "WebUsbTransport" | "NodeUsbTransport";
type ConnectTrezorOptions = { address?: string };
type TrezorAccountRefTransaction = { details: Record<string, never>; hex: string; txid: string };
type ZcashSignableTransaction = PCZT | ZcashPSBT | ZcashTransaction;
type TrezorExtendedPublicKeyInfo = {
  accountIndex: number;
  chainCode?: string;
  depth?: number;
  fingerprint?: number;
  path: string;
  publicKey?: string;
  xpub: string;
  xpubSegwit?: string;
};

const TREZOR_CORE_MODES = new Set<TrezorCoreMode>(["auto", "iframe", "popup", "suite-desktop", "suite-web"]);
const TREZOR_TRANSPORTS = new Set<TrezorTransport>(["BridgeTransport", "WebUsbTransport", "NodeUsbTransport"]);
const DEFAULT_TREZOR_CORE_MODE: TrezorCoreMode = "auto";
const DEFAULT_TREZOR_MANIFEST = { appName: "SwapKit", appUrl: "https://swapkit.dev", email: "support@swapkit.dev" };
const DEFAULT_TREZOR_TRANSPORTS = ["WebUsbTransport" as const];
const TREZOR_KEEP_SESSION_PARAMS = { keepSession: true } as const;
const trezorXpubCache = new Map<string, TrezorExtendedPublicKeyInfo>();
let trezorSessionDispose: Promise<void> | undefined;
const EXTENDED_KEY_VERSION_CANDIDATES = [
  NETWORKS.bitcoin.bip32,
  NETWORKS.bitcoinCash.bip32,
  NETWORKS.dash.bip32,
  NETWORKS.dogecoin.bip32,
  NETWORKS.litecoin.bip32,
];

async function disconnectTrezorSession() {
  trezorXpubCache.clear();

  const dispose = (async () => {
    try {
      const TrezorConnect = (await import("@trezor/connect-web")).default;
      await TrezorConnect.dispose();
    } catch {
      // Ignore stale or already-disposed sessions.
    }
  })();

  trezorSessionDispose = dispose;
  await dispose;

  if (trezorSessionDispose === dispose) {
    trezorSessionDispose = undefined;
  }
}

function normalizeTrezorCoreMode(coreMode: unknown): TrezorCoreMode | undefined {
  return typeof coreMode === "string" && TREZOR_CORE_MODES.has(coreMode as TrezorCoreMode)
    ? (coreMode as TrezorCoreMode)
    : undefined;
}

function normalizeTrezorTransports(transports: unknown): TrezorTransport[] | undefined {
  if (!Array.isArray(transports)) return undefined;

  const normalized = transports.filter(
    (transport): transport is TrezorTransport =>
      typeof transport === "string" && TREZOR_TRANSPORTS.has(transport as TrezorTransport),
  );

  return normalized.length > 0 ? normalized : undefined;
}

function getTrezorManifestValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function getDefaultTrezorAppUrl() {
  return typeof globalThis.location !== "undefined" && globalThis.location.origin
    ? globalThis.location.origin
    : DEFAULT_TREZOR_MANIFEST.appUrl;
}

async function initTrezorConnect() {
  const TrezorConnect = (await import("@trezor/connect-web")).default;

  const trezorConfig = SKConfig.get("integrations").trezor as Record<string, unknown> | undefined;
  const {
    connectSrc,
    coreMode,
    debug,
    interactionTimeout,
    lazyLoad,
    pendingTransportEvent,
    popup,
    transportReconnect,
    transports,
    ...manifestConfig
  } = trezorConfig ?? {};
  const manifest = {
    ...manifestConfig,
    appName: getTrezorManifestValue(trezorConfig?.appName, DEFAULT_TREZOR_MANIFEST.appName),
    appUrl: getTrezorManifestValue(trezorConfig?.appUrl, getDefaultTrezorAppUrl()),
    email: getTrezorManifestValue(trezorConfig?.email, DEFAULT_TREZOR_MANIFEST.email),
  };
  const isLocalhost =
    typeof globalThis.location !== "undefined" && ["localhost", "127.0.0.1"].includes(globalThis.location.hostname);
  const resolvedCoreMode = normalizeTrezorCoreMode(coreMode) ?? DEFAULT_TREZOR_CORE_MODE;
  const resolvedTransports = normalizeTrezorTransports(transports) ?? DEFAULT_TREZOR_TRANSPORTS;

  if (trezorSessionDispose) {
    await trezorSessionDispose;
  }

  if (isLocalhost) {
    await TrezorConnect.dispose();
  }

  await TrezorConnect.init({
    connectSrc: connectSrc as string | undefined,
    coreMode: resolvedCoreMode,
    debug: debug as boolean | undefined,
    interactionTimeout: interactionTimeout as number | undefined,
    lazyLoad: (lazyLoad as boolean | undefined) ?? false,
    manifest,
    pendingTransportEvent: pendingTransportEvent as boolean | undefined,
    popup: (popup as boolean | undefined) ?? true,
    transportReconnect: transportReconnect as boolean | undefined,
    transports: resolvedTransports,
  });

  return { coreMode: resolvedCoreMode, isLocalhost, popup: (popup as boolean | undefined) ?? true, TrezorConnect };
}

export function normalizeTrezorExtendedPublicKey(xpub: string, chain: UTXOChain) {
  const targetVersions = getNetworkForChain(chain).bip32;
  const candidates = [
    targetVersions,
    ...EXTENDED_KEY_VERSION_CANDIDATES.filter(
      (versions) => versions.public !== targetVersions.public || versions.private !== targetVersions.private,
    ),
  ];
  let lastError: unknown;

  for (const versions of candidates) {
    try {
      const key = HDKey.fromExtendedKey(xpub, versions as Versions);
      if (!(key.publicKey && key.chainCode)) throw new Error("Extended key is missing public key data");

      return new HDKey({
        chainCode: key.chainCode,
        depth: key.depth,
        index: key.index,
        parentFingerprint: key.parentFingerprint,
        publicKey: key.publicKey,
        versions: targetVersions,
      }).publicExtendedKey;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to parse Trezor extended public key");
}

function tryNormalizeTrezorExtendedPublicKey(xpub: string | undefined, chain: UTXOChain) {
  if (!xpub) return undefined;

  try {
    return normalizeTrezorExtendedPublicKey(xpub, chain);
  } catch {
    return xpub;
  }
}

function decodeOpReturnData(script: Uint8Array): string | null {
  if (script.length < 2 || script[0] !== 0x6a) return null;
  const dataLen = script[1];
  if (dataLen === undefined || script.length < 2 + dataLen) return null;
  return Buffer.from(script.slice(2, 2 + dataLen)).toString("hex");
}

function getScriptType(derivationPath: DerivationPathArray) {
  switch (derivationPath[0]) {
    case 84:
      return { input: "SPENDWITNESS", output: "PAYTOWITNESS" } as const;
    case 49:
      return { input: "SPENDP2SHWITNESS", output: "PAYTOP2SHWITNESS" } as const;
    case 44:
      return { input: "SPENDADDRESS", output: "PAYTOADDRESS" } as const;
    default:
      return null;
  }
}

function hardenDerivationPath(derivationPath: DerivationPathArray): number[] {
  return derivationPath.map((pathElement, index) =>
    index < 3 ? ((pathElement as number) | 0x80000000) >>> 0 : (pathElement as number),
  );
}

function isTrezorBip32Derivation(value: unknown): value is TrezorBip32Derivation {
  return (
    Array.isArray(value) &&
    value[0] instanceof Uint8Array &&
    typeof value[1] === "object" &&
    value[1] !== null &&
    typeof (value[1] as { fingerprint?: unknown }).fingerprint === "number" &&
    Array.isArray((value[1] as { path?: unknown }).path)
  );
}

function getFirstBip32Derivation(input: { bip32Derivation?: unknown }): TrezorBip32Derivation | undefined {
  if (!Array.isArray(input.bip32Derivation)) return undefined;
  const [firstDerivation] = input.bip32Derivation;

  return isTrezorBip32Derivation(firstDerivation) ? firstDerivation : undefined;
}

function getPrevoutAmount(input: {
  index?: number;
  nonWitnessUtxo?: { outputs?: Array<{ amount?: bigint | number }> };
  witnessUtxo?: { amount?: bigint | number };
}) {
  if (input.witnessUtxo?.amount !== undefined) return input.witnessUtxo.amount.toString();

  const prevout = input.index !== undefined ? input.nonWitnessUtxo?.outputs?.[input.index] : undefined;
  if (prevout?.amount !== undefined) return prevout.amount.toString();

  return undefined;
}

export function normalizeTrezorSignature(signatureHex: string, chain: Chain) {
  const signature = Buffer.from(signatureHex, "hex");
  const derLength = signature[1] !== undefined ? signature[1] + 2 : undefined;

  if (derLength !== undefined && signature.length === derLength) {
    return new Uint8Array([...signature, chain === Chain.BitcoinCash ? BCHSigHash.ALL : 0x01]);
  }

  return new Uint8Array(signature);
}

function buildPCZTInputsForTrezor(
  pczt: PCZT,
  address_n: number[],
  hexEncode: { encode: (data: Uint8Array) => string },
) {
  const inputs = [];
  for (let i = 0; i < pczt.inputsLength; i++) {
    const input = pczt.getInput(i);
    inputs.push({
      address_n,
      amount: input.value.toString(),
      prev_hash: hexEncode.encode(input.txid),
      prev_index: input.index,
      script_type: "SPENDADDRESS" as const,
    });
  }
  return inputs;
}

async function buildPCZTOutputsForTrezor(pczt: PCZT, address_n: number[], myAddress: string, chain: Chain) {
  const outputs = [];
  for (let i = 0; i < pczt.outputsLength; i++) {
    const output = pczt.getOutput(i);
    const script = output.scriptPubkey;

    if (output.value === 0n && script?.length > 0 && script[0] === 0x6a) {
      const opReturnData = decodeOpReturnData(script);
      if (opReturnData) {
        outputs.push({ amount: "0", op_return_data: opReturnData, script_type: "PAYTOOPRETURN" as const });
        continue;
      }
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_sign_transaction",
        info: { chain, error: "Malformed OP_RETURN output cannot be signed" },
      });
    }

    const outputAddress = await decodeOutputAddress(script);

    if (!outputAddress && output.value > 0n) {
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_sign_transaction",
        info: { chain, error: "Unable to decode output address from scriptPubkey" },
      });
    }

    const isChangeAddress = outputAddress === myAddress;

    if (isChangeAddress) {
      outputs.push({ address_n, amount: output.value.toString(), script_type: "PAYTOADDRESS" as const });
    } else {
      outputs.push({ address: outputAddress, amount: output.value.toString(), script_type: "PAYTOADDRESS" as const });
    }
  }
  return outputs;
}

async function decodeOutputAddress(script: Uint8Array): Promise<string | undefined> {
  try {
    const { OutScript, Address } = await import("@swapkit/utxo-signer");
    const decoded = OutScript.decode(script);
    if (decoded.type === "pkh" || decoded.type === "pk") {
      return Address(NETWORKS.zcash).encode(decoded);
    }
  } catch {
    // ignore decode errors
  }
  return undefined;
}

async function extractSignaturesFromSignedTx(signedTxHex: string, pczt: PCZT): Promise<PCZT> {
  const { ZcashTransaction: ZcashTx, Script } = await import("@swapkit/utxo-signer");
  const signedTx = ZcashTx.fromHex(signedTxHex, { allowUnknownOutputs: true });
  const signedPczt = pczt.clone();

  for (let i = 0; i < signedTx.inputsLength; i++) {
    const signedInput = signedTx.getInput(i);
    const script = signedInput.script;
    if (script && script.length > 0) {
      const scriptParts = Script.decode(script);
      if (scriptParts.length >= 2) {
        signedPczt.addSignature(i, scriptParts[1] as Uint8Array, scriptParts[0] as Uint8Array);
      }
    }
  }
  return signedPczt;
}

function buildZcashTxInputsForTrezor(
  tx: ZcashTransaction,
  utxoInputs: UTXOType[],
  address_n: number[],
  hexEncode: { encode: (data: Uint8Array) => string },
) {
  const inputs = [];
  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    const utxoInfo = utxoInputs[i];
    inputs.push({
      address_n,
      amount: utxoInfo?.value?.toString() || input.value?.toString() || "0",
      prev_hash: input.txid ? hexEncode.encode(input.txid) : "",
      prev_index: input.index ?? 0,
      script_type: "SPENDADDRESS" as const,
    });
  }
  return inputs;
}

function buildZcashTxOutputsForTrezor(tx: ZcashTransaction, address_n: number[], myAddress: string, chain: Chain) {
  const outputs = [];
  for (let i = 0; i < tx.outputsLength; i++) {
    const output = tx.getOutput(i);
    const outputAddress = tx.getOutputAddress(i, NETWORKS.zcash);
    const script = output.script;

    if (output.amount === 0n && script?.length > 0 && script[0] === 0x6a) {
      const opReturnData = decodeOpReturnData(script);
      if (opReturnData) {
        outputs.push({ amount: "0", op_return_data: opReturnData, script_type: "PAYTOOPRETURN" as const });
        continue;
      }
      continue;
    }

    if (!outputAddress && (output.amount ?? 0n) > 0n) {
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_sign_transaction",
        info: { chain, error: "Unable to decode output address" },
      });
    }

    const isChangeAddress = outputAddress === myAddress;
    const outputParam = isChangeAddress || !outputAddress ? { address_n } : { address: outputAddress };
    outputs.push({ ...outputParam, amount: output.amount?.toString() || "0", script_type: "PAYTOADDRESS" as const });
  }
  return outputs;
}

function buildUtxoOutputsForTrezor(
  tx: Transaction,
  network: BTCNetwork,
  address_n: number[],
  myAddress: string,
  memo: string,
  chain: Chain,
  scriptType: { input: string; output: string },
  toCashAddress: (addr: string) => string,
  stripPrefix: (addr: string) => string,
) {
  const outputs: any[] = [];
  for (let i = 0; i < tx.outputsLength; i++) {
    const output = tx.getOutput(i);
    const outputAddress = tx.getOutputAddress(i, network);

    if (!outputAddress) {
      const opReturnData = output.script ? decodeOpReturnData(output.script) : null;
      if (opReturnData !== null || memo) {
        outputs.push({
          amount: "0",
          op_return_data: opReturnData ?? Buffer.from(memo).toString("hex"),
          script_type: "PAYTOOPRETURN",
        });
        continue;
      }

      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_sign_transaction",
        info: { chain, error: "Unable to decode output address from scriptPubkey" },
      });
    }

    if (output.amount === undefined) {
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_sign_transaction",
        info: { chain, error: "Output amount is missing" },
      });
    }

    const isBch = chain === Chain.BitcoinCash;
    const cashAddrWithPrefix = isBch ? toCashAddress(outputAddress) : outputAddress;
    const isChangeAddress = isBch
      ? stripPrefix(cashAddrWithPrefix) === stripPrefix(myAddress)
      : cashAddrWithPrefix === myAddress;

    outputs.push(
      isChangeAddress
        ? { address_n, amount: output.amount.toString(), script_type: scriptType.output }
        : { address: cashAddrWithPrefix, amount: output.amount.toString(), script_type: "PAYTOADDRESS" },
    );
  }
  return outputs;
}

function shouldUseTrezorPsbtSigner(chain: Chain) {
  return chain === Chain.Bitcoin || chain === Chain.Litecoin;
}

function shouldUseTrezorSerializedSigner(chain: Chain) {
  return chain === Chain.BitcoinCash || chain === Chain.Dash || chain === Chain.Dogecoin;
}

function buildTrezorRefTxs(chain: Chain, inputs: UTXOType[]): TrezorAccountRefTransaction[] | undefined {
  if (chain !== Chain.Dash) return undefined;

  const refs = new Map<string, TrezorAccountRefTransaction>();

  for (const input of inputs) {
    if (!input.txHex) {
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_sign_transaction",
        info: { chain, error: `Missing previous transaction hex for ${input.hash}:${input.index}` },
      });
    }

    refs.set(input.hash, { details: {}, hex: input.txHex, txid: input.hash });
  }

  return [...refs.values()];
}

async function getTrezorWallet<T extends Chain>({
  address: providedAddress,
  chain,
  derivationPath,
}: {
  address?: string;
  chain: T;
  derivationPath: DerivationPathArray;
}) {
  switch (chain) {
    case Chain.Arbitrum:
    case Chain.Aurora:
    case Chain.Avalanche:
    case Chain.Base:
    case Chain.Berachain:
    case Chain.BinanceSmartChain:
    case Chain.Ethereum:
    case Chain.Gnosis:
    case Chain.Monad:
    case Chain.Optimism:
    case Chain.Polygon:
    case Chain.XLayer: {
      const { getProvider, getEvmToolboxAsync } = await import("@swapkit/toolboxes/evm");
      const { getEVMSigner } = await import("./evmSigner");

      const provider = await getProvider(chain);
      const signer = await getEVMSigner({ chain, derivationPath, provider });
      const address = await signer.getAddress();
      const toolbox = await getEvmToolboxAsync(chain, { provider, signer });

      return { ...toolbox, address };
    }

    case Chain.Zcash: {
      const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");

      const derivationPathStr = derivationPathToString(derivationPath);

      const getAddress = async () => {
        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const { success, payload } = await TrezorConnect.getAddress({ coin: "zcash", path: derivationPathStr });

        if (!success) {
          throw new SwapKitError({
            errorKey: "wallet_trezor_failed_to_get_address",
            info: { chain, error: (payload as { error: string; code?: string }).error || "Unknown error" },
          });
        }

        return payload.address;
      };

      const address = providedAddress ?? (await getAddress());

      const signPCZTWithSerializedTx = async (pczt: PCZT) => {
        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const { hex: hexEncode } = await import("@scure/base");
        const address_n = hardenDerivationPath(derivationPath);
        const global = pczt.getGlobal();

        const inputs = buildPCZTInputsForTrezor(pczt, address_n, hexEncode);
        const outputs = await buildPCZTOutputsForTrezor(pczt, address_n, address, chain);
        const result = await TrezorConnect.signTransaction({
          branchId: global.consensusBranchId,
          coin: "zcash",
          expiry: global.expiryHeight,
          inputs,
          locktime: global.lockTime,
          outputs: outputs as any,
          overwintered: true,
          version: global.txVersion,
          versionGroupId: global.versionGroupId,
        });

        if (!result.success) {
          throw new SwapKitError({
            errorKey: "wallet_trezor_failed_to_sign_transaction",
            info: { chain, error: (result.payload as { error: string; code?: string }).error },
          });
        }

        return {
          serializedTx: result.payload.serializedTx,
          signedPczt: await extractSignaturesFromSignedTx(result.payload.serializedTx, pczt),
        };
      };

      const parseSignedZcashTransaction = async (signedTxHex: string) => {
        const { ZcashTransaction: ZcashTx } = await import("@swapkit/utxo-signer");
        return ZcashTx.fromHex(signedTxHex, { allowUnknownOutputs: true });
      };

      const signZcashTransactionWithSerializedTx = async (tx: ZcashTransaction) => {
        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const { hex: hexEncode } = await import("@scure/base");
        const address_n = hardenDerivationPath(derivationPath);

        const inputs = buildZcashTxInputsForTrezor(tx, [], address_n, hexEncode);
        const outputs = buildZcashTxOutputsForTrezor(tx, address_n, address, chain);

        const result = await TrezorConnect.signTransaction({
          branchId: tx.consensusBranchId,
          coin: "zcash",
          expiry: 0,
          inputs,
          locktime: 0,
          outputs: outputs as any,
          overwintered: true,
          version: 4,
          versionGroupId: ZcashVersionGroupId.SAPLING,
        });

        if (result.success) {
          return {
            serializedTx: result.payload.serializedTx,
            signedTx: await parseSignedZcashTransaction(result.payload.serializedTx),
          };
        }

        throw new SwapKitError({
          errorKey: "wallet_trezor_failed_to_sign_transaction",
          info: { chain, error: (result.payload as { error: string; code?: string }).error },
        });
      };

      const signer = {
        getAddress: async () => address,

        signPCZT: async (pczt: PCZT): Promise<PCZT> => {
          return (await signPCZTWithSerializedTx(pczt)).signedPczt;
        },

        signTransaction: async (tx: ZcashSignableTransaction): Promise<ZcashTransaction> => {
          if ("toPCZT" in tx) {
            const { serializedTx } = await signPCZTWithSerializedTx(tx.toPCZT());
            return parseSignedZcashTransaction(serializedTx);
          }

          if ("getGlobal" in tx) {
            const { serializedTx } = await signPCZTWithSerializedTx(tx);
            return parseSignedZcashTransaction(serializedTx);
          }

          return (await signZcashTransactionWithSerializedTx(tx)).signedTx;
        },
      };

      const toolbox = getUtxoToolbox(Chain.Zcash, { signer });

      const signAndBroadcastTransaction = async (tx: ZcashSignableTransaction) => {
        if ("toPCZT" in tx) {
          const { serializedTx } = await signPCZTWithSerializedTx(tx.toPCZT());
          return toolbox.broadcastTx(serializedTx);
        }

        if ("getGlobal" in tx) {
          const { serializedTx } = await signPCZTWithSerializedTx(tx);
          return toolbox.broadcastTx(serializedTx);
        }

        const { serializedTx } = await signZcashTransactionWithSerializedTx(tx);
        return toolbox.broadcastTx(serializedTx);
      };

      const transfer = async ({ recipient, feeOptionKey, feeRate: paramFeeRate, ...rest }: GenericTransferParams) => {
        if (!(address && recipient)) {
          throw new SwapKitError({
            errorKey: "wallet_missing_params",
            info: { address, recipient, wallet: WalletOption.TREZOR },
          });
        }

        const feeRate = paramFeeRate || (await toolbox.getFeeRates())[feeOptionKey || FeeOption.Fast];
        const { tx } = await toolbox.createTransaction({
          ...rest,
          feeRate,
          fetchTxHex: false,
          recipient,
          sender: address,
        });
        const { serializedTx } = await signZcashTransactionWithSerializedTx(tx);

        return toolbox.broadcastTx(serializedTx);
      };

      return { ...toolbox, address, signAndBroadcastTransaction, signPCZT: signer.signPCZT, transfer };
    }

    case Chain.Bitcoin:
    case Chain.BitcoinCash:
    case Chain.Dash:
    case Chain.Dogecoin:
    case Chain.Litecoin: {
      const { toCashAddress, getUtxoToolbox, stripPrefix } = await import("@swapkit/toolboxes/utxo");
      const utxoChain = chain as UTXOChain;
      const scriptType = getScriptType(derivationPath);

      if (!scriptType) {
        throw new SwapKitError({ errorKey: "wallet_trezor_derivation_path_not_supported", info: { derivationPath } });
      }

      const resolvedScriptType = scriptType;
      const coin = chain.toLowerCase();

      const getAddress = async (path: DerivationPathArray = derivationPath) => {
        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const pathString = derivationPathToString(path);
        const { success, payload } = await TrezorConnect.getAddress({
          coin,
          ...TREZOR_KEEP_SESSION_PARAMS,
          path: pathString,
          showOnTrezor: false,
        });

        if (!success) {
          throw new SwapKitError({
            errorKey: "wallet_trezor_failed_to_get_address",
            info: { chain, error: (payload as { error: string; code?: string }).error || "Unknown error" },
          });
        }

        if (chain === Chain.BitcoinCash) {
          return stripPrefix(payload.address);
        }

        return payload.address;
      };

      const address = providedAddress ?? (await getAddress());
      const baseToolbox = getUtxoToolbox(chain);

      const signTransaction = async (tx: Transaction, inputs: UTXOType[], memo = "") => {
        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const address_n = hardenDerivationPath(derivationPath);
        const network = getNetworkForChain(chain as UTXOChain);

        const outputs = buildUtxoOutputsForTrezor(
          tx,
          network,
          address_n,
          address,
          memo,
          chain,
          resolvedScriptType,
          toCashAddress,
          stripPrefix,
        );

        const trezorInputs = inputs.map(({ hash, index, value }) => ({
          address_n,
          amount: value,
          prev_hash: hash,
          prev_index: index,
          script_type: resolvedScriptType.input,
        }));

        const result = await TrezorConnect.signTransaction({
          coin,
          inputs: trezorInputs,
          outputs,
          refTxs: buildTrezorRefTxs(chain, inputs) as never,
        });

        if (result.success) {
          return result.payload.serializedTx;
        }

        const payload = result.payload as { error?: string; code?: string };
        throw new SwapKitError({
          errorKey: "wallet_trezor_failed_to_sign_transaction",
          info: { chain, code: payload?.code ?? "unknown", error: payload?.error ?? "unknown", payload },
        });
      };

      const signPsbtTransaction = async (tx: Transaction): Promise<Transaction> => {
        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const { hex: hexEncode } = await import("@scure/base");
        const address_n = hardenDerivationPath(derivationPath);
        const network = getNetworkForChain(chain as UTXOChain);
        let fallbackPublicKey: Uint8Array | undefined;

        async function getFallbackDerivation(): Promise<TrezorBip32Derivation> {
          if (!fallbackPublicKey) {
            const accountInfo = await getExtendedPublicKeyInfo();
            const accountKey = HDKey.fromExtendedKey(accountInfo.xpub, network.bip32);
            const leaf = accountKey.derive(`m/${Number(derivationPath[3] ?? 0)}/${Number(derivationPath[4] ?? 0)}`);

            if (!leaf.publicKey) {
              throw new SwapKitError({
                errorKey: "wallet_trezor_failed_to_get_public_key",
                info: { chain, error: "Unable to derive Trezor leaf public key from account xpub" },
              });
            }

            fallbackPublicKey = leaf.publicKey;
          }

          return [fallbackPublicKey, { fingerprint: 0, path: address_n }];
        }

        const signerPubkeys: Uint8Array[] = [];
        const trezorInputs = [];

        for (let inputIndex = 0; inputIndex < tx.inputsLength; inputIndex++) {
          const input = tx.getInput(inputIndex);
          const existingDerivation = getFirstBip32Derivation(input);
          const derivation = existingDerivation ?? (await getFallbackDerivation());
          const amount = getPrevoutAmount(input);

          if (!input.txid || input.index === undefined || !amount) {
            throw new SwapKitError({
              errorKey: "wallet_trezor_failed_to_sign_transaction",
              info: { chain, error: `Input ${inputIndex} is missing prevout data required by Trezor` },
            });
          }

          signerPubkeys[inputIndex] = derivation[0];

          if (!existingDerivation) {
            tx.updateInput(inputIndex, { bip32Derivation: [derivation] });
          }

          trezorInputs.push({
            address_n: derivation[1].path,
            amount,
            prev_hash: hexEncode.encode(input.txid),
            prev_index: input.index,
            script_type: resolvedScriptType.input,
            ...(input.sequence !== undefined ? { sequence: input.sequence } : {}),
          });
        }

        const outputs = buildUtxoOutputsForTrezor(
          tx,
          network,
          address_n,
          address,
          "",
          chain,
          resolvedScriptType,
          toCashAddress,
          stripPrefix,
        );

        const result = await TrezorConnect.signTransaction({
          coin,
          ...TREZOR_KEEP_SESSION_PARAMS,
          inputs: trezorInputs,
          locktime: tx.lockTime,
          outputs,
          version: tx.version,
        });

        if (!result.success) {
          const payload = result.payload as { error?: string; code?: string };
          throw new SwapKitError({
            errorKey: "wallet_trezor_failed_to_sign_transaction",
            info: { chain, code: payload?.code ?? "unknown", error: payload?.error ?? "unknown", payload },
          });
        }

        result.payload.signatures.forEach((signatureHex, inputIndex) => {
          const pubkey = signerPubkeys[inputIndex];
          if (!(signatureHex && pubkey)) return;

          tx.updateInput(inputIndex, { partialSig: [[pubkey, normalizeTrezorSignature(signatureHex, chain)]] });
        });

        return tx;
      };

      const signSerializedTransaction = async (tx: Transaction) => {
        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const { hex: hexEncode } = await import("@scure/base");
        const address_n = hardenDerivationPath(derivationPath);
        const network = getNetworkForChain(chain as UTXOChain);

        const trezorInputs = [];
        for (let inputIndex = 0; inputIndex < tx.inputsLength; inputIndex++) {
          const input = tx.getInput(inputIndex);
          const amount = getPrevoutAmount(input);

          if (!input.txid || input.index === undefined || !amount) {
            throw new SwapKitError({
              errorKey: "wallet_trezor_failed_to_sign_transaction",
              info: { chain, error: `Input ${inputIndex} is missing prevout data required by Trezor` },
            });
          }

          trezorInputs.push({
            address_n,
            amount,
            prev_hash: hexEncode.encode(input.txid),
            prev_index: input.index,
            script_type: resolvedScriptType.input,
            ...(input.sequence !== undefined ? { sequence: input.sequence } : {}),
          });
        }

        const outputs = buildUtxoOutputsForTrezor(
          tx,
          network,
          address_n,
          address,
          "",
          chain,
          resolvedScriptType,
          toCashAddress,
          stripPrefix,
        );

        const result = await TrezorConnect.signTransaction({
          coin,
          inputs: trezorInputs,
          locktime: tx.lockTime,
          outputs,
          version: tx.version,
        });

        if (result.success) {
          return result.payload.serializedTx;
        }

        const payload = result.payload as { error?: string; code?: string };
        throw new SwapKitError({
          errorKey: "wallet_trezor_failed_to_sign_transaction",
          info: { chain, code: payload?.code ?? "unknown", error: payload?.error ?? "unknown", payload },
        });
      };

      const signTransactionWithMultipleInputs = async (
        tx: Transaction,
        inputs: Array<{
          derivationIndex: number;
          hash: string;
          index: number;
          isChange: boolean;
          txHex?: string;
          value: number;
        }>,
        memo = "",
      ) => {
        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const network = getNetworkForChain(chain as UTXOChain);
        const baseAddressN = hardenDerivationPath(derivationPath.slice(0, 3) as DerivationPathArray);

        const outputs = buildUtxoOutputsForTrezor(
          tx,
          network,
          baseAddressN,
          address,
          memo,
          chain,
          resolvedScriptType,
          toCashAddress,
          stripPrefix,
        );

        const trezorInputs = inputs.map(({ hash, index: inputIndex, value, derivationIndex, isChange }) => {
          const changePath = isChange ? 1 : 0;
          const inputAddressN = [...baseAddressN, changePath, derivationIndex];
          return {
            address_n: inputAddressN,
            amount: value,
            prev_hash: hash,
            prev_index: inputIndex,
            script_type: resolvedScriptType.input,
          };
        });

        const result = await TrezorConnect.signTransaction({
          coin,
          inputs: trezorInputs,
          outputs,
          refTxs: buildTrezorRefTxs(chain, inputs) as never,
        });

        if (result.success) {
          return result.payload.serializedTx;
        }

        throw new SwapKitError({
          errorKey: "wallet_trezor_failed_to_sign_transaction",
          info: { chain, error: (result.payload as { error: string; code?: string }).error },
        });
      };

      const transferFromMultipleAddresses = async ({
        utxos,
        recipient,
        assetValue,
        memo,
        feeRate,
        feeOptionKey,
      }: {
        utxos: Array<{
          hash: string;
          index: number;
          value: number;
          txHex?: string;
          derivationIndex: number;
          isChange: boolean;
          address: string;
        }>;
        recipient: string;
        assetValue: { getBaseValue: (unit: string) => number; chain: string };
        memo?: string;
        feeRate?: number;
        feeOptionKey?: (typeof FeeOption)[keyof typeof FeeOption];
      }) => {
        const toolbox = getUtxoToolbox(chain);
        const txFeeRate = feeRate || (await toolbox.getFeeRates())[feeOptionKey || FeeOption.Fast];

        const { tx, inputs: selectedInputs } = await toolbox.createTransaction({
          assetValue: assetValue as any,
          feeRate: txFeeRate,
          fetchTxHex: chain === Chain.Dash,
          memo,
          recipient,
          sender: address,
        });

        const inputsWithDerivation = selectedInputs.map((input: { hash: string; index: number; value: number }) => {
          const utxoInfo = utxos.find((u) => u.hash === input.hash && u.index === input.index);
          return {
            ...input,
            derivationIndex: utxoInfo?.derivationIndex ?? 0,
            isChange: utxoInfo?.isChange ?? false,
            txHex: utxoInfo?.txHex,
          };
        });

        const signedTxHex = await signTransactionWithMultipleInputs(tx as Transaction, inputsWithDerivation, memo);
        return toolbox.broadcastTx(signedTxHex);
      };

      const transfer = async ({
        recipient,
        feeOptionKey,
        feeRate: paramFeeRate,
        memo,
        ...rest
      }: GenericTransferParams) => {
        if (!(address && recipient)) {
          throw new SwapKitError({
            errorKey: "wallet_missing_params",
            info: { address, memo, recipient, wallet: WalletOption.TREZOR },
          });
        }

        const toolbox = getUtxoToolbox(chain);

        const feeRate = paramFeeRate || (await toolbox.getFeeRates())[feeOptionKey || FeeOption.Fast];

        const createTxMethod = (toolbox as UTXOToolboxes["BTC"]).createTransaction;

        const { tx, inputs } = await createTxMethod({
          ...rest,
          feeRate,
          fetchTxHex: chain === Chain.Dash,
          memo,
          recipient,
          sender: address,
        });

        const signedTxHex = await signTransaction(tx, inputs, memo);
        const txHash = await toolbox.broadcastTx(signedTxHex);

        return txHash;
      };

      const toolbox = shouldUseTrezorPsbtSigner(chain)
        ? await getUtxoToolbox(utxoChain, {
            signer: { getAddress: async () => address, signTransaction: signPsbtTransaction },
          })
        : baseToolbox;

      const signAndBroadcastTransaction = shouldUseTrezorSerializedSigner(chain)
        ? async (tx: Transaction) => baseToolbox.broadcastTx(await signSerializedTransaction(tx))
        : toolbox.signAndBroadcastTransaction;
      const walletSignTransaction = shouldUseTrezorPsbtSigner(chain) ? toolbox.signTransaction : signTransaction;
      const walletTransfer = shouldUseTrezorPsbtSigner(chain) ? toolbox.transfer : transfer;

      async function getExtendedPublicKeyInfo({ accountIndex }: { accountIndex?: number } = {}) {
        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const resolvedAccountPath = getUTXOAccountPath({ accountIndex, chain: utxoChain, derivationPath });
        const path = derivationPathToString(resolvedAccountPath);
        const cacheKey = `${chain}:${path}`;
        const cached = trezorXpubCache.get(cacheKey);
        if (cached) return cached;

        const result = await TrezorConnect.getPublicKey({ coin, path });
        const { success, payload } = result;

        if (!success) {
          throw new SwapKitError({
            errorKey: "wallet_trezor_failed_to_get_public_key",
            info: { chain, error: (payload as { error: string; code?: string }).error || "Unknown error" },
          });
        }

        const xpub = normalizeTrezorExtendedPublicKey(payload.xpub, utxoChain);
        const xpubSegwit = tryNormalizeTrezorExtendedPublicKey(payload.xpubSegwit, utxoChain);
        const info = {
          accountIndex: getUTXOAccountIndexFromPath(resolvedAccountPath),
          chainCode: payload.chainCode,
          depth: payload.depth,
          fingerprint: payload.fingerprint,
          path: payload.serializedPath,
          publicKey: payload.publicKey,
          xpub,
          xpubSegwit,
        };

        trezorXpubCache.set(cacheKey, info);
        return info;
      }

      function getExtendedPublicKey(params: { accountIndex?: number } = {}) {
        return getExtendedPublicKeyInfo(params);
      }

      async function deriveAddressAtIndex({
        accountIndex,
        index,
        change = false,
      }: {
        accountIndex?: number;
        index: number;
        change?: boolean;
      }) {
        assertDerivationIndex("index", index);

        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const resolvedAccountPath = getUTXOAccountPath({ accountIndex, chain: utxoChain, derivationPath });
        const fullPath = `${derivationPathToString(resolvedAccountPath)}/${Number(change)}/${index}`;

        const { success, payload } = await TrezorConnect.getAddress({
          coin,
          ...TREZOR_KEEP_SESSION_PARAMS,
          path: fullPath,
          showOnTrezor: false,
        });

        if (!success) {
          return undefined;
        }

        let finalAddress = payload.address;
        if (chain === Chain.BitcoinCash) {
          const bchToolbox = await getUtxoToolbox(chain as typeof Chain.BitcoinCash);
          finalAddress = bchToolbox.stripPrefix(payload.address);
        }

        const pubKeyResult = await TrezorConnect.getPublicKey({
          coin,
          ...TREZOR_KEEP_SESSION_PARAMS,
          path: fullPath,
          scriptType: resolvedScriptType.input,
          showOnTrezor: false,
        });
        const pubkey = pubKeyResult.success ? pubKeyResult.payload.publicKey : "";

        return {
          accountIndex: getUTXOAccountIndexFromPath(resolvedAccountPath),
          address: finalAddress,
          change,
          index,
          path: fullPath,
          pubkey,
        };
      }

      async function deriveAddressesBatch({
        accountIndex,
        count,
        startIndex = 0,
        change = false,
      }: {
        accountIndex?: number;
        count: number;
        startIndex?: number;
        change?: boolean;
      }) {
        assertDerivationIndex("count", count);
        assertDerivationIndex("startIndex", startIndex);

        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const resolvedAccountPath = getUTXOAccountPath({ accountIndex, chain: utxoChain, derivationPath });
        const accountPath = derivationPathToString(resolvedAccountPath);

        const paths = Array.from({ length: count }, (_, i) => ({
          coin,
          path: `${accountPath}/${Number(change)}/${startIndex + i}`,
          showOnTrezor: false,
        }));

        const { success, payload } = await TrezorConnect.getAddress({ ...TREZOR_KEEP_SESSION_PARAMS, bundle: paths });

        if (!success || !Array.isArray(payload)) {
          return [];
        }

        const addresses = await Promise.all(
          payload.map(async (result, i) => {
            let finalAddress = result.address;
            if (chain === Chain.BitcoinCash) {
              const bchToolbox = await getUtxoToolbox(chain as typeof Chain.BitcoinCash);
              finalAddress = bchToolbox.stripPrefix(result.address);
            }

            return {
              accountIndex: getUTXOAccountIndexFromPath(resolvedAccountPath),
              address: finalAddress,
              change,
              index: startIndex + i,
              path: `${accountPath}/${Number(change)}/${startIndex + i}`,
              pubkey: "",
            };
          }),
        );

        return addresses;
      }

      const hdHelpers = createHDWalletHelpers({
        chain,
        deriveAddress: deriveAddressAtIndex,
        getBalance: toolbox.getBalance,
        getUtxos: (addr: string) => getUtxoApi(chain).getUtxos({ address: addr, fetchTxHex: true }),
      });

      return {
        ...toolbox,
        ...hdHelpers,
        address,
        deriveAddressAtIndex,
        deriveAddresses: deriveAddressesBatch,
        getExtendedPublicKey,
        getExtendedPublicKeyInfo,
        signAndBroadcastTransaction,
        signTransaction: walletSignTransaction,
        signTransactionWithMultipleInputs,
        transfer: walletTransfer,
        transferFromMultipleAddresses,
      };
    }

    default:
      throw new SwapKitError({ errorKey: "wallet_chain_not_supported", info: { chain, wallet: WalletOption.TREZOR } });
  }
}

export async function getTrezorExtendedPublicKey(
  chain: Chain,
  derivationPath?: DerivationPathArray,
  { accountIndex }: { accountIndex?: number } = {},
): Promise<HardwareExtendedPublicKeyInfo | undefined> {
  if (![Chain.BitcoinCash, Chain.Bitcoin, Chain.Dash, Chain.Dogecoin, Chain.Litecoin, Chain.Zcash].includes(chain)) {
    throw new SwapKitError({ errorKey: "wallet_chain_not_supported", info: { chain, wallet: WalletOption.TREZOR } });
  }

  const { TrezorConnect } = await initTrezorConnect();
  const utxoChain = chain as UTXOChain;
  const resolvedDerivationPath = derivationPath ?? (NetworkDerivationPath[chain] as DerivationPathArray);
  const coin = chain === Chain.Zcash ? "zcash" : chain.toLowerCase();

  const resolvedAccountPath = getUTXOAccountPath({
    accountIndex,
    chain: utxoChain,
    derivationPath: resolvedDerivationPath,
  });
  const path = derivationPathToString(resolvedAccountPath);
  const cacheKey = `${chain}:${path}`;
  const cached = trezorXpubCache.get(cacheKey);
  if (cached) return cached;

  const { success, payload } = await TrezorConnect.getPublicKey({ coin, path, showOnTrezor: true });

  if (!success) {
    throw new SwapKitError({
      errorKey: "wallet_trezor_failed_to_get_public_key",
      info: { chain, error: (payload as { error: string; code?: string }).error || "Unknown error" },
    });
  }

  const info = {
    accountIndex: getUTXOAccountIndexFromPath(resolvedAccountPath),
    chainCode: payload.chainCode,
    depth: payload.depth,
    fingerprint: payload.fingerprint,
    path: payload.serializedPath,
    publicKey: payload.publicKey,
    xpub: normalizeTrezorExtendedPublicKey(payload.xpub, utxoChain),
    xpubSegwit: tryNormalizeTrezorExtendedPublicKey(payload.xpubSegwit, utxoChain),
  };

  trezorXpubCache.set(cacheKey, info);
  return info;
}

export const trezorWallet = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectTrezor(
      chains: Chain[],
      derivationPath: DerivationPathArray,
      { address }: ConnectTrezorOptions = {},
    ) {
      const [chain] = filterSupportedChains({ chains, supportedChains, walletType });
      if (!chain) {
        throw new SwapKitError({
          errorKey: "wallet_chain_not_supported",
          info: { chain, wallet: WalletOption.TREZOR },
        });
      }

      const TrezorConnect = (await import("@trezor/connect-web")).default;

      const trezorConfig = SKConfig.get("integrations").trezor as Record<string, unknown> | undefined;
      const {
        connectSrc,
        coreMode,
        debug,
        interactionTimeout,
        lazyLoad,
        pendingTransportEvent,
        popup,
        transportReconnect,
        transports,
        ...manifestConfig
      } = trezorConfig ?? {};
      const manifest = {
        ...manifestConfig,
        appName: getTrezorManifestValue(trezorConfig?.appName, DEFAULT_TREZOR_MANIFEST.appName),
        appUrl: getTrezorManifestValue(trezorConfig?.appUrl, getDefaultTrezorAppUrl()),
        email: getTrezorManifestValue(trezorConfig?.email, DEFAULT_TREZOR_MANIFEST.email),
      };
      const isLocalhost =
        typeof globalThis.location !== "undefined" && ["localhost", "127.0.0.1"].includes(globalThis.location.hostname);
      const resolvedCoreMode = normalizeTrezorCoreMode(coreMode) ?? DEFAULT_TREZOR_CORE_MODE;
      const resolvedTransports = normalizeTrezorTransports(transports) ?? DEFAULT_TREZOR_TRANSPORTS;

      if (trezorSessionDispose) {
        await trezorSessionDispose;
      }

      if (isLocalhost) {
        await TrezorConnect.dispose();
      }

      await TrezorConnect.init({
        connectSrc: connectSrc as string | undefined,
        coreMode: resolvedCoreMode,
        debug: debug as boolean | undefined,
        interactionTimeout: interactionTimeout as number | undefined,
        lazyLoad: (lazyLoad as boolean | undefined) ?? false,
        manifest,
        pendingTransportEvent: pendingTransportEvent as boolean | undefined,
        popup: (popup as boolean | undefined) ?? true,
        transportReconnect: transportReconnect as boolean | undefined,
        transports: resolvedTransports,
      });

      const wallet = await getTrezorWallet({ address, chain, derivationPath });

      addChain({ ...wallet, chain, disconnect: disconnectTrezorSession, walletType });

      return true;
    },
  directSigningSupport: {
    [Chain.Arbitrum]: true,
    [Chain.Aurora]: true,
    [Chain.Avalanche]: true,
    [Chain.Base]: true,
    [Chain.Berachain]: true,
    [Chain.BinanceSmartChain]: true,
    [Chain.Bitcoin]: true,
    [Chain.BitcoinCash]: true,
    [Chain.Dash]: true,
    [Chain.Ethereum]: true,
    [Chain.Gnosis]: true,
    [Chain.Dogecoin]: true,
    [Chain.Litecoin]: true,
    [Chain.Monad]: true,
    [Chain.Optimism]: true,
    [Chain.Polygon]: true,
    [Chain.XLayer]: true,
    [Chain.Zcash]: true,
  },
  getExtendedPublicKey: getTrezorExtendedPublicKey,
  name: "connectTrezor",
  supportedChains: [
    Chain.Arbitrum,
    Chain.Aurora,
    Chain.Avalanche,
    Chain.Base,
    Chain.Berachain,
    Chain.BinanceSmartChain,
    Chain.Bitcoin,
    Chain.BitcoinCash,
    Chain.Dash,
    Chain.Dogecoin,
    Chain.Ethereum,
    Chain.Gnosis,
    Chain.Litecoin,
    Chain.Monad,
    Chain.Optimism,
    Chain.Polygon,
    Chain.XLayer,
    Chain.Zcash,
  ],
  walletType: WalletOption.TREZOR,
});

export const TREZOR_SUPPORTED_CHAINS = getWalletSupportedChains(trezorWallet);
