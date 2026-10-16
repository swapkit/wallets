import type {
  Ada,
  AssetGroup,
  BIP32Path,
  ExtendedPublicKey,
  SignedTransactionData,
  SignTransactionRequest,
  TxInput,
  TxOutput,
  TxOutputDestination,
} from "@cardano-foundation/ledgerjs-hw-app-cardano";
import type { UserInteractionRequired } from "@ledgerhq/device-management-kit";
import type Transport from "@ledgerhq/hw-transport";
import { hex } from "@scure/base";
import { Chain, type DerivationPathArray, NetworkDerivationPath, SwapKitError } from "@swapkit/helpers";

import {
  LEDGER_USER_INTERACTION_REQUIRED,
  type LedgerJsClientParams,
  normalizeLedgerJsClientParams,
  runLedgerJsOperation,
} from "../helpers/ledgerJsDmkBridge";

export type CardanoLedgerModule = typeof import("@cardano-foundation/ledgerjs-hw-app-cardano");
export type CardanoLedgerAddressParams = { address: string; paymentPath: BIP32Path; stakingPath: BIP32Path };

type CardanoLedgerParams = LedgerJsClientParams<DerivationPathArray>;

const BODY = { AUXILIARY_DATA_HASH: 7, FEE: 2, INPUTS: 0, OUTPUTS: 1, TTL: 3, VALIDITY_INTERVAL_START: 8 } as const;
const SET_TAG = 258;

function notSupported(reason: string) {
  return new SwapKitError("wallet_ledger_method_not_supported", { chain: Chain.Cardano, reason });
}

function toUint(value: unknown, field: string) {
  const isBigNumber = typeof value === "object" && value !== null && "toFixed" in value;
  const text = isBigNumber || Number.isSafeInteger(value) ? String((value as number).toFixed()) : "";
  if (!/^\d+$/.test(text)) throw notSupported(`Invalid ${field} in Cardano transaction`);
  return text;
}

function toTokenBundle(multiAsset: unknown): AssetGroup[] {
  if (!(multiAsset instanceof Map)) throw notSupported("Invalid Cardano output value");

  return [...(multiAsset as Map<Uint8Array, Map<Uint8Array, unknown>>)].map(([policyId, assets]) => ({
    policyIdHex: hex.encode(policyId),
    tokens: [...assets].map(([assetName, amount]) => ({
      amount: toUint(amount, "token amount"),
      assetNameHex: hex.encode(assetName),
    })),
  }));
}

async function toLedgerOutput(
  output: unknown,
  own: CardanoLedgerAddressParams,
  { AddressType, TxOutputDestinationType, TxOutputFormat }: CardanoLedgerModule,
): Promise<TxOutput> {
  const { getCardanoAddressFromBytes } = await import("@swapkit/toolboxes/cardano");
  let address: unknown;
  let value: unknown;
  let format: TxOutput["format"];

  if (Array.isArray(output)) {
    if (output.length !== 2) throw notSupported("Ledger cannot sign Cardano outputs with a datum");
    [address, value] = output;
    format = TxOutputFormat.ARRAY_LEGACY;
  } else if (output instanceof Map) {
    if (output.has(2)) throw notSupported("Ledger cannot sign Cardano outputs with a datum");
    if (output.has(3)) throw notSupported("Ledger cannot sign Cardano outputs with a reference script");
    if ([...output.keys()].some((key) => key !== 0 && key !== 1)) {
      throw notSupported("Unsupported field in Cardano output");
    }
    address = output.get(0);
    value = output.get(1);
    format = TxOutputFormat.MAP_BABBAGE;
  } else {
    throw notSupported("Invalid Cardano output");
  }

  if (!(address instanceof Uint8Array)) throw notSupported("Invalid Cardano output address");
  if (Array.isArray(value) && value.length !== 2) throw notSupported("Invalid Cardano output value");
  const [coin, multiAsset] = Array.isArray(value) ? value : [value];
  const outputAddress = await getCardanoAddressFromBytes(address);
  const destination: TxOutputDestination =
    outputAddress === own.address
      ? {
          params: {
            params: { spendingPath: own.paymentPath, stakingPath: own.stakingPath },
            type: AddressType.BASE_PAYMENT_KEY_STAKE_KEY,
          },
          type: TxOutputDestinationType.DEVICE_OWNED,
        }
      : { params: { addressHex: hex.encode(address) }, type: TxOutputDestinationType.THIRD_PARTY };

  return {
    amount: toUint(coin, "output amount"),
    destination,
    format,
    ...(multiAsset === undefined ? {} : { tokenBundle: toTokenBundle(multiAsset) }),
  } as TxOutput;
}

