import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import "../../../__tests__/setup-dom";

import { Chain, SwapKitError, UTXOScriptType, WalletOption } from "@swapkit/helpers";
import { createRoot } from "react-dom/client";
import { SwapKitConfigProvider } from "../../../swapkit-config-context";
import type { WalletDescriptor } from "../../../types";
import { WalletDeriveAddressDialog } from "../wallet-derive-address-dialog";

type DeriveCall = {
  accountIndex: number;
  chain: Chain;
  purpose?: number;
  scriptType: UTXOScriptType;
  startIndex?: number;
};

const deriveCalls: DeriveCall[] = [];

let holdBalance: (address: string) => boolean = () => false;
let heldBalances: Array<() => void> = [];
let balanceText: (address: string) => string = () => "1.25";

mock.module("@swapkit/toolboxes/utxo", () => ({
  deriveAddressesFromXpub: (params: DeriveCall & { count: number }) => {
    deriveCalls.push(params);
    const startIndex = params.startIndex ?? 0;
    const tag = `${params.purpose ?? "none"}-${params.accountIndex}`;

    return Array.from({ length: params.count }, (_, offset) => {
      const index = startIndex + offset;
      return [
        { address: `receive-${tag}-${index}`, change: false, index },
        { address: `change-${tag}-${index}`, change: true, index },
      ];
    }).flat();
  },
  getUTXOAddressPath: ({ accountIndex, change, index }: { accountIndex: number; change: boolean; index: number }) => [
    84,
    0,
    accountIndex,
    change ? 1 : 0,
    index,
  ],
  getUtxoToolbox: () => ({
    getBalance: async (address: string) => {
      if (holdBalance(address)) await new Promise<void>((resolve) => heldBalances.push(resolve));
      return [{ gt: () => true, toSignificant: () => balanceText(address) }];
    },
  }),
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 60));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((inner) => {
    resolve = inner;
  });
  return { promise, resolve };
}

const ledger: WalletDescriptor = {
  displayName: "Ledger",
  iconUrl: "",
  id: WalletOption.LEDGER,
  supportedChains: [Chain.Bitcoin],
  type: "static",
  walletOption: WalletOption.LEDGER,
};

const xpubRequests: number[] = [];
let xpubResponders: Array<() => Promise<{ xpub: string }>> = [];

const withXpub = (wallet: WalletDescriptor) =>
  ({
    ...wallet,
    getExtendedPublicKey: async (_chain: Chain, path: readonly number[]) => {
      xpubRequests.push(path?.[0] ?? -1);
      const responder = xpubResponders.shift();
      return responder ? await responder() : { xpub: `xpub-${path?.[0] ?? "default"}` };
    },
  }) as unknown as WalletDescriptor;

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

async function renderDialog({
  allowDerivationSelection,
  chain = Chain.Bitcoin,
  wallet,
}: {
  allowDerivationSelection: boolean;
  chain?: Chain;
  wallet: WalletDescriptor;
}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(
    <SwapKitConfigProvider allowDerivationSelection={allowDerivationSelection}>
      <WalletDeriveAddressDialog chain={chain} wallet={wallet} />
    </SwapKitConfigProvider>,
  );

  await flush();
  await flush();
}

function findByText(selector: string, text: string) {
  return Array.from(document.body.querySelectorAll(selector)).find((node) => node.textContent?.trim() === text) as
    | HTMLElement
    | undefined;
}

function addressRows() {
  return Array.from(document.body.querySelectorAll('[role="radio"]')) as HTMLElement[];
}

async function chooseStandard(label: string) {
  findByText("button", label)?.click();
  await flush();
  await flush();
}

beforeEach(() => {
  deriveCalls.length = 0;
  xpubRequests.length = 0;
  xpubResponders = [];
  heldBalances = [];
  holdBalance = () => false;
  balanceText = () => "1.25";
});

afterEach(() => {
  root?.unmount();
  container?.remove();
  document.body.innerHTML = "";
});

describe("WalletDeriveAddressDialog on a UTXO chain with an xpub getter", () => {
  test("lists derived addresses alongside the standard picker when selection is allowed", async () => {
    await renderDialog({ allowDerivationSelection: true, wallet: withXpub(ledger) });

    expect(document.body.textContent).toContain("Derivation standard");
    expect(document.body.textContent).toContain("Native SegWit");
    expect(document.body.textContent).toContain("Legacy");

    await chooseStandard("Native SegWit");

    const rows = addressRows();
    expect(rows.length).toBeGreaterThan(0);

    const firstRow = rows[0]?.textContent ?? "";
    expect(firstRow).toContain("receive-84-0");
    expect(firstRow).toContain("#0");
    expect(firstRow).toContain("m/84'/0'/0'/0/0");
    expect(firstRow).toContain("1.25 BTC");
  });

  test("still lists derived addresses with no standard picker when selection is off", async () => {
    await renderDialog({ allowDerivationSelection: false, wallet: withXpub(ledger) });

    expect(document.body.textContent).not.toContain("Derivation standard");
    expect(addressRows().length).toBeGreaterThan(0);
    expect(xpubRequests).toHaveLength(1);
    expect(deriveCalls[0]?.purpose).toBeUndefined();
    expect(deriveCalls[0]?.scriptType).toBe(UTXOScriptType.P2WPKH);
  });

  test("re-derives the list against the purpose and script type of the chosen standard", async () => {
    await renderDialog({ allowDerivationSelection: true, wallet: withXpub(ledger) });

    await chooseStandard("Native SegWit");
    expect(deriveCalls[0]).toMatchObject({ purpose: 84, scriptType: UTXOScriptType.P2WPKH });

    await chooseStandard("Legacy");

    expect(deriveCalls.at(-1)).toMatchObject({ purpose: 44, scriptType: UTXOScriptType.P2PKH });
    expect(addressRows().every((row) => !row.textContent?.includes("receive-84-"))).toBe(true);
    expect(addressRows()[0]?.textContent).toContain("receive-44-0");
  });

  test("Trezor reaches the same listing", async () => {
    await renderDialog({
      allowDerivationSelection: true,
      wallet: withXpub({ ...ledger, id: WalletOption.TREZOR, walletOption: WalletOption.TREZOR }),
    });

    expect(document.body.textContent).toContain("Derivation standard");

    await chooseStandard("Native SegWit");
    expect(addressRows().length).toBeGreaterThan(0);
  });
});

