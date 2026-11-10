export type LimitDirection = "sell" | "buy";

export type LimitPriceBand = "resting" | "withinFeeGap" | "beyond";

export type LimitPercentInput =
  | { status: "empty" }
  | { status: "incomplete" }
  | { status: "invalid" }
  | { status: "valid"; percent: string };

export type LimitQuoteParams = {
  buyAmount?: string;
  buyAsset: string;
  limitPrice: string;
  sellAmount?: string;
  sellAsset: string;
};

export type LimitTriggerSummaryData = {
  amountRole: "receive" | "pay";
  condition: "atOrAbove" | "atOrBelow";
  price: string;
  quoteAmount: string;
};

export const LIMIT_PRICE_PRESETS: Record<LimitDirection, readonly number[]> = { buy: [-10, -5, 0], sell: [0, 5, 10] };

export const LIMIT_DEFAULT_PRESET: Record<LimitDirection, number> = { buy: -5, sell: 5 };

export const LIMIT_BEYOND_DEVIATION_BPS = -100;

type Rounding = "down" | "halfUp" | "up";

const SCALE = 36;
const ONE = 10n ** BigInt(SCALE);
const HUNDRED = 100n * ONE;
const BPS = 10_000n * ONE;
const WIRE_SIGNIFICANT_DIGITS = 18;
const DISPLAY_SIGNIFICANT_DIGITS = 4;
const DISPLAY_MIN_DECIMALS = 2;
const PERCENT_DECIMALS = 2;
const PERCENT_DISPLAY_DECIMALS = 1;

function toUnits(value: string) {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(value.trim());
  if (!match) return null;
  const [, sign, whole = "", fraction = ""] = match;
  if (!whole && !fraction) return null;
  const magnitude = BigInt(`${whole || "0"}${fraction.slice(0, SCALE).padEnd(SCALE, "0")}`);
  return sign === "-" ? -magnitude : magnitude;
}

function toPositiveUnits(value: string) {
  const units = toUnits(value);
  return units !== null && units > 0n ? units : null;
}

export function isPositiveAmount(value: string) {
  return toPositiveUnits(value) !== null;
}

function mul(a: bigint, b: bigint) {
  return (a * b) / ONE;
}

function div(a: bigint, b: bigint) {
  return (a * ONE) / b;
}

function fixed(units: bigint, decimals: number, rounding: Rounding) {
  const negative = units < 0n;
  const magnitude = negative ? -units : units;
  const step = 10n ** BigInt(SCALE - decimals);
  const remainder = magnitude % step;
  const roundsUp = remainder > 0n && (rounding === "up" || (rounding === "halfUp" && remainder * 2n >= step));
  const quotient = magnitude / step + (roundsUp ? 1n : 0n);
  const digits = quotient.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const body = decimals > 0 ? `${whole}.${digits.slice(digits.length - decimals)}` : whole;
  return negative && quotient > 0n ? `-${body}` : body;
}

function trimZeros(value: string, minDecimals = 0) {
  const [whole = "0", fraction = ""] = value.split(".");
  let end = fraction.length;
  while (end > minDecimals && fraction[end - 1] === "0") end--;
  return end > 0 ? `${whole}.${fraction.slice(0, end)}` : whole;
}

function decimalsFor(units: bigint, significantDigits: number, minDecimals: number) {
  const magnitude = units < 0n ? -units : units;
  if (magnitude === 0n) return minDecimals;
  const wholeDigits = magnitude >= ONE ? (magnitude / ONE).toString().length : 0;
  const leadingZeros = magnitude >= ONE ? 0 : SCALE - magnitude.toString().length;
  return Math.min(SCALE, Math.max(minDecimals, significantDigits - wholeDigits + leadingZeros));
}

function toSignificant(units: bigint, significantDigits: number) {
  return trimZeros(fixed(units, decimalsFor(units, significantDigits, 0), "halfUp"));
}

function toDisplayDecimals(units: bigint, rounding: Rounding) {
  return fixed(units, decimalsFor(units, DISPLAY_SIGNIFICANT_DIGITS, DISPLAY_MIN_DECIMALS), rounding);
}

