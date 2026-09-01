import { Window } from "happy-dom";

if (!(globalThis as any).__HAPPY_DOM_SETUP__) {
  (globalThis as any).__HAPPY_DOM_SETUP__ = true;

  const window = new Window({ url: "https://localhost:8080" });

  // happy-dom's internal SelectorParser accesses this.window.SyntaxError
  // which may not be set when Window is instantiated outside the browser.
  // Polyfill it so querySelector with attribute selectors works.
  if (!(window as any).SyntaxError) {
    (window as any).SyntaxError = SyntaxError;
  }

  const globals = [
    "document",
    "HTMLElement",
    "HTMLDivElement",
    "HTMLButtonElement",
    "HTMLStyleElement",
    "MutationObserver",
    "navigator",
    "Node",
    "customElements",
    "CustomEvent",
    "Event",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ] as const;

  for (const key of globals) {
    if (key in window) {
      (globalThis as any)[key] = (window as any)[key];
    }
  }

  (globalThis as any).window = window;
}