describe("WalletDeriveAddressDialog defers the device request until a standard is picked", () => {
  test("asks the device for nothing before the user has chosen a standard", async () => {
    await renderDialog({ allowDerivationSelection: true, wallet: withXpub(ledger) });

    expect(xpubRequests).toHaveLength(0);
    expect(deriveCalls).toHaveLength(0);
    expect(addressRows()).toHaveLength(0);
    expect(document.body.textContent).toContain("Derivation standard");
    expect(document.body.textContent).toContain("Pick a derivation standard to list addresses.");

    await chooseStandard("Legacy");

    expect(xpubRequests).toEqual([44]);
    expect(addressRows().length).toBeGreaterThan(0);
  });

  test("going back to a standard reuses the xpub it already fetched", async () => {
    await renderDialog({ allowDerivationSelection: true, wallet: withXpub(ledger) });

    await chooseStandard("Native SegWit");
    await chooseStandard("Legacy");
    await chooseStandard("Native SegWit");

    expect(xpubRequests).toEqual([84, 44]);
    expect(addressRows()[0]?.textContent).toContain("receive-84-0");
  });
});

describe("WalletDeriveAddressDialog drops work from a branch the user left", () => {
  test("rows from an in-flight load never land in the list of the standard picked after it", async () => {
    const held = deferred<{ xpub: string }>();

    xpubResponders = [
      () => Promise.reject(new Error("Device is locked")),
      () => held.promise,
      () => Promise.resolve({ xpub: "xpub-44" }),
    ];

    await renderDialog({ allowDerivationSelection: true, wallet: withXpub(ledger) });
    await chooseStandard("Native SegWit");

    expect(document.body.textContent).toContain("Device is locked");

    findByText("button", "Retry")?.click();
    await flush();

    await chooseStandard("Legacy");
    expect(addressRows()[0]?.textContent).toContain("receive-44-0");

    held.resolve({ xpub: "xpub-84" });
    await flush();
    await flush();

    expect(document.body.textContent).not.toContain("receive-84-");
    expect(addressRows().length).toBeGreaterThan(0);
    expect(addressRows().every((row) => row.textContent?.includes("-44-"))).toBe(true);
  });

  test("a balance that resolves after the standard changed does not overwrite the new list", async () => {
    holdBalance = (address) => address.includes("-84-");
    balanceText = (address) => (address.includes("-84-") ? "8.4" : "1.25");

    await renderDialog({ allowDerivationSelection: true, wallet: withXpub(ledger) });
    await chooseStandard("Native SegWit");

    expect(heldBalances.length).toBeGreaterThan(0);

    await chooseStandard("Legacy");
    expect(document.body.textContent).toContain("1.25 BTC");

    for (const release of heldBalances) release();
    await flush();
    await flush();

    expect(document.body.textContent).not.toContain("8.4 BTC");
    expect(document.body.textContent).toContain("1.25 BTC");
  });
});

describe("WalletDeriveAddressDialog without an xpub getter", () => {
  test("falls back to the standard-only picker", async () => {
    await renderDialog({ allowDerivationSelection: true, wallet: ledger });

    expect(document.body.textContent).toContain("Derivation standard");
    expect(addressRows()).toHaveLength(0);
    expect(deriveCalls).toHaveLength(0);
  });

  test("an EVM chain gets the standard-only picker with its index stepper and no device call", async () => {
    await renderDialog({
      allowDerivationSelection: true,
      chain: Chain.Ethereum,
      wallet: withXpub({ ...ledger, supportedChains: [Chain.Ethereum] }),
    });

    expect(addressRows()).toHaveLength(0);
    expect(deriveCalls).toHaveLength(0);
    expect(xpubRequests).toHaveLength(0);
    expect(document.body.textContent).toContain("Index");
    expect(document.body.textContent).toContain("m/44'/60'/0'/0/0");
  });
});

describe("WalletDeriveAddressDialog explains Ledger device errors", () => {
  test("a wrapped Ledger error key shows its message instead of the raw SDK error", async () => {
    const appNotOpen = new SwapKitError({ errorKey: "wallet_ledger_app_not_open", info: { statusWord: "6e00" } });
    xpubResponders = [() => Promise.reject(new Error("Failed to load xpub", { cause: appNotOpen }))];

    await renderDialog({ allowDerivationSelection: true, wallet: withXpub(ledger) });
    await chooseStandard("Native SegWit");

    expect(document.body.textContent).toContain("The wallet app on your device is not open");
    expect(document.body.textContent).not.toContain("wallet_ledger_app_not_open");
  });

  test.each([
    ["Unknown APDU", "Couldn't communicate with the device"],
    ["Device is busy", "Device is busy with another request"],
  ])("a Ledger transport error saying %p shows %p", async (message, expected) => {
    const transportError = new SwapKitError({ errorKey: "wallet_ledger_transport_error", info: { message } });
    xpubResponders = [() => Promise.reject(transportError)];

    await renderDialog({ allowDerivationSelection: true, wallet: withXpub(ledger) });
    await chooseStandard("Native SegWit");

    expect(document.body.textContent).toContain(expected);
  });
});
