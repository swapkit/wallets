import { UserInteractionRequired } from "@ledgerhq/device-management-kit";
import type BitcoinApp from "@ledgerhq/hw-app-btc";
import type { CreateTransactionArg } from "@ledgerhq/hw-app-btc/lib-es/createTransaction";
import type Transport from "@ledgerhq/hw-transport";
import { hex } from "@scure/base";
import {
  Chain,
  type DerivationPathArray,
  derivationPathToString,
  getWalletFormatFor,
  SwapKitError,
} from "@swapkit/helpers";
import type { UTXOType } from "@swapkit/toolboxes/utxo";
import type { PCZT, Transaction } from "@swapkit/utxo-signer";

import {
  type LedgerJsClientParams,
  normalizeLedgerJsClientParams,
  runLedgerJsOperation,
} from "../helpers/ledgerJsDmkBridge";
import { createCachedRawTxResolver } from "../helpers/rawTx";

const nonSegwitLedgerChains = ["bitcoin-cash", "dash", "dogecoin", "zcash"];

type LedgerUTXOChain = "bitcoin-cash" | "bitcoin" | "litecoin" | "dogecoin" | "dash" | "zcash";
type UTXOLedgerParams = LedgerJsClientParams<DerivationPathArray | string>;

interface ZcashPreviousTransactionInput {
  index: number;
  scriptPubkey: Uint8Array;
  txid: Uint8Array;
  value: bigint;
}

const ledgerAppNames: Record<LedgerUTXOChain, string> = {
  bitcoin: "Bitcoin",
  "bitcoin-cash": "Bitcoin Cash",
  dash: "Dash",
  dogecoin: "Dogecoin",
  litecoin: "Litecoin",
  zcash: "Zcash",
};

type Params = {
  tx: Transaction;
  inputUtxos: UTXOType[];
  btcApp: BitcoinApp;
  derivationPath: string;
  chain: LedgerUTXOChain;
};

type MultiPathParams = Omit<Params, "derivationPath"> & {
  /** Derivation paths for each input - one per input */
  derivationPaths: string[];
};

export async function resolveZcashPreviousTransaction({
  getRawTx,
  input,
  inputIndex,
}: {
  getRawTx: (txid: string) => Promise<string>;
  input: ZcashPreviousTransactionInput;
  inputIndex: number;
}) {
  const txid = hex.encode(input.txid);
  const txHex = await getRawTx(txid);
  if (!txHex) {
    throw new SwapKitError("wallet_ledger_invalid_params", {
      chain: Chain.Zcash,
      inputIndex,
      reason: "Unable to resolve previous transaction hex for Ledger signing",
      txid,
    });
  }

  return {
    hash: txid,
    index: input.index,
    txHex,
    value: Number(input.value),
    witnessUtxo: { script: input.scriptPubkey, value: Number(input.value) },
  } as UTXOType;
}

export function resolveZcashPreviousTransactions({
  getRawTx,
  inputs,
}: {
  getRawTx: (txid: string) => Promise<string>;
  inputs: ZcashPreviousTransactionInput[];
}) {
  const cachedGetRawTx = createCachedRawTxResolver(getRawTx);
  return Promise.all(
    inputs.map((input, inputIndex) => resolveZcashPreviousTransaction({ getRawTx: cachedGetRawTx, input, inputIndex })),
  );
}

const signUTXOTransaction = (
  { tx, inputUtxos, btcApp, derivationPath, chain }: Params,
  options?: Partial<CreateTransactionArg>,
) => {
  const inputs = inputUtxos.map((item) => {
    const splitTx = btcApp.splitTransaction(
      item.txHex || "",
      !nonSegwitLedgerChains.includes(chain),
      chain === "zcash",
    );

    return [splitTx, item.index, undefined as string | null | undefined, undefined as number | null | undefined] as any;
  });

  const newTxHex = hex.encode(tx.unsignedTx);

  const splitNewTx = btcApp.splitTransaction(newTxHex, true);
  const outputScriptHex = btcApp.serializeTransactionOutputs(splitNewTx).toString("hex");

  // hw-app-btc derives the signing policy from these flags:
  //   additionals ["bech32"] + segwit  → wpkh (native segwit, m/84')
  //   no additionals + segwit         → sh(wpkh) (P2SH-P2WPKH, m/49')
  //   no additionals + !segwit        → pkh (legacy, m/44')
  // They must match the derivation path or the BTC app rejects with 0x6a80.
  const format = getWalletFormatFor(derivationPath);
  const segwit = format !== "legacy";
  const params: CreateTransactionArg = {
    additionals: format === "bech32" ? ["bech32"] : [],
    associatedKeysets: inputs.map(() => derivationPath),
    inputs,
    outputScriptHex,
    segwit,
    useTrustedInputForSegwit: segwit,
  };

  return btcApp.createPaymentTransaction({ ...params, ...options });
};

