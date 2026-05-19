import type BitcoinApp from "@ledgerhq/hw-app-btc";
import type { CreateTransactionArg } from "@ledgerhq/hw-app-btc/lib-es/createTransaction";
import type Transport from "@ledgerhq/hw-transport";
import { hex } from "@scure/base";
import { type DerivationPathArray, derivationPathToString, getWalletFormatFor, SwapKitError } from "@swapkit/helpers";
import type { UTXOType } from "@swapkit/toolboxes/utxo";
import type { PCZT, Transaction } from "@swapkit/utxo-signer";

import { getLedgerTransport } from "../helpers/getLedgerTransport";

const nonSegwitLedgerChains = ["bitcoin-cash", "dash", "dogecoin", "zcash"];

type Params = {
  tx: Transaction;
  inputUtxos: UTXOType[];
  btcApp: BitcoinApp;
  derivationPath: string;
  chain: "bitcoin-cash" | "bitcoin" | "litecoin" | "dogecoin" | "dash" | "zcash";
};

type MultiPathParams = Omit<Params, "derivationPath"> & {
  /** Derivation paths for each input - one per input */
  derivationPaths: string[];
};

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

  const params: CreateTransactionArg = {
    additionals: ["bech32"],
    associatedKeysets: inputs.map(() => derivationPath),
    inputs,
    outputScriptHex,
    segwit: true,
    useTrustedInputForSegwit: true,
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

  const params: CreateTransactionArg = {
    additionals: ["bech32"],
    associatedKeysets: derivationPaths,
    inputs,
    outputScriptHex,
    segwit: true,
    useTrustedInputForSegwit: true,
  };

  return btcApp.createPaymentTransaction({ ...params, ...options });
};

const BaseLedgerUTXO = ({
  chain,
  additionalSignParams,
}: {
  chain: "bitcoin-cash" | "bitcoin" | "litecoin" | "dogecoin" | "dash" | "zcash";
  additionalSignParams?: Partial<CreateTransactionArg>;
}) => {
  return (derivationPathArray?: DerivationPathArray | string, injectedTransport?: Transport) => {
    // Per-call state — each BitcoinLedger/LitecoinLedger/... invocation has its own
    // transport + btcApp so different consumers (e.g. concurrent MCP sessions) cannot
    // cross-contaminate each other's Ledger device handle.
    let btcApp: InstanceType<typeof BitcoinApp> | undefined;
    let transport: any = null;

    async function createTransportWebUSB() {
      transport ||= injectedTransport ?? (await getLedgerTransport());
      const BitcoinApp = (await import("@ledgerhq/hw-app-btc")).default;

      btcApp ||= new BitcoinApp({ currency: chain, transport });
      return btcApp;
    }

    async function getBtcApp() {
      return btcApp || createTransportWebUSB();
    }

    async function disconnect() {
      if (!injectedTransport) await transport?.close?.();
      btcApp = undefined;
      transport = null;
    }

    const derivationPath =
      typeof derivationPathArray === "string"
        ? derivationPathArray
        : derivationPathToString(derivationPathArray as DerivationPathArray);

    const format = getWalletFormatFor(derivationPath);

    return {
      connect: async () => {
        await getBtcApp();
      },
      disconnect,
      getAddress: async () => {
        const { toCashAddress } = await import("@swapkit/toolboxes/utxo");

        const app = await getBtcApp();

        const { bitcoinAddress: address } = await app.getWalletPublicKey(derivationPath, { format });

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
        const app = await getBtcApp();

        return app.getWalletXpub({ path, xpubVersion });
      },

      signPCZT: async (pczt: PCZT): Promise<PCZT> => {
        if (chain !== "zcash") {
          throw new SwapKitError("wallet_ledger_chain_not_supported", {
            message: "PCZT signing is only supported for Zcash",
          });
        }

        const app = await getBtcApp();

        const { ZcashTransaction, Script } = await import("@swapkit/utxo-signer");

        const global = pczt.getGlobal();

        const unsignedTx = new ZcashTransaction({
          consensusBranchId: global.consensusBranchId,
          expiryHeight: global.expiryHeight,
          lockTime: global.lockTime,
          version: global.txVersion,
          versionGroupId: global.versionGroupId,
        });

        const inputUtxos: UTXOType[] = [];

        for (let i = 0; i < pczt.inputsLength; i++) {
          const input = pczt.getInput(i);

          unsignedTx.addInput({
            index: input.index,
            script: new Uint8Array(),
            sequence: input.sequence ?? 0xffffffff,
            txid: input.txid,
            value: input.value,
          });

          inputUtxos.push({
            hash: hex.encode(new Uint8Array([...input.txid].reverse())),
            index: input.index,
            txHex: buildMinimalPrevTxHex(input, global),
            value: Number(input.value),
            witnessUtxo: { script: input.scriptPubkey, value: Number(input.value) },
          } as UTXOType);
        }

        for (let i = 0; i < pczt.outputsLength; i++) {
          const output = pczt.getOutput(i);
          unsignedTx.addOutput({ amount: output.value, script: output.scriptPubkey });
        }

        const signedTxHex = await signUTXOTransaction(
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
        );

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
        const app = await getBtcApp();

        return signUTXOTransaction({ btcApp: app, chain, derivationPath, inputUtxos, tx }, additionalSignParams);
      },

      /**
       * Sign a transaction with multiple derivation paths for HD wallet multi-address support.
       * Each input can be signed with its own derivation path.
       */
      signTransactionWithMultiplePaths: async (tx: Transaction, inputUtxos: UTXOType[], derivationPaths: string[]) => {
        const app = await getBtcApp();

        return signUTXOTransactionWithMultiplePaths(
          { btcApp: app, chain, derivationPaths, inputUtxos, tx },
          additionalSignParams,
        );
      },
    };
  };
};

