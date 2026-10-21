import { AssetValue, Chain, SwapKitError, type UTXOChain } from "@swapkit/helpers";
import { getNetworkForChain, stripPrefix, stripToCashAddress } from "@swapkit/toolboxes/utxo";
import type { Transaction } from "@swapkit/utxo-signer";

type UtxoTransferIntentParams = {
  chain: Exclude<UTXOChain, typeof Chain.Zcash>;
  changeAddresses?: string[];
  senderAddress: string;
  tx: Transaction;
};

export type UtxoTransferIntent = {
  amountBase: bigint;
  asset: { chain: UTXOChain; symbol: string; ticker: string };
  assetValue: AssetValue;
  changeOutputs: Array<{ address: string; amountBase: bigint }>;
  from: string;
  memo?: string;
  recipient: string;
};

function normalizeUtxoAddress(address: string, chain: UTXOChain) {
  if (chain === Chain.BitcoinCash) {
    try {
      return stripPrefix(stripToCashAddress(address));
    } catch {
      return stripPrefix(address);
    }
  }

  return address;
}

function decodeOpReturnMemo(script: Uint8Array) {
  if (script.length < 2 || script[0] !== 0x6a) return undefined;

  let offset = 1;
  const pushOpcode = script[offset];
  if (pushOpcode === undefined) return undefined;

  let dataLength = pushOpcode;
  offset += 1;

  if (pushOpcode === 0x4c) {
    const length = script[offset];
    if (length === undefined) return undefined;
    dataLength = length;
    offset += 1;
  } else if (pushOpcode === 0x4d) {
    const first = script[offset];
    const second = script[offset + 1];
    if (first === undefined || second === undefined) return undefined;
    dataLength = first | (second << 8);
    offset += 2;
  } else if (pushOpcode === 0x4e) {
    const first = script[offset];
    const second = script[offset + 1];
    const third = script[offset + 2];
    const fourth = script[offset + 3];
    if (first === undefined || second === undefined || third === undefined || fourth === undefined) return undefined;
    dataLength = first | (second << 8) | (third << 16) | (fourth << 24);
    offset += 4;
  } else if (pushOpcode > 0x4e) {
    return undefined;
  }

  if (dataLength < 0 || script.length < offset + dataLength) return undefined;

  return Buffer.from(script.slice(offset, offset + dataLength)).toString("utf8");
}

function isKnownChangeAddress(address: string, knownChangeAddresses: Set<string>, chain: UTXOChain) {
  return knownChangeAddresses.has(normalizeUtxoAddress(address, chain));
}

export function getNativeUtxoAsset(chain: UTXOChain) {
  return { chain, symbol: chain, ticker: chain };
}

export function extractUtxoTransferIntent({
  chain,
  changeAddresses = [],
  senderAddress,
  tx,
}: UtxoTransferIntentParams): UtxoTransferIntent {
  const network = getNetworkForChain(chain);
  const knownChangeAddresses = new Set(
    [senderAddress, ...changeAddresses].filter(Boolean).map((address) => normalizeUtxoAddress(address, chain)),
  );
  const spendOutputs: Array<{ address: string; amountBase: bigint }> = [];
  const changeOutputs: Array<{ address: string; amountBase: bigint }> = [];
  const memos: string[] = [];

  for (let index = 0; index < tx.outputsLength; index++) {
    const output = tx.getOutput(index);
    const amountBase = output.amount ?? 0n;
    const address = tx.getOutputAddress(index, network);

    if (!address) {
      const memo = output.script ? decodeOpReturnMemo(output.script) : undefined;
      if (memo !== undefined && amountBase === 0n) {
        memos.push(memo);
        continue;
      }

      throw new SwapKitError("plugin_swapkit_invalid_transaction", {
        chain,
        outputIndex: index,
        reason: "Unable to decode UTXO output address",
      });
    }

    const normalizedAddress = chain === Chain.BitcoinCash ? normalizeUtxoAddress(address, chain) : address;

    if (isKnownChangeAddress(address, knownChangeAddresses, chain)) {
      changeOutputs.push({ address: normalizedAddress, amountBase });
      continue;
    }

    spendOutputs.push({ address: normalizedAddress, amountBase });
  }

  if (memos.length > 1) {
    throw new SwapKitError("plugin_swapkit_invalid_transaction", {
      chain,
      reason: "Multiple OP_RETURN memo outputs are not supported",
    });
  }

  if (spendOutputs.length !== 1) {
    throw new SwapKitError("plugin_swapkit_invalid_transaction", {
      chain,
      outputCount: spendOutputs.length,
      reason: "Expected exactly one recipient output",
    });
  }

  const [spendOutput] = spendOutputs;
  if (!spendOutput || spendOutput.amountBase <= 0n) {
    throw new SwapKitError("plugin_swapkit_invalid_transaction", {
      chain,
      reason: "Recipient output amount must be greater than zero",
    });
  }

  const assetValue = AssetValue.from({ chain, value: spendOutput.amountBase });
  const asset = getNativeUtxoAsset(chain);

  return {
    amountBase: spendOutput.amountBase,
    asset,
    assetValue,
    changeOutputs,
    from: senderAddress,
    memo: memos[0],
    recipient: spendOutput.address,
  };
}

export function unsupportedUtxoSignTransaction(wallet: string) {
  return Promise.reject(
    new SwapKitError("wallet_walletconnect_method_not_supported", {
      method: "signTransaction",
      reason: `${wallet} UTXO provider only supports signAndBroadcastTransaction`,
      wallet,
    }),
  );
}