/**
 * Sign a UTXO transaction with multiple derivation paths.
 * Each input can have its own derivation path for HD wallet multi-address support.
 */
const signUTXOTransactionWithMultiplePaths = (
  { tx, inputUtxos, btcApp, derivationPaths, chain }: MultiPathParams,
  options?: Partial<CreateTransactionArg>,
) => {
  if (derivationPaths.length !== inputUtxos.length) {
    throw new SwapKitError("wallet_ledger_invalid_params", {
      message: `Derivation paths count (${derivationPaths.length}) must match inputs count (${inputUtxos.length})`,
    });
  }

  const inputs = inputUtxos.map((item) => {
    const splitTx = btcApp.splitTransaction(
      item.txHex || "",
      !nonSegwitLedgerChains.includes(chain),
      chain === "zcash",
    );

    return [splitTx, item.index, undefined as string | null | undefined, undefined as number | null | undefined] as any;
  });

  const newTxHex = hex.encode(tx.unsignedTx);

  const splitNewTx = btcApp.splitTransaction(newTxHex, true);
  const outputScriptHex = btcApp.serializeTransactionOutputs(splitNewTx).toString("hex");

  // Same policy/path matching rules as signUTXOTransaction; all paths share
  // one account so the first path determines the format.
  const format = getWalletFormatFor(derivationPaths[0] ?? "");
  const segwit = format !== "legacy";
  const params: CreateTransactionArg = {
    additionals: format === "bech32" ? ["bech32"] : [],
    associatedKeysets: derivationPaths,
    inputs,
    outputScriptHex,
    segwit,
    useTrustedInputForSegwit: segwit,
  };

  return btcApp.createPaymentTransaction({ ...params, ...options });
};

