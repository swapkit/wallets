const TON_CONNECT_UI_ROOT_ID = "swapkit-tonconnect-root";

const CONTAINED_EVENTS = ["pointerdown", "focusin", "keydown", "wheel", "touchstart", "touchmove"];

// Keeps clicks, focus and scroll inside the TON Connect modal from reaching the widget dialog, which would close it or block scrolling.
export function ensureTonConnectUiRoot(doc: Document | undefined = globalThis.document) {
  if (!doc?.body) return undefined;

  const existing = doc.getElementById(TON_CONNECT_UI_ROOT_ID);
  if (existing) return existing;

  const root = doc.createElement("div");
  root.id = TON_CONNECT_UI_ROOT_ID;
  for (const type of CONTAINED_EVENTS) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }
  // Focus leaving the widget dialog fires focusout outside the root, so the dialog's focus trap has to be stopped at the document.
  doc.addEventListener(
    "focusout",
    (event) => {
      if (root.contains(event.relatedTarget as Node | null)) event.stopPropagation();
    },
    true,
  );
  doc.body.appendChild(root);

  return root;
}

export function getTonConnectUiOptions() {
  ensureTonConnectUiRoot();
  return { uiOptions: { widgetRootId: TON_CONNECT_UI_ROOT_ID } };
}