function toLedgerInputs(inputs: unknown, path: BIP32Path) {
  const isTagged =
    typeof inputs === "object" && inputs !== null && "tag" in inputs && inputs.tag === SET_TAG && "value" in inputs;
  const list = isTagged ? inputs.value : inputs;
  if (!Array.isArray(list)) throw notSupported("Invalid Cardano inputs");

  const ledgerInputs: TxInput[] = list.map((input: unknown) => {
    if (!Array.isArray(input) || input.length !== 2) throw notSupported("Invalid Cardano input");
    const [txHash, index] = input as [Uint8Array, unknown];
    return { outputIndex: Number(toUint(index, "input index")), path, txHashHex: hex.encode(txHash) };
  });

  return { inputs: ledgerInputs, tagCborSets: isTagged };
}

export async function toLedgerCardanoTransaction(
  txHex: string,
  own: CardanoLedgerAddressParams,
  ledgerModule: CardanoLedgerModule,
): Promise<SignTransactionRequest> {
  const { decodeCardanoTransaction } = await import("@swapkit/toolboxes/cardano");
  const { Networks, TransactionSigningMode, TxAuxiliaryDataType } = ledgerModule;
  const { body } = await decodeCardanoTransaction(txHex);

  const supportedFields: unknown[] = Object.values(BODY);
  const unsupported = [...body.keys()].filter((field) => !supportedFields.includes(field));
  if (unsupported.length > 0) {
    throw notSupported(`Ledger cannot sign Cardano transactions with body fields ${unsupported.join(", ")}`);
  }

  const outputs = body.get(BODY.OUTPUTS);
  if (!Array.isArray(outputs)) throw notSupported("Invalid Cardano outputs");
  const auxiliaryDataHash = body.get(BODY.AUXILIARY_DATA_HASH) as Uint8Array | undefined;
  const ttl = body.get(BODY.TTL);
  const validityIntervalStart = body.get(BODY.VALIDITY_INTERVAL_START);
  const { inputs, tagCborSets } = toLedgerInputs(body.get(BODY.INPUTS), own.paymentPath);

  return {
    additionalWitnessPaths: [],
    options: { tagCborSets },
    signingMode: TransactionSigningMode.ORDINARY_TRANSACTION,
    tx: {
      fee: toUint(body.get(BODY.FEE), "fee"),
      inputs,
      network: Networks.Mainnet,
      outputs: await Promise.all(outputs.map((output) => toLedgerOutput(output, own, ledgerModule))),
      ...(auxiliaryDataHash
        ? {
            auxiliaryData: {
              params: { hashHex: hex.encode(auxiliaryDataHash) },
              type: TxAuxiliaryDataType.ARBITRARY_HASH,
            },
          }
        : {}),
      ...(ttl === undefined ? {} : { ttl: toUint(ttl, "ttl") }),
      ...(validityIntervalStart === undefined
        ? {}
        : { validityIntervalStart: toUint(validityIntervalStart, "validity interval start") }),
    },
  };
}