const BaseLedgerUTXO = ({
  chain,
  additionalSignParams,
}: {
  chain: LedgerUTXOChain;
  additionalSignParams?: Partial<CreateTransactionArg>;
}) => {
  return (paramsOrPath?: UTXOLedgerParams | DerivationPathArray | string, transport?: Transport) => {
    const { derivationPath: derivationPathParam, ...connection } = normalizeLedgerJsClientParams({
      paramsOrPath,
      transport,
    });
    const derivationPath =
      typeof derivationPathParam === "string"
        ? derivationPathParam
        : derivationPathToString(derivationPathParam as DerivationPathArray);
    const format = getWalletFormatFor(derivationPath);

    async function runBtcOperation<Output>({
      operation,
      requiredUserInteraction,
    }: {
      operation: (app: InstanceType<typeof BitcoinApp>) => Promise<Output> | Output;
      requiredUserInteraction?: UserInteractionRequired;
    }) {
      const BitcoinApp = (await import("@ledgerhq/hw-app-btc")).default;
      return runLedgerJsOperation({
        appName: ledgerAppNames[chain],
        connection,
        createApp: (ledgerTransport) => new BitcoinApp({ currency: chain, transport: ledgerTransport }),
        operation,
        requiredUserInteraction,
      });
    }

    return {
      connect: async () => {
        await runBtcOperation({ operation: async () => true });
      },
      disconnect: async () => {},
      getAddress: async () => {
        const { toCashAddress } = await import("@swapkit/toolboxes/utxo");
        const { bitcoinAddress: address } = await runBtcOperation({
          operation: (app) => app.getWalletPublicKey(derivationPath, { format }),
        });

        if (!address) {
          throw new SwapKitError("wallet_ledger_get_address_error", {
            message: `Cannot get ${chain} address from ledger derivation path: ${derivationPath}`,
          });
        }

        return chain === "bitcoin-cash" && format === "legacy"
          ? toCashAddress(address).replace(/(bchtest:|bitcoincash:)/, "")
          : address;
      },
      getExtendedPublicKey: async (path = "84'/0'/0'", xpubVersion = 76067358) => {
        return await runBtcOperation({ operation: (app) => app.getWalletXpub({ path, xpubVersion }) });
      },

      signPCZT: async (pczt: PCZT): Promise<PCZT> => {
        if (chain !== "zcash") {
          throw new SwapKitError("wallet_ledger_chain_not_supported", {
            message: "PCZT signing is only supported for Zcash",
          });
        }

        const { ZcashTransaction, Script } = await import("@swapkit/utxo-signer");
        const { getUtxoApi } = await import("@swapkit/toolboxes/utxo");

        const global = pczt.getGlobal();

        const unsignedTx = new ZcashTransaction({
          consensusBranchId: global.consensusBranchId,
          expiryHeight: global.expiryHeight,
          lockTime: global.lockTime,
          version: global.txVersion,
          versionGroupId: global.versionGroupId,
        });

        const inputs = Array.from({ length: pczt.inputsLength }, (_, inputIndex) => pczt.getInput(inputIndex));

        for (const input of inputs) {
          unsignedTx.addInput({
            index: input.index,
            script: new Uint8Array(),
            sequence: input.sequence ?? 0xffffffff,
            txid: input.txid,
            value: input.value,
          });
        }

        const zcashApi = getUtxoApi(Chain.Zcash);
        const inputUtxos = await resolveZcashPreviousTransactions({
          getRawTx: (txid) => zcashApi.getRawTx(txid),
          inputs,
        });

        for (let i = 0; i < pczt.outputsLength; i++) {
          const output = pczt.getOutput(i);
          unsignedTx.addOutput({ amount: output.value, script: output.scriptPubkey });
        }

        const signedTxHex = await runBtcOperation({
          operation: (app) =>
            signUTXOTransaction(
              { btcApp: app, chain, derivationPath, inputUtxos, tx: unsignedTx as unknown as Transaction },
              {
                ...additionalSignParams,
                expiryHeight: (() => {
                  const buf = Buffer.alloc(4);
                  buf.writeUInt32LE(global.expiryHeight);
                  return buf;
                })(),
                lockTime: global.lockTime,
              },
            ),
          requiredUserInteraction: UserInteractionRequired.SignTransaction,
        });

        const signedTx = ZcashTransaction.fromHex(signedTxHex, { allowUnknownOutputs: true });
        const signedPczt = pczt.clone();

        for (let i = 0; i < signedTx.inputsLength; i++) {
          const signedInput = signedTx.getInput(i);
          if (signedInput.script && signedInput.script.length > 0) {
            const scriptParts = Script.decode(signedInput.script);
            if (scriptParts.length >= 2) {
              signedPczt.addSignature(i, scriptParts[1] as Uint8Array, scriptParts[0] as Uint8Array);
            }
          }
        }

        return signedPczt;
      },
      signTransaction: async (tx: Transaction, inputUtxos: UTXOType[]) => {
        return await runBtcOperation({
          operation: (app) =>
            signUTXOTransaction({ btcApp: app, chain, derivationPath, inputUtxos, tx }, additionalSignParams),
          requiredUserInteraction: UserInteractionRequired.SignTransaction,
        });
      },

      /**
       * Sign a transaction with multiple derivation paths for HD wallet multi-address support.
       * Each input can be signed with its own derivation path.
       */
      signTransactionWithMultiplePaths: async (tx: Transaction, inputUtxos: UTXOType[], derivationPaths: string[]) => {
        return await runBtcOperation({
          operation: (app) =>
            signUTXOTransactionWithMultiplePaths(
              { btcApp: app, chain, derivationPaths, inputUtxos, tx },
              additionalSignParams,
            ),
          requiredUserInteraction: UserInteractionRequired.SignTransaction,
        });
      },
    };
  };
};

export const BitcoinLedger = BaseLedgerUTXO({ chain: "bitcoin" });
export const LitecoinLedger = BaseLedgerUTXO({ chain: "litecoin" });

export const BitcoinCashLedger = BaseLedgerUTXO({
  additionalSignParams: { additionals: ["abc"], segwit: false, sigHashType: 0x41 },
  chain: "bitcoin-cash",
});

export const DogecoinLedger = BaseLedgerUTXO({
  additionalSignParams: { additionals: [], segwit: false, useTrustedInputForSegwit: false },
  chain: "dogecoin",
});

export const DashLedger = BaseLedgerUTXO({
  additionalSignParams: { additionals: [], segwit: false, useTrustedInputForSegwit: false },
  chain: "dash",
});

export const ZcashLedger = BaseLedgerUTXO({
  additionalSignParams: {
    additionals: ["zcash", "sapling"],
    expiryHeight: (() => {
      const buf = Buffer.alloc(4);
      buf.writeUInt32LE(0);
      return buf;
    })(),
    lockTime: 0,
    segwit: false,
    useTrustedInputForSegwit: false,
  },
  chain: "zcash",
});
