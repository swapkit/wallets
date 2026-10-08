import { blake2b } from "@noble/hashes/blake2.js";
import { base58, bech32, hex } from "@scure/base";
import { CborTag, Decoder, Encoder } from "@stricahq/cbors";
import { Chain, type DerivationPathArray, derivationPathToString, SwapKitError } from "@swapkit/helpers";
import type {
  CardanoAssetGroup,
  CardanoInput,
  CardanoOutput,
  CardanoSignedTxData,
  CardanoSignTransaction,
  PROTO,
} from "@trezor/connect-web";

type WithByteSpan = { getByteSpan: () => [number, number] };
type CborMap = Map<unknown, unknown> & WithByteSpan;
type CardanoAddressParams = { address: string; path: string; stakingPath: string };

const MAINNET = { networkId: 1, protocolMagic: 764824073 };
// Trezor Suite derivation; equals the SwapKit keystore (CIP-3 Icarus) for 12 and 18 word seeds
const ICARUS_TREZOR = 2 as PROTO.CardanoDerivationType;
const ORDINARY_TRANSACTION = 0 as PROTO.CardanoTxSigningMode;
const BASE_ADDRESS = 0 as PROTO.CardanoAddressType;
const SHELLEY_WITNESS = 1 as PROTO.CardanoTxWitnessType;
const ARRAY_LEGACY = 0 as PROTO.CardanoTxOutputSerializationFormat;
const MAP_BABBAGE = 1 as PROTO.CardanoTxOutputSerializationFormat;
const SET_TAG = 258;
const VKEY_WITNESSES = 0;

const BODY = { AUXILIARY_DATA_HASH: 7, FEE: 2, INPUTS: 0, OUTPUTS: 1, TTL: 3, VALIDITY_INTERVAL_START: 8 } as const;
const SUPPORTED_BODY_FIELDS = new Set<unknown>(Object.values(BODY));
const BODY_FIELD_NAMES: Record<number, string> = {
  4: "certificates",
  5: "withdrawals",
  6: "protocol updates",
  9: "mint",
  11: "script data hash",
  13: "collateral inputs",
  14: "required signers",
  15: "network id",
  16: "collateral return",
  17: "total collateral",
  18: "reference inputs",
  19: "voting procedures",
  20: "proposal procedures",
  21: "treasury amount",
  22: "donation",
};

function notSupported(reason: string) {
  return new SwapKitError({ errorKey: "wallet_trezor_method_not_supported", info: { chain: Chain.Cardano, reason } });
}

function signFailed(error: string) {
  return new SwapKitError({
    errorKey: "wallet_trezor_failed_to_sign_transaction",
    info: { chain: Chain.Cardano, error },
  });
}

function isMap(value: unknown): value is Map<unknown, unknown> {
  return value instanceof Map;
}

function isBytes(value: unknown, length?: number): value is Uint8Array {
  return value instanceof Uint8Array && (length === undefined || value.length === length);
}

// cbors decodes integers above 2^53 as BigNumber
function toUint(value: unknown, field: string) {
  const isBigNumber = typeof value === "object" && value !== null && "toFixed" in value;
  const text = isBigNumber || Number.isSafeInteger(value) ? String((value as number).toFixed()) : "";
  if (!/^\d+$/.test(text)) throw notSupported(`Invalid ${field} in Cardano transaction`);
  return text;
}

function toAddressString(bytes: Uint8Array) {
  const header = bytes[0] ?? 0;
  // Byron addresses are CBOR arrays (0x82), Shelley headers 0-7 are payment addresses
  if (header >> 4 === 8) return base58.encode(bytes);
  if (header >> 4 > 7) throw notSupported("Trezor cannot send Cardano outputs to reward addresses");

  return bech32.encode((header & 0x0f) === MAINNET.networkId ? "addr" : "addr_test", bech32.toWords(bytes), 1000);
}

function toTokenBundle(multiAsset: unknown): CardanoAssetGroup[] {
  if (!isMap(multiAsset) || multiAsset.size === 0) throw notSupported("Invalid Cardano multiasset value");

  return [...multiAsset].map(([policyId, assets]) => {
    if (!isBytes(policyId, 28) || !isMap(assets) || assets.size === 0) {
      throw notSupported("Invalid Cardano multiasset value");
    }

    const tokenAmounts = [...assets].map(([assetName, amount]) => {
      if (!isBytes(assetName)) throw notSupported("Invalid Cardano asset name");
      return { amount: toUint(amount, "token amount"), assetNameBytes: hex.encode(assetName) };
    });

    return { policyId: hex.encode(policyId), tokenAmounts };
  });
}

