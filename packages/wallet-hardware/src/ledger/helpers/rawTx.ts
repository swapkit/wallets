export function createCachedRawTxResolver(getRawTx: (txid: string) => Promise<string>) {
  const requests = new Map<string, Promise<string>>();

  return function resolveRawTx(txid: string) {
    const cachedRequest = requests.get(txid);
    if (cachedRequest) return cachedRequest;

    const request = getRawTx(txid);
    requests.set(txid, request);
    return request;
  };
}
