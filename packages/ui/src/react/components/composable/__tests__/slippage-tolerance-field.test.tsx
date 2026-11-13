import { describe, expect, mock, test } from "bun:test";

import "../../../__tests__/setup-dom";

import React from "react";
import { createRoot } from "react-dom/client";
import { SlippageToleranceField } from "../slippage-tolerance-field";

function renderIntoDocument(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(element);

  return { container, root };
}

function cleanup(container: HTMLElement, root: ReturnType<typeof createRoot>) {
  root.unmount();
  container.remove();
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

function findByText(container: HTMLElement, selector: string, text: string) {
  return Array.from(container.querySelectorAll(selector)).find((node) => node.textContent?.trim() === text) as
    | HTMLElement
    | undefined;
}

/** React tracks input values on the DOM node, so writing through the native setter is what makes onChange fire. */
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function renderExpanded(value: number) {
  const onChange = mock((_next: number) => {});
  const { container, root } = renderIntoDocument(React.createElement(SlippageToleranceField, { onChange, value }));
  await flush();

  container.querySelector("button")?.click();
  await flush();

  return { container, onChange, root };
}

describe("SlippageToleranceField", () => {
  test("collapsed summary shows the tolerance in effect", async () => {
    const { container, root } = renderIntoDocument(
      React.createElement(SlippageToleranceField, { onChange: () => {}, value: 1 }),
    );
    await flush();

    expect(container.textContent).toContain("Slippage tolerance");
    expect(container.textContent).toContain("1%");

    root.render(React.createElement(SlippageToleranceField, { onChange: () => {}, value: 0.25 }));
    await flush();

    expect(container.textContent).toContain("0.25%");

    cleanup(container, root);
  });

  test("expanding offers the presets", async () => {
    const { container, onChange, root } = await renderExpanded(1);

    for (const label of ["0.25%", "1%"]) {
      expect(findByText(container, "button", label)).toBeDefined();
    }
    expect(onChange).not.toHaveBeenCalled();

    cleanup(container, root);
  });

  test("picking a preset reports it as a percent number", async () => {
    const { container, onChange, root } = await renderExpanded(1);

    findByText(container, "button", "0.25%")?.click();
    await flush();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toBe(0.25);

    cleanup(container, root);
  });

  test("a valid custom value is committed, an out-of-range one is rejected", async () => {
    const { container, onChange, root } = await renderExpanded(1);
    const input = container.querySelector("input") as HTMLInputElement;

    typeInto(input, "2.5");
    await flush();
    expect(onChange.mock.calls.at(-1)?.[0]).toBe(2.5);

    typeInto(input, "51");
    await flush();
    expect(container.textContent).toContain("Maximum is 50%");
    // The rejected keystroke must not become the active tolerance.
    expect(onChange.mock.calls.at(-1)?.[0]).toBe(2.5);

    cleanup(container, root);
  });

  test("digits typed on the way to a value don't raise an error", async () => {
    const { container, onChange, root } = await renderExpanded(1);
    const input = container.querySelector("input") as HTMLInputElement;

    typeInto(input, "0");
    await flush();
    typeInto(input, "0.");
    await flush();

    expect(container.textContent).not.toContain("Minimum is");
    expect(onChange).not.toHaveBeenCalled();

    typeInto(input, "0.3");
    await flush();
    expect(onChange.mock.calls.at(-1)?.[0]).toBe(0.3);

    cleanup(container, root);
  });
});
