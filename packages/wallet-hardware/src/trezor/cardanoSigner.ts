import { hex } from "@scure/base";
import { Chain, type DerivationPathArray, derivationPathToString, SwapKitError } from "@swapkit/helpers";
import {
  addCardanoVkeyWitnesses,
  decodeCardanoTransaction,
  getCardanoAddressFromBytes,
  getCardanoPublicKeyHash,
} from "@swapkit/toolboxes/cardano";
import type {
  CardanoAssetGroup,
  CardanoInput,
  CardanoOutput,
  CardanoSignedTxData,
  CardanoSignTransaction,
  PROTO,
} from "@trezor/connect-web";

type CardanoAddressParams = { address: string; path: string; stakingPath: string };
export type TrezorConnectModule = typeof import("@trezor/connect-web");

function getConnectParams({ CARDANO, PROTO: proto }: TrezorConnectModule) {
  return {
    // Trezor Suite default, same as the SwapKit keystore
    derivationType: proto.CardanoDerivationType.ICARUS,
    mainnet: { networkId: CARDANO.NETWORK_IDS.mainnet, protocolMagic: CARDANO.PROTOCOL_MAGICS.mainnet },
    proto,
  };
}

const BODY = { AUXILIARY_DATA_HASH: 7, FEE: 2, INPUTS: 0, OUTPUTS: 1, TTL: 3, VALIDITY_INTERVAL_START: 8 } as const;
const SET_TAG = 258;

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

