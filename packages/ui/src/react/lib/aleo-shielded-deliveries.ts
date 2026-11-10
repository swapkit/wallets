const SHIELDED_DELIVERIES_PREFIX = "sk-aleo-shielded-";
const UNSHIELD_RESUME_PREFIX = "sk-aleo-unshield-resume-";

function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

function getShieldedDeliveriesKey(address: string) {
  return `${SHIELDED_DELIVERIES_PREFIX}${normalizeAddress(address)}`;
}

function getUnshieldResumeKey(address: string, deliveryHash: string) {
  return `${UNSHIELD_RESUME_PREFIX}${normalizeAddress(address)}-${deliveryHash}`;
}

function readStringList(key: string) {
  if (typeof localStorage === "undefined") return [];

  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function getAleoShieldedDeliveryHashes(address: string) {
  return readStringList(getShieldedDeliveriesKey(address));
}

export function addAleoShieldedDeliveryHash(address: string, deliveryHash: string) {
  if (typeof localStorage === "undefined") return;

  const hashes = getAleoShieldedDeliveryHashes(address);
  if (hashes.includes(deliveryHash)) return;
  localStorage.setItem(getShieldedDeliveriesKey(address), JSON.stringify([...hashes, deliveryHash]));
}

export function removeAleoShieldedDeliveryHashes(address: string, deliveryHashes: readonly string[]) {
  if (typeof localStorage === "undefined") return;

  const removed = new Set(deliveryHashes);
  const remaining = getAleoShieldedDeliveryHashes(address).filter((hash) => !removed.has(hash));
  const key = getShieldedDeliveriesKey(address);

  if (remaining.length) localStorage.setItem(key, JSON.stringify(remaining));
  else localStorage.removeItem(key);
}

export function getAleoUnshieldResumeTransaction(address: string, deliveryHashes: readonly string[]) {
  if (typeof localStorage === "undefined") return undefined;

  for (const deliveryHash of deliveryHashes) {
    const transactionId = localStorage.getItem(getUnshieldResumeKey(address, deliveryHash));
    if (transactionId) return transactionId;
  }

  return undefined;
}

export function persistAleoUnshieldResumeTransaction(
  address: string,
  deliveryHashes: readonly string[],
  splitTransactionId: string,
) {
  if (typeof localStorage === "undefined") return;

  for (const deliveryHash of deliveryHashes) {
    localStorage.setItem(getUnshieldResumeKey(address, deliveryHash), splitTransactionId);
  }
}

export function clearAleoUnshieldResumeTransactions(address: string, deliveryHashes: readonly string[]) {
  if (typeof localStorage === "undefined") return;

  for (const deliveryHash of deliveryHashes) {
    localStorage.removeItem(getUnshieldResumeKey(address, deliveryHash));
  }
}