function toTrezorOutput(output: unknown, own: CardanoAddressParams & { addressHex: string }): CardanoOutput {
  let address: unknown;
  let value: unknown;
  let format: PROTO.CardanoTxOutputSerializationFormat;

  if (Array.isArray(output)) {
    if (output.length !== 2) throw notSupported("Trezor cannot sign Cardano outputs with a datum");
    [address, value] = output;
    format = ARRAY_LEGACY;
  } else if (isMap(output)) {
    if (output.has(2)) throw notSupported("Trezor cannot sign Cardano outputs with a datum");
    if (output.has(3)) throw notSupported("Trezor cannot sign Cardano outputs with a reference script");
    if (output.size !== 2) throw notSupported("Unsupported field in Cardano output");
    address = output.get(0);
    value = output.get(1);
    format = MAP_BABBAGE;
  } else {
    throw notSupported("Invalid Cardano output");
  }

  if (!isBytes(address) || address.length === 0) throw notSupported("Invalid Cardano output address");

  const [coin, multiAsset] = Array.isArray(value) ? value : [value];
  if (Array.isArray(value) && value.length !== 2) throw notSupported("Invalid Cardano output value");

  const destination =
    hex.encode(address) === own.addressHex
      ? { addressParameters: { addressType: BASE_ADDRESS, path: own.path, stakingPath: own.stakingPath } }
      : { address: toAddressString(address) };

  return {
    ...destination,
    amount: toUint(coin, "output amount"),
    format,
    ...(multiAsset === undefined ? {} : { tokenBundle: toTokenBundle(multiAsset) }),
  };
}

function toTrezorInputs(inputs: unknown, path: string) {
  const isTagged = inputs instanceof CborTag && inputs.tag === SET_TAG;
  const list = isTagged ? (inputs as CborTag).value : inputs;
  if (!Array.isArray(list) || list.length === 0) throw notSupported("Invalid Cardano inputs");

  const trezorInputs: CardanoInput[] = list.map((input) => {
    if (!Array.isArray(input) || input.length !== 2 || !isBytes(input[0], 32)) {
      throw notSupported("Invalid Cardano input");
    }
    return { path, prev_hash: hex.encode(input[0]), prev_index: Number(toUint(input[1], "input index")) };
  });

  return { inputs: trezorInputs, tagCborSets: isTagged };
}

export function decodeCardanoTransaction(txHex: string) {
  const bytes = Buffer.from(txHex, "hex");
  const { value: tx } = Decoder.decode(bytes);

  if (!Array.isArray(tx) || tx.length !== 4) throw notSupported("Invalid Cardano transaction");
  if ((tx as unknown as WithByteSpan).getByteSpan()[1] !== bytes.length) {
    throw notSupported("Trailing bytes in Cardano transaction");
  }

  const [body, witnessSet] = tx as [CborMap, CborMap];
  if (!isMap(body) || !isMap(witnessSet)) throw notSupported("Invalid Cardano transaction");

  const [bodyStart, bodyEnd] = body.getByteSpan();
  const bodyHash = hex.encode(blake2b(bytes.subarray(bodyStart, bodyEnd), { dkLen: 32 }));

  return { body, bodyHash, bytes, witnessSet };
}

export function toTrezorCardanoTransaction(txHex: string, own: CardanoAddressParams) {
  const { body } = decodeCardanoTransaction(txHex);

  const unsupported = [...body.keys()].filter((field) => !SUPPORTED_BODY_FIELDS.has(field));
  if (unsupported.length > 0) {
    const names = unsupported.map((field) => BODY_FIELD_NAMES[field as number] ?? `field ${String(field)}`);
    throw notSupported(`Trezor cannot sign Cardano transactions with ${names.join(", ")}`);
  }

  const outputs = body.get(BODY.OUTPUTS);
  if (!Array.isArray(outputs) || outputs.length === 0) throw notSupported("Invalid Cardano outputs");

  const addressHex = hex.encode(bech32.fromWords(bech32.decode(own.address as `${string}1${string}`, 1000).words));
  const auxiliaryDataHash = body.get(BODY.AUXILIARY_DATA_HASH);
  if (auxiliaryDataHash !== undefined && !isBytes(auxiliaryDataHash, 32)) {
    throw notSupported("Invalid Cardano auxiliary data hash");
  }

  const ttl = body.get(BODY.TTL);
  const validityIntervalStart = body.get(BODY.VALIDITY_INTERVAL_START);

  return {
    ...toTrezorInputs(body.get(BODY.INPUTS), own.path),
    ...MAINNET,
    derivationType: ICARUS_TREZOR,
    fee: toUint(body.get(BODY.FEE), "fee"),
    outputs: outputs.map((output) => toTrezorOutput(output, { ...own, addressHex })),
    signingMode: ORDINARY_TRANSACTION,
    ...(auxiliaryDataHash ? { auxiliaryData: { hash: hex.encode(auxiliaryDataHash) } } : {}),
    ...(ttl === undefined ? {} : { ttl: toUint(ttl, "ttl") }),
    ...(validityIntervalStart === undefined
      ? {}
      : { validityIntervalStart: toUint(validityIntervalStart, "validity interval start") }),
  } satisfies CardanoSignTransaction;
}

