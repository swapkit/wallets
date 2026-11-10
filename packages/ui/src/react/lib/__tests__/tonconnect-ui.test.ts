import { afterEach, describe, expect, test } from "bun:test";
import { ensureTonConnectUiRoot, getTonConnectUiOptions } from "../tonconnect-ui";

const ROOT_ID = getTonConnectUiOptions().uiOptions.widgetRootId;

function focusOut(from: Element, relatedTarget: Element) {
  const event = new Event("focusout", { bubbles: true });
  Object.defineProperty(event, "relatedTarget", { value: relatedTarget });
  from.dispatchEvent(event);
}

describe("ensureTonConnectUiRoot", () => {
  afterEach(() => {
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById("widget-dialog")?.remove();
  });

  test("creates a single root under body and reuses it", () => {
    const first = ensureTonConnectUiRoot();
    const second = ensureTonConnectUiRoot();

    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(first?.parentElement).toBe(document.body);
    expect(document.querySelectorAll(`#${ROOT_ID}`).length).toBe(1);
  });

  test("stops pointer, focus, key and scroll events from reaching the document", () => {
    const types = ["pointerdown", "focusin", "keydown", "wheel", "touchstart", "touchmove"];
    const root = ensureTonConnectUiRoot();
    const child = document.createElement("button");
    root?.appendChild(child);

    const reached: string[] = [];
    const listener = (event: Event) => reached.push(event.type);
    for (const type of types) document.addEventListener(type, listener);

    for (const type of types) {
      child.dispatchEvent(new Event(type, { bubbles: true }));
    }

    for (const type of types) document.removeEventListener(type, listener);
    expect(reached).toEqual([]);
  });

  test("hides focus moving from the widget dialog into the modal from the dialog's focus trap", () => {
    const root = ensureTonConnectUiRoot();
    const modalButton = document.createElement("button");
    root?.appendChild(modalButton);
    const dialog = document.createElement("div");
    dialog.id = "widget-dialog";
    const dialogButton = document.createElement("button");
    dialog.appendChild(dialogButton);
    document.body.appendChild(dialog);
    const otherDialogButton = document.createElement("button");
    dialog.appendChild(otherDialogButton);

    const reached: (EventTarget | null)[] = [];
    const listener = (event: Event) => reached.push((event as FocusEvent).relatedTarget);
    document.addEventListener("focusout", listener);

    focusOut(dialogButton, modalButton);
    focusOut(dialogButton, otherDialogButton);

    document.removeEventListener("focusout", listener);
    expect(reached).toEqual([otherDialogButton]);
  });
});

describe("getTonConnectUiOptions", () => {
  afterEach(() => document.getElementById(ROOT_ID)?.remove());

  test("creates the root it points TON Connect to", () => {
    const { uiOptions } = getTonConnectUiOptions();

    expect(document.getElementById(uiOptions.widgetRootId)?.parentElement).toBe(document.body);
  });
});