export async function addLedgerWitnesses(
  txHex: string,
  { txHashHex, witnesses }: Pick<SignedTransactionData, "txHashHex" | "witnesses">,
  { paymentPath, publicKey }: { paymentPath: BIP32Path; publicKey: Uint8Array },
) {
  const { addCardanoVkeyWitnesses, decodeCardanoTransaction } = await import("@swapkit/toolboxes/cardano");
  const { bodyHash } = await decodeCardanoTransaction(txHex);

  if (txHashHex.toLowerCase() !== bodyHash) {
    throw new SwapKitError("wallet_ledger_invalid_signature", {
      chain: Chain.Cardano,
      error: "Ledger signed a different transaction body",
    });
  }
  if (witnesses.length === 0) {
    throw new SwapKitError("wallet_ledger_signing_error", {
      chain: Chain.Cardano,
      error: "Ledger returned no witness",
    });
  }

  const vkeyWitnesses = witnesses.map(({ path, witnessSignatureHex }) => {
    if (path.length !== paymentPath.length || path.some((level, i) => level !== paymentPath[i])) {
      throw new SwapKitError("wallet_ledger_signing_error", {
        chain: Chain.Cardano,
        error: "Ledger returned a witness for an unexpected key",
      });
    }
    return { publicKey, signature: hex.decode(witnessSignatureHex) };
  });

  return addCardanoVkeyWitnesses(txHex, vkeyWitnesses);
}

export async function CardanoLedger(paramsOrPath?: CardanoLedgerParams | DerivationPathArray, transport?: Transport) {
  const { derivationPath, ...connection } = normalizeLedgerJsClientParams({ paramsOrPath, transport });
  const path = derivationPath || NetworkDerivationPath[Chain.Cardano];
  const [purpose, coinType, account, role, index] = path;
  if (path.length !== 5 || role !== 0 || index === undefined) {
    throw new SwapKitError("wallet_ledger_derivation_path_error", { chain: Chain.Cardano, derivationPath: path });
  }

  const ledgerModule = await import("@cardano-foundation/ledgerjs-hw-app-cardano");
  const { getCardanoAddressFromBytes, getCardanoPublicKeyHash } = await import("@swapkit/toolboxes/cardano");
  const { HARDENED, Networks } = ledgerModule;
  const accountPath = [purpose + HARDENED, coinType + HARDENED, account + HARDENED];
  const paymentPath = [...accountPath, 0, index];
  const stakingPath = [...accountPath, 2, 0];

  function runCardanoOperation<Output>({
    operation,
    requiredUserInteraction,
  }: {
    operation: (app: Ada) => Promise<Output>;
    requiredUserInteraction?: UserInteractionRequired;
  }) {
    return runLedgerJsOperation({
      appName: "Cardano ADA",
      connection,
      // Named export: the package is CommonJS only, so `default` is `module.exports` under Node ESM.
      createApp: (ledgerTransport) => new ledgerModule.Ada(ledgerTransport),
      operation,
      requiredUserInteraction,
    });
  }

  function toPublicKey(key: ExtendedPublicKey | undefined) {
    const publicKey = Buffer.from(key?.publicKeyHex ?? "", "hex");
    if (publicKey.length !== 32) {
      throw new SwapKitError("wallet_ledger_failed_to_get_address", { chain: Chain.Cardano, derivationPath: path });
    }
    return publicKey;
  }

  const keys = await runCardanoOperation({
    operation: (app) => app.getExtendedPublicKeys({ paths: [paymentPath, stakingPath] }),
  });
  const paymentKey = toPublicKey(keys[0]);
  const stakingKey = toPublicKey(keys[1]);

  const publicKeyHash = await getCardanoPublicKeyHash(paymentKey);
  const address = await getCardanoAddressFromBytes(
    Buffer.concat([
      Buffer.from([Networks.Mainnet.networkId]),
      publicKeyHash,
      await getCardanoPublicKeyHash(stakingKey),
    ]),
  );

  async function signTransaction(txHex: string) {
    const request = await toLedgerCardanoTransaction(txHex, { address, paymentPath, stakingPath }, ledgerModule);
    const result = await runCardanoOperation({
      operation: (app) => app.signTransaction(request),
      requiredUserInteraction: LEDGER_USER_INTERACTION_REQUIRED.SignTransaction,
    });

    return addLedgerWitnesses(txHex, result, { paymentPath, publicKey: paymentKey });
  }

  return { getAddress: () => address, publicKey: paymentKey, publicKeyHash, signTransaction };
}