export function addTrezorWitnesses(
  txHex: string,
  { hash, witnesses }: Pick<CardanoSignedTxData, "hash" | "witnesses">,
  publicKey: string,
) {
  const { bodyHash, bytes, witnessSet } = decodeCardanoTransaction(txHex);

  if (hash.toLowerCase() !== bodyHash) throw signFailed("Trezor signed a different transaction body");
  if (witnesses.length === 0) throw signFailed("Trezor returned no witnesses");

  const existing = witnessSet.get(VKEY_WITNESSES);
  const isTagged = existing instanceof CborTag;
  const vkeyWitnesses: unknown[] = isTagged ? existing.value : ((existing as unknown[] | undefined) ?? []);
  if (!Array.isArray(vkeyWitnesses)) throw signFailed("Invalid Cardano witness set");

  for (const { pubKey, signature, type } of witnesses) {
    if (type !== SHELLEY_WITNESS || pubKey.toLowerCase() !== publicKey) {
      throw signFailed("Trezor returned a witness for an unexpected key");
    }
    vkeyWitnesses.push([Buffer.from(pubKey, "hex"), Buffer.from(signature, "hex")]);
  }

  witnessSet.set(VKEY_WITNESSES, isTagged ? new CborTag(vkeyWitnesses, SET_TAG) : vkeyWitnesses);

  // Only the witness set is re-encoded; body, validity flag and auxiliary data keep their original bytes
  const [start, end] = witnessSet.getByteSpan();
  return Buffer.concat([bytes.subarray(0, start), Encoder.encode(witnessSet), bytes.subarray(end)]).toString("hex");
}

export async function getCardanoSigner({
  address: knownAddress,
  derivationPath,
}: {
  address?: string;
  derivationPath: DerivationPathArray;
}) {
  const [purpose, coinType, account, role, index] = derivationPath;
  if (derivationPath.length !== 5 || role !== 0 || index === undefined) {
    throw new SwapKitError("toolbox_derivation_slot_unsupported", { chain: Chain.Cardano, derivationPath });
  }

  const path = derivationPathToString(derivationPath);
  const stakingPath = derivationPathToString([purpose, coinType, account, 2, 0] as DerivationPathArray);
  const TrezorConnect = (await import("@trezor/connect-web")).default;

  const publicKeyResult = await TrezorConnect.cardanoGetPublicKey({ derivationType: ICARUS_TREZOR, path });
  if (!publicKeyResult.success || !/^[0-9a-f]{128}$/i.test(publicKeyResult.payload.publicKey)) {
    throw new SwapKitError({
      errorKey: "wallet_trezor_failed_to_get_address",
      info: {
        chain: Chain.Cardano,
        derivationPath,
        error: publicKeyResult.success ? "Invalid public key" : publicKeyResult.payload.error,
      },
    });
  }

  // The xpub is the 32 byte public key followed by the chain code
  const publicKeyHex = publicKeyResult.payload.publicKey.slice(0, 64).toLowerCase();
  const publicKey = Buffer.from(publicKeyHex, "hex");
  let address = knownAddress ?? "";

  async function getAddress() {
    if (address) return address;

    const result = await TrezorConnect.cardanoGetAddress({
      ...MAINNET,
      addressParameters: { addressType: BASE_ADDRESS, path, stakingPath },
      derivationType: ICARUS_TREZOR,
      showOnTrezor: true,
    });

    if (!result.success) {
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_get_address",
        info: { chain: Chain.Cardano, derivationPath, error: result.payload.error },
      });
    }

    address = result.payload.address;
    return address;
  }

  async function signTransaction(txHex: string) {
    const params = toTrezorCardanoTransaction(txHex, { address: await getAddress(), path, stakingPath });
    const result = await TrezorConnect.cardanoSignTransaction(params);

    if (!result.success) throw signFailed(result.payload.error);

    return addTrezorWitnesses(txHex, result.payload, publicKeyHex);
  }

  return { getAddress, publicKey, publicKeyHash: Buffer.from(blake2b(publicKey, { dkLen: 28 })), signTransaction };
}