export function groupDigits(value: string) {
  const [whole = "0", fraction] = value.split(".");
  const negative = whole.startsWith("-");
  const digits = negative ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${fraction === undefined ? "" : `.${fraction}`}`;
}

function reorient(direction: LimitDirection, units: bigint) {
  return direction === "sell" ? units : div(ONE, units);
}

function orientedUnits(direction: LimitDirection, value: string) {
  const units = toPositiveUnits(value);
  return units === null ? null : reorient(direction, units);
}

function flipPrice(direction: LimitDirection, price: string) {
  const units = orientedUnits(direction, price);
  return units === null ? null : toSignificant(units, WIRE_SIGNIFICANT_DIGITS);
}

export function compareWirePrices(a: string, b: string) {
  const left = toPositiveUnits(a);
  const right = toPositiveUnits(b);
  if (left === null || right === null) return null;
  return left === right ? 0 : left > right ? 1 : -1;
}

export function getLimitSides({
  buyAsset,
  direction,
  sellAsset,
}: {
  buyAsset: string;
  direction: LimitDirection;
  sellAsset: string;
}) {
  return direction === "sell"
    ? { baseAsset: sellAsset, quoteAsset: buyAsset }
    : { baseAsset: buyAsset, quoteAsset: sellAsset };
}

export function getLimitPair({
  baseAsset,
  direction,
  quoteAsset,
}: {
  baseAsset: string;
  direction: LimitDirection;
  quoteAsset: string;
}) {
  return direction === "sell"
    ? { buyAsset: quoteAsset, sellAsset: baseAsset }
    : { buyAsset: baseAsset, sellAsset: quoteAsset };
}

export function toDisplayPrice({ direction, wirePrice }: { direction: LimitDirection; wirePrice: string }) {
  return flipPrice(direction, wirePrice);
}

export function toWirePrice({ direction, displayPrice }: { direction: LimitDirection; displayPrice: string }) {
  return flipPrice(direction, displayPrice);
}

export function roundLimitPrice(price: string) {
  const units = toPositiveUnits(price);
  return units === null ? null : toDisplayDecimals(units, "halfUp");
}

export function formatLimitPrice(price: string) {
  const rounded = roundLimitPrice(price);
  return rounded === null ? null : groupDigits(rounded);
}

export function percentToLimitPrice({
  direction,
  effectiveFillPrice,
  percent,
}: {
  direction: LimitDirection;
  effectiveFillPrice: string;
  percent: string;
}) {
  const anchor = orientedUnits(direction, effectiveFillPrice);
  const offset = toUnits(percent);
  if (anchor === null || offset === null) return null;
  const price = div(mul(anchor, HUNDRED + offset), HUNDRED);
  return price > 0n ? toDisplayDecimals(price, "halfUp") : null;
}

export function limitPriceToPercent({
  direction,
  displayPrice,
  effectiveFillPrice,
}: {
  direction: LimitDirection;
  displayPrice: string;
  effectiveFillPrice: string;
}) {
  const anchor = orientedUnits(direction, effectiveFillPrice);
  const price = toPositiveUnits(displayPrice);
  if (anchor === null || anchor === 0n || price === null) return null;
  return trimZeros(fixed(div(mul(price, HUNDRED), anchor) - HUNDRED, PERCENT_DECIMALS, "halfUp"));
}

export function getLimitPresets({
  direction,
  effectiveFillPrice,
}: {
  direction: LimitDirection;
  effectiveFillPrice: string;
}) {
  return LIMIT_PRICE_PRESETS[direction].map((percent) => ({
    displayPrice: percentToLimitPrice({ direction, effectiveFillPrice, percent: String(percent) }),
    percent,
  }));
}

export function getDeviationBps({
  direction,
  displayPrice,
  effectiveFillPrice,
}: {
  direction: LimitDirection;
  displayPrice: string;
  effectiveFillPrice: string;
}) {
  const wireLimit = orientedUnits(direction, displayPrice);
  const wireAnchor = toPositiveUnits(effectiveFillPrice);
  if (wireLimit === null || wireAnchor === null) return null;
  return Math.round(Number(fixed(div(mul(wireLimit - wireAnchor, BPS), wireAnchor), 6, "down")));
}

export function getLimitPriceBand(spotPriceDeviationBps: number): LimitPriceBand {
  if (spotPriceDeviationBps > 0) return "resting";
  if (spotPriceDeviationBps > LIMIT_BEYOND_DEVIATION_BPS) return "withinFeeGap";
  return "beyond";
}

export function parseLimitPercentInput(raw: string): LimitPercentInput {
  const value = raw.trim().replace(/^−/, "-");
  if (!value) return { status: "empty" };
  if (!/^[+-]?\d*\.?\d*$/.test(value)) return { status: "invalid" };
  if (!/\d/.test(value)) return { status: "incomplete" };
  const units = toUnits(value);
  if (units === null || units <= -HUNDRED) return { status: "invalid" };
  return { percent: trimZeros(fixed(units, SCALE, "down")), status: "valid" };
}

export function formatLimitPercent(percent: string) {
  const units = toUnits(percent);
  if (units === null) return null;
  const rounded = fixed(units, PERCENT_DISPLAY_DECIMALS, "halfUp");
  if (rounded.startsWith("-")) return rounded;
  return toUnits(rounded) === 0n ? rounded : `+${rounded}`;
}

function quoteAmountUnits({ baseAmount, displayPrice }: { baseAmount: string; displayPrice: string }) {
  const base = toPositiveUnits(baseAmount);
  const price = toPositiveUnits(displayPrice);
  return base === null || price === null ? null : mul(base, price);
}

function quoteRounding(direction: LimitDirection): Rounding {
  return direction === "sell" ? "down" : "up";
}

export function getQuoteAmount({
  baseAmount,
  direction,
  displayPrice,
  quoteDecimals,
}: {
  baseAmount: string;
  direction: LimitDirection;
  displayPrice: string;
  quoteDecimals: number;
}) {
  const units = quoteAmountUnits({ baseAmount, displayPrice });
  return units === null ? null : trimZeros(fixed(units, quoteDecimals, quoteRounding(direction)));
}

export function getLimitQuoteParams({
  baseAmount,
  baseAsset,
  direction,
  displayPrice,
  quoteAsset,
}: {
  baseAmount: string;
  baseAsset: string;
  direction: LimitDirection;
  displayPrice: string;
  quoteAsset: string;
}): LimitQuoteParams | null {
  const limitPrice = toWirePrice({ direction, displayPrice });
  const amount = toPositiveUnits(baseAmount);
  if (limitPrice === null || amount === null) return null;
  const pair = getLimitPair({ baseAsset, direction, quoteAsset });
  const normalizedAmount = trimZeros(fixed(amount, SCALE, "down"));
  return direction === "sell"
    ? { ...pair, limitPrice, sellAmount: normalizedAmount }
    : { ...pair, buyAmount: normalizedAmount, limitPrice };
}

export function formatQuoteAmount(amount: string, direction: LimitDirection) {
  const units = toPositiveUnits(amount);
  return units === null ? null : groupDigits(toDisplayDecimals(units, quoteRounding(direction)));
}

export function getTriggerSummary({
  direction,
  displayPrice,
  quoteAmount,
}: {
  direction: LimitDirection;
  displayPrice: string;
  quoteAmount: string;
}): LimitTriggerSummaryData | null {
  const price = formatLimitPrice(displayPrice);
  const amount = formatQuoteAmount(quoteAmount, direction);
  if (price === null || amount === null) return null;
  return {
    amountRole: direction === "sell" ? "receive" : "pay",
    condition: direction === "sell" ? "atOrAbove" : "atOrBelow",
    price,
    quoteAmount: amount,
  };
}

function usdToUnits(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return null;
  return toPositiveUnits(value.toLocaleString("en-US", { maximumFractionDigits: 20, useGrouping: false }));
}

export function getSeedWirePrice({
  buyPriceUsd,
  fallback,
  sellPriceUsd,
}: {
  buyPriceUsd?: number;
  fallback?: string | null;
  sellPriceUsd?: number;
}) {
  const sell = usdToUnits(sellPriceUsd);
  const buy = usdToUnits(buyPriceUsd);
  if (sell !== null && buy !== null) return toSignificant(div(sell, buy), WIRE_SIGNIFICANT_DIGITS);
  const fallbackUnits = fallback ? toPositiveUnits(fallback) : null;
  return fallbackUnits === null ? "1" : toSignificant(fallbackUnits, WIRE_SIGNIFICANT_DIGITS);
}

export function formatFeeBps(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}
