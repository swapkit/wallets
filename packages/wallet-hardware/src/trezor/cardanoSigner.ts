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
  CardanoOutput,
  CardanoSignedTxData,
  CardanoSignTransaction,
} from "@trezor/connect-web";

import { type CardanoOutputFields, readCardanoBody } from "../helpers/cardano";

type CardanoAddressParams = { address: string; path: string; stakingPath: string };
export type TrezorConnectModule = typeof import("@trezor/connect-web");

function getConnectParams({ CARDANO, PROTO }: TrezorConnectModule) {
  return {
    // Trezor Suite default, same as the SwapKit keystore
    derivationType: PROTO.CardanoDerivationType.ICARUS,
    mainnet: { networkId: CARDANO.NETWORK_IDS.mainnet, protocolMagic: CARDANO.PROTOCOL_MAGICS.mainnet },
  };
}

function notSupported(reason: string) {
  return new SwapKitError({ errorKey: "wallet_trezor_method_not_supported", info: { chain: Chain.Cardano, reason } });
}

function signFailed(error: string) {
  return new SwapKitError({
    errorKey: "wallet_trezor_failed_to_sign_transaction",
    info: { chain: Chain.Cardano, error },
  });
}

async function toTrezorOutput(
  { address, amount, format, tokenGroups }: CardanoOutputFields,
  own: CardanoAddressParams,
  proto: TrezorConnectModule["PROTO"],
): Promise<CardanoOutput> {
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
  const tokenBundle: CardanoAssetGroup[] | undefined = tokenGroups?.map(({ policyId, tokens }) => ({
    policyId: hex.encode(policyId),
    tokenAmounts: tokens.map(({ amount, assetName }) => ({ amount, assetNameBytes: hex.encode(assetName) })),
  }));

  return {
    ...destination,
    amount,
    format:
      format === "legacy"
        ? proto.CardanoTxOutputSerializationFormat.ARRAY_LEGACY
        : proto.CardanoTxOutputSerializationFormat.MAP_BABBAGE,
    ...(tokenBundle === undefined ? {} : { tokenBundle }),
  };
}

export async function toTrezorCardanoTransaction(
  txHex: string,
  own: CardanoAddressParams,
  connect: TrezorConnectModule,
): Promise<CardanoSignTransaction> {
  const { body } = await decodeCardanoTransaction(txHex);
  const { derivationType, mainnet } = getConnectParams(connect);
  const { PROTO: proto } = connect;
  const { auxiliaryDataHash, fee, inputs, outputs, tagCborSets, ttl, validityIntervalStart } = readCardanoBody(
    body,
    "Trezor",
    notSupported,
  );

  return {
    inputs: inputs.map(({ index, txHash }) => ({ path: own.path, prev_hash: hex.encode(txHash), prev_index: index })),
    tagCborSets,
    ...mainnet,
    derivationType,
    fee,
    outputs: await Promise.all(outputs.map((output) => toTrezorOutput(output, own, proto))),
    signingMode: proto.CardanoTxSigningMode.ORDINARY_TRANSACTION,
    ...(auxiliaryDataHash ? { auxiliaryData: { hash: hex.encode(auxiliaryDataHash) } } : {}),
    ...(ttl === undefined ? {} : { ttl }),
    ...(validityIntervalStart === undefined ? {} : { validityIntervalStart }),
  };
}

export async function addTrezorWitnesses(
  txHex: string,
  { hash, witnesses }: Pick<CardanoSignedTxData, "hash" | "witnesses">,
  publicKey: string,
  { PROTO: proto }: TrezorConnectModule,
) {
  const { bodyHash } = await decodeCardanoTransaction(txHex);

  if (hash.toLowerCase() !== bodyHash) throw signFailed("Trezor signed a different transaction body");

  const vkeyWitnesses = witnesses.map(({ pubKey, signature, type }) => {
    if (type !== proto.CardanoTxWitnessType.SHELLEY_WITNESS || pubKey.toLowerCase() !== publicKey) {
      throw signFailed("Trezor returned a witness for an unexpected key");
    }
    return { publicKey: hex.decode(pubKey), signature: hex.decode(signature) };
  });

  return addCardanoVkeyWitnesses(txHex, vkeyWitnesses);
}

export async function getCardanoSigner({
  connect,
  derivationPath,
}: {
  connect: TrezorConnectModule;
  derivationPath: DerivationPathArray;
}) {
  const [purpose, coinType, account, role, index] = derivationPath;
  if (derivationPath.length !== 5 || role !== 0 || index === undefined) {
    throw new SwapKitError({
      errorKey: "wallet_trezor_derivation_path_not_supported",
      info: { chain: Chain.Cardano, derivationPath },
    });
  }

  const path = derivationPathToString(derivationPath);
  const stakingPath = derivationPathToString([purpose, coinType, account, 2, 0] as DerivationPathArray);
  const { derivationType, mainnet } = getConnectParams(connect);
  const TrezorConnect = connect.default;

  // One device call: a second one right after would need a new Connect popup
  const keysResult = await TrezorConnect.cardanoGetPublicKey({
    bundle: [path, stakingPath].map((keyPath) => ({ derivationType, path: keyPath })),
  });
  if (!keysResult.success) {
    throw new SwapKitError({
      errorKey: "wallet_trezor_failed_to_get_address",
      info: { chain: Chain.Cardano, derivationPath, error: keysResult.payload.error },
    });
  }

  const [publicKey, stakingKey] = keysResult.payload.map(({ node }) => Buffer.from(node.public_key, "hex")) as [
    Buffer,
    Buffer,
  ];
  const publicKeyHash = await getCardanoPublicKeyHash(publicKey);
  const address = await getCardanoAddressFromBytes(
    Buffer.concat([Buffer.from([mainnet.networkId]), publicKeyHash, await getCardanoPublicKeyHash(stakingKey)]),
  );

  async function signTransaction(txHex: string) {
    const params = await toTrezorCardanoTransaction(txHex, { address, path, stakingPath }, connect);
    const result = await TrezorConnect.cardanoSignTransaction(params);

    if (!result.success) throw signFailed(result.payload.error);

    return addTrezorWitnesses(txHex, result.payload, publicKey.toString("hex"), connect);
  }

  return { getAddress: () => address, publicKey, publicKeyHash, signTransaction };
}