function buildMinimalPrevTxHex(
  input: { txid: Uint8Array; index: number; scriptPubkey: Uint8Array; value: bigint },
  global: { txVersion: number; versionGroupId: number; expiryHeight: number; lockTime: number },
): string {
  const parts: number[] = [];

  const version = (global.txVersion | 0x80000000) >>> 0;
  parts.push(version & 0xff, (version >> 8) & 0xff, (version >> 16) & 0xff, (version >> 24) & 0xff);

  const vgid = global.versionGroupId;
  parts.push(vgid & 0xff, (vgid >> 8) & 0xff, (vgid >> 16) & 0xff, (vgid >> 24) & 0xff);

  parts.push(0);

  const outputCount = input.index + 1;
  if (outputCount < 0xfd) {
    parts.push(outputCount);
  } else {
    parts.push(0xfd, outputCount & 0xff, (outputCount >> 8) & 0xff);
  }

  for (let i = 0; i < input.index; i++) {
    parts.push(0, 0, 0, 0, 0, 0, 0, 0);
    parts.push(0);
  }

  const value = input.value;
  parts.push(
    Number(value & 0xffn),
    Number((value >> 8n) & 0xffn),
    Number((value >> 16n) & 0xffn),
    Number((value >> 24n) & 0xffn),
    Number((value >> 32n) & 0xffn),
    Number((value >> 40n) & 0xffn),
    Number((value >> 48n) & 0xffn),
    Number((value >> 56n) & 0xffn),
  );

  const script = input.scriptPubkey;
  if (script.length < 0xfd) {
    parts.push(script.length);
  } else {
    parts.push(0xfd, script.length & 0xff, (script.length >> 8) & 0xff);
  }
  for (const byte of script) {
    parts.push(byte);
  }

  parts.push(
    global.lockTime & 0xff,
    (global.lockTime >> 8) & 0xff,
    (global.lockTime >> 16) & 0xff,
    (global.lockTime >> 24) & 0xff,
  );
  parts.push(
    global.expiryHeight & 0xff,
    (global.expiryHeight >> 8) & 0xff,
    (global.expiryHeight >> 16) & 0xff,
    (global.expiryHeight >> 24) & 0xff,
  );
  parts.push(0, 0, 0, 0, 0, 0, 0, 0); // value balance
  parts.push(0); // empty sapling spends
  parts.push(0); // empty sapling outputs
  parts.push(0); // empty joinsplits

  return hex.encode(new Uint8Array(parts));
}

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
