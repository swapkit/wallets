import type {
  Ada,
  AssetGroup,
  BIP32Path,
  ExtendedPublicKey,
  SignedTransactionData,
  SignTransactionRequest,
  TxOutput,
  TxOutputDestination,
} from "@cardano-foundation/ledgerjs-hw-app-cardano";
import type { UserInteractionRequired } from "@ledgerhq/device-management-kit";
import type Transport from "@ledgerhq/hw-transport";
import { hex } from "@scure/base";
import { Chain, type DerivationPathArray, NetworkDerivationPath, SwapKitError } from "@swapkit/helpers";

import { type CardanoOutputFields, readCardanoBody } from "../../helpers/cardano";
import {
  LEDGER_USER_INTERACTION_REQUIRED,
  type LedgerJsClientParams,
  normalizeLedgerJsClientParams,
  runLedgerJsOperation,
} from "../helpers/ledgerJsDmkBridge";

export type CardanoLedgerModule = typeof import("@cardano-foundation/ledgerjs-hw-app-cardano");
export type CardanoLedgerAddressParams = { address: string; paymentPath: BIP32Path; stakingPath: BIP32Path };

type CardanoLedgerParams = LedgerJsClientParams<DerivationPathArray>;

function notSupported(reason: string) {
  return new SwapKitError("wallet_ledger_method_not_supported", { chain: Chain.Cardano, reason });
}

async function toLedgerOutput(
  { address, amount, format, tokenGroups }: CardanoOutputFields,
  own: CardanoLedgerAddressParams,
  { AddressType, TxOutputDestinationType, TxOutputFormat }: CardanoLedgerModule,
): Promise<TxOutput> {
  const { getCardanoAddressFromBytes } = await import("@swapkit/toolboxes/cardano");
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
  const tokenBundle: AssetGroup[] | undefined = tokenGroups?.map(({ policyId, tokens }) => ({
    policyIdHex: hex.encode(policyId),
    tokens: tokens.map(({ amount, assetName }) => ({ amount, assetNameHex: hex.encode(assetName) })),
  }));

  return {
    amount,
    destination,
    format: format === "legacy" ? TxOutputFormat.ARRAY_LEGACY : TxOutputFormat.MAP_BABBAGE,
    ...(tokenBundle === undefined ? {} : { tokenBundle }),
  } as TxOutput;
}

export async function toLedgerCardanoTransaction(
  txHex: string,
  own: CardanoLedgerAddressParams,
  ledgerModule: CardanoLedgerModule,
): Promise<SignTransactionRequest> {
  const { decodeCardanoTransaction } = await import("@swapkit/toolboxes/cardano");
  const { Networks, TransactionSigningMode, TxAuxiliaryDataType } = ledgerModule;
  const { body } = await decodeCardanoTransaction(txHex);
  const { auxiliaryDataHash, fee, inputs, outputs, tagCborSets, ttl, validityIntervalStart } = readCardanoBody(
    body,
    "Ledger",
    notSupported,
  );

  return {
    additionalWitnessPaths: [],
    options: { tagCborSets },
    signingMode: TransactionSigningMode.ORDINARY_TRANSACTION,
    tx: {
      fee,
      inputs: inputs.map(({ index, txHash }) => ({
        outputIndex: index,
        path: own.paymentPath,
        txHashHex: hex.encode(txHash),
      })),
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
      ...(ttl === undefined ? {} : { ttl }),
      ...(validityIntervalStart === undefined ? {} : { validityIntervalStart }),
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
