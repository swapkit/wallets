import { afterEach, describe, expect, mock, test } from "bun:test";

import "../../../__tests__/setup-dom";

import { Chain } from "@swapkit/helpers";
import { createRoot } from "react-dom/client";
import type { DerivationSettings } from "../../../lib/derivation-presets";
import { WalletKeystoreDerivation } from "../wallet-keystore-derivation";

const MAX_INDEX = 2 ** 31 - 1;

const flush = () => new Promise((resolve) => setTimeout(resolve, 30));

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

async function renderDerivation(
  value: DerivationSettings,
  chains: Chain[] = [Chain.Bitcoin],
  onChange = mock(() => {}),
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(<WalletKeystoreDerivation chains={chains} onChange={onChange} value={value} />);

  await flush();

  // The section is collapsed until its header is clicked, and renders no children until then.
  (document.body.querySelector("button") as HTMLButtonElement).click();
  await flush();

  return onChange;
}

afterEach(() => {
  root?.unmount();
  container?.remove();
  document.body.innerHTML = "";
});

describe("the field that moves the last slot of every path", () => {
  test("calls itself the wallet index, not the account", async () => {
    await renderDerivation({ accountIndex: 0, overrides: {} });

    expect(document.body.textContent).toContain("Wallet index");
    expect(document.body.textContent).not.toContain("Account");
    expect(document.body.textContent).not.toContain("account");
  });
});

describe("the wallet index stepper", () => {
  function increaseButton() {
    return document.body.querySelector('[aria-label^="Increase"]') as HTMLButtonElement;
  }

  test("stops at the highest index the SDK can encode", async () => {
    await renderDerivation({ accountIndex: MAX_INDEX, overrides: {} });

    expect(increaseButton().disabled).toBe(true);
  });

  test("still steps up below the ceiling", async () => {
    const onChange = await renderDerivation({ accountIndex: MAX_INDEX - 1, overrides: {} }, [Chain.Bitcoin]);

    expect(increaseButton().disabled).toBe(false);

    increaseButton().click();
    await flush();

    expect(onChange).toHaveBeenCalledWith({ accountIndex: MAX_INDEX, overrides: {} });
  });
});

describe("a chain that derives one wallet only", () => {
  test("says so, and says how to keep a higher wallet index on its siblings", async () => {
    await renderDerivation({ accountIndex: 3, overrides: {} }, [Chain.Ton, Chain.Ethereum]);

    expect(document.body.textContent).toContain("TON can only derive wallet index 0");
    expect(document.body.textContent).toContain("per-chain override at index 0");
  });

  test("says nothing once it has its own override at index 0", async () => {
    await renderDerivation(
      { accountIndex: 3, overrides: { [Chain.Ton]: { customPath: "", index: 0, standard: "default" } } },
      [Chain.Ton, Chain.Ethereum],
    );

    expect(document.body.textContent).not.toContain("can only derive wallet index 0");
  });

  test("says nothing about the chains that derive more than one wallet", async () => {
    await renderDerivation({ accountIndex: 3, overrides: {} }, [Chain.Bitcoin, Chain.Ethereum]);

    expect(document.body.textContent).not.toContain("can only derive wallet index 0");
  });
});
