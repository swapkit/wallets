import type { SwapKitError } from "@swapkit/helpers";

type NotSupported = (reason: string) => SwapKitError;

const BODY = { AUXILIARY_DATA_HASH: 7, FEE: 2, INPUTS: 0, OUTPUTS: 1, TTL: 3, VALIDITY_INTERVAL_START: 8 } as const;
const SET_TAG = 258;

type CardanoTokenGroup = { policyId: Uint8Array; tokens: { amount: string; assetName: Uint8Array }[] };

function toCardanoUint(value: unknown, field: string, notSupported: NotSupported) {
  const isBigNumber = typeof value === "object" && value !== null && "toFixed" in value;
  const text = isBigNumber || Number.isSafeInteger(value) ? String((value as number).toFixed()) : "";
  if (!/^\d+$/.test(text)) throw notSupported(`Invalid ${field} in Cardano transaction`);
  return text;
}

function toTokenGroups(multiAsset: unknown, notSupported: NotSupported): CardanoTokenGroup[] {
  if (!(multiAsset instanceof Map)) throw notSupported("Invalid Cardano output value");

  return [...(multiAsset as Map<Uint8Array, Map<Uint8Array, unknown>>)].map(([policyId, assets]) => ({
    policyId,
    tokens: [...assets].map(([assetName, amount]) => ({
      amount: toCardanoUint(amount, "token amount", notSupported),
      assetName,
    })),
  }));
}

function readCardanoOutput(output: unknown, device: string, notSupported: NotSupported) {
  let address: unknown;
  let value: unknown;
  let format: "legacy" | "babbage";

  if (Array.isArray(output)) {
    if (output.length !== 2) throw notSupported(`${device} cannot sign Cardano outputs with a datum`);
    [address, value] = output;
    format = "legacy";
  } else if (output instanceof Map) {
    if (output.has(2)) throw notSupported(`${device} cannot sign Cardano outputs with a datum`);
    if (output.has(3)) throw notSupported(`${device} cannot sign Cardano outputs with a reference script`);
    if ([...output.keys()].some((key) => key !== 0 && key !== 1)) {
      throw notSupported("Unsupported field in Cardano output");
    }
    address = output.get(0);
    value = output.get(1);
    format = "babbage";
  } else {
    throw notSupported("Invalid Cardano output");
  }

  if (!(address instanceof Uint8Array)) throw notSupported("Invalid Cardano output address");
  if (Array.isArray(value) && value.length !== 2) throw notSupported("Invalid Cardano output value");
  const [coin, multiAsset] = Array.isArray(value) ? value : [value];

  return {
    address,
    amount: toCardanoUint(coin, "output amount", notSupported),
    format,
    tokenGroups: multiAsset === undefined ? undefined : toTokenGroups(multiAsset, notSupported),
  };
}

export function readCardanoBody(body: Map<number, unknown>, device: string, notSupported: NotSupported) {
  const supportedFields: unknown[] = Object.values(BODY);
  const unsupported = [...body.keys()].filter((field) => !supportedFields.includes(field));
  if (unsupported.length > 0) {
    throw notSupported(`${device} cannot sign Cardano transactions with body fields ${unsupported.join(", ")}`);
  }

  const rawInputs = body.get(BODY.INPUTS);
  const tagCborSets =
    typeof rawInputs === "object" &&
    rawInputs !== null &&
    "tag" in rawInputs &&
    rawInputs.tag === SET_TAG &&
    "value" in rawInputs;
  const inputList = tagCborSets ? (rawInputs as { value: unknown }).value : rawInputs;
  if (!Array.isArray(inputList)) throw notSupported("Invalid Cardano inputs");

  const inputs = inputList.map((input: unknown) => {
    if (!Array.isArray(input) || input.length !== 2) throw notSupported("Invalid Cardano input");
    const [txHash, index] = input as [unknown, unknown];
    if (!(txHash instanceof Uint8Array)) throw notSupported("Invalid Cardano input");
    return { index: Number(toCardanoUint(index, "input index", notSupported)), txHash };
  });

  const outputs = body.get(BODY.OUTPUTS);
  if (!Array.isArray(outputs)) throw notSupported("Invalid Cardano outputs");

  const auxiliaryDataHash = body.get(BODY.AUXILIARY_DATA_HASH);
  if (auxiliaryDataHash !== undefined && !(auxiliaryDataHash instanceof Uint8Array)) {
    throw notSupported("Invalid Cardano auxiliary data hash");
  }

  const ttl = body.get(BODY.TTL);
  const validityIntervalStart = body.get(BODY.VALIDITY_INTERVAL_START);

  return {
    auxiliaryDataHash,
    fee: toCardanoUint(body.get(BODY.FEE), "fee", notSupported),
    inputs,
    outputs: outputs.map((output) => readCardanoOutput(output, device, notSupported)),
    tagCborSets,
    ttl: ttl === undefined ? undefined : toCardanoUint(ttl, "ttl", notSupported),
    validityIntervalStart:
      validityIntervalStart === undefined
        ? undefined
        : toCardanoUint(validityIntervalStart, "validity interval start", notSupported),
  };
}

export type CardanoOutputFields = ReturnType<typeof readCardanoOutput>;