function toUint(value: unknown, field: string) {
  const isBigNumber = typeof value === "object" && value !== null && "toFixed" in value;
  const text = isBigNumber || Number.isSafeInteger(value) ? String((value as number).toFixed()) : "";
  if (!/^\d+$/.test(text)) throw notSupported(`Invalid ${field} in Cardano transaction`);
  return text;
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

async function toTrezorOutput(
  output: unknown,
  own: CardanoAddressParams,
  proto: TrezorConnectModule["PROTO"],
): Promise<CardanoOutput> {
  let address: unknown;
  let value: unknown;
  let format: PROTO.CardanoTxOutputSerializationFormat;

  if (Array.isArray(output)) {
    if (output.length !== 2) throw notSupported("Trezor cannot sign Cardano outputs with a datum");
    [address, value] = output;
    format = proto.CardanoTxOutputSerializationFormat.ARRAY_LEGACY;
  } else if (isMap(output)) {
    if (output.has(2)) throw notSupported("Trezor cannot sign Cardano outputs with a datum");
    if (output.has(3)) throw notSupported("Trezor cannot sign Cardano outputs with a reference script");
    if (output.size !== 2) throw notSupported("Unsupported field in Cardano output");
    address = output.get(0);
    value = output.get(1);
    format = proto.CardanoTxOutputSerializationFormat.MAP_BABBAGE;
  } else {
    throw notSupported("Invalid Cardano output");
  }

  if (!isBytes(address) || address.length === 0) throw notSupported("Invalid Cardano output address");
  if ((address[0] ?? 0) >> 4 >= 14) throw notSupported("Trezor cannot send Cardano outputs to reward addresses");

  const [coin, multiAsset] = Array.isArray(value) ? value : [value];
  if (Array.isArray(value) && value.length !== 2) throw notSupported("Invalid Cardano output value");

  const outputAddress = await getCardanoAddressFromBytes(address);
  const destination =
    outputAddress === own.address
      ? {
          addressParameters: {
            addressType: proto.CardanoAddressType.BASE,
            path: own.path,
            stakingPath: own.stakingPath,
          },
        }
      : { address: outputAddress };

  return {
    ...destination,
    amount: toUint(coin, "output amount"),
    format,
    ...(multiAsset === undefined ? {} : { tokenBundle: toTokenBundle(multiAsset) }),
  };
}

function toTrezorInputs(inputs: unknown, path: string) {
  const isTagged =
    typeof inputs === "object" && inputs !== null && "tag" in inputs && inputs.tag === SET_TAG && "value" in inputs;
  const list = isTagged ? inputs.value : inputs;
  if (!Array.isArray(list) || list.length === 0) throw notSupported("Invalid Cardano inputs");

  const trezorInputs: CardanoInput[] = list.map((input) => {
    if (!Array.isArray(input) || input.length !== 2 || !isBytes(input[0], 32)) {
      throw notSupported("Invalid Cardano input");
    }
    return { path, prev_hash: hex.encode(input[0]), prev_index: Number(toUint(input[1], "input index")) };
  });

  return { inputs: trezorInputs, tagCborSets: isTagged };
}

export async function toTrezorCardanoTransaction(
  txHex: string,
  own: CardanoAddressParams,
  connect: TrezorConnectModule,
) {
  const { body } = await decodeCardanoTransaction(txHex);
  const { derivationType, mainnet, proto } = getConnectParams(connect);

  const supportedFields: unknown[] = Object.values(BODY);
  const unsupported = [...body.keys()].filter((field) => !supportedFields.includes(field));
  if (unsupported.length > 0) {
    throw notSupported(`Trezor cannot sign Cardano transactions with body fields ${unsupported.join(", ")}`);
  }

  const outputs = body.get(BODY.OUTPUTS);
  if (!Array.isArray(outputs) || outputs.length === 0) throw notSupported("Invalid Cardano outputs");

  const auxiliaryDataHash = body.get(BODY.AUXILIARY_DATA_HASH);
  if (auxiliaryDataHash !== undefined && !isBytes(auxiliaryDataHash, 32)) {
    throw notSupported("Invalid Cardano auxiliary data hash");
  }

  const ttl = body.get(BODY.TTL);
  const validityIntervalStart = body.get(BODY.VALIDITY_INTERVAL_START);

  return {
    ...toTrezorInputs(body.get(BODY.INPUTS), own.path),
    ...mainnet,
    derivationType,
    fee: toUint(body.get(BODY.FEE), "fee"),
    outputs: await Promise.all(outputs.map((output) => toTrezorOutput(output, own, proto))),
    signingMode: proto.CardanoTxSigningMode.ORDINARY_TRANSACTION,
    ...(auxiliaryDataHash ? { auxiliaryData: { hash: hex.encode(auxiliaryDataHash) } } : {}),
    ...(ttl === undefined ? {} : { ttl: toUint(ttl, "ttl") }),
    ...(validityIntervalStart === undefined
      ? {}
      : { validityIntervalStart: toUint(validityIntervalStart, "validity interval start") }),
  } satisfies CardanoSignTransaction;
}

export async function addTrezorWitnesses(
  txHex: string,
  { hash, witnesses }: Pick<CardanoSignedTxData, "hash" | "witnesses">,
  publicKey: string,
  { PROTO: proto }: TrezorConnectModule,
) {
  const { bodyHash } = await decodeCardanoTransaction(txHex);

  if (hash.toLowerCase() !== bodyHash) throw signFailed("Trezor signed a different transaction body");
  if (witnesses.length === 0) throw signFailed("Trezor returned no witnesses");

  const vkeyWitnesses = witnesses.map(({ pubKey, signature, type }) => {
    if (type !== proto.CardanoTxWitnessType.SHELLEY_WITNESS || pubKey.toLowerCase() !== publicKey) {
      throw signFailed("Trezor returned a witness for an unexpected key");
    }
    return { publicKey: hex.decode(pubKey.toLowerCase()), signature: hex.decode(signature.toLowerCase()) };
  });

  return addCardanoVkeyWitnesses(txHex, vkeyWitnesses);
}

export async function getCardanoSigner({
  address: knownAddress,
  connect,
  derivationPath,
}: {
  address?: string;
  connect: TrezorConnectModule;
  derivationPath: DerivationPathArray;
}) {
  const [purpose, coinType, account, role, index] = derivationPath;
  if (derivationPath.length !== 5 || role !== 0 || index === undefined) {
    throw new SwapKitError("toolbox_derivation_slot_unsupported", { chain: Chain.Cardano, derivationPath });
  }

  const path = derivationPathToString(derivationPath);
  const stakingPath = derivationPathToString([purpose, coinType, account, 2, 0] as DerivationPathArray);
  const { derivationType, mainnet, proto } = getConnectParams(connect);
  const TrezorConnect = connect.default;

  const publicKeyResult = await TrezorConnect.cardanoGetPublicKey({ derivationType, path });
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

  // The xpub is the public key followed by the chain code
  const publicKeyHex = publicKeyResult.payload.publicKey.slice(0, 64).toLowerCase();
  const publicKey = Buffer.from(publicKeyHex, "hex");
  const publicKeyHash = await getCardanoPublicKeyHash(publicKey);
  let address = knownAddress ?? "";

  async function getAddress() {
    if (address) return address;

    const result = await TrezorConnect.cardanoGetAddress({
      ...mainnet,
      addressParameters: { addressType: proto.CardanoAddressType.BASE, path, stakingPath },
      derivationType,
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
    const params = await toTrezorCardanoTransaction(txHex, { address: await getAddress(), path, stakingPath }, connect);
    const result = await TrezorConnect.cardanoSignTransaction(params);

    if (!result.success) throw signFailed(result.payload.error);

    return addTrezorWitnesses(txHex, result.payload, publicKeyHex, connect);
  }

  return { getAddress, publicKey, publicKeyHash, signTransaction };
}
