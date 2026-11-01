import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EditorProvider } from "../EditorContext";
import ConfigPanel from "./ConfigPanel";
import PreviewPanel from "./PreviewPanel";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const host = document.createElement("div");
document.body.appendChild(host);
let root = createRoot(host);

afterEach(() => {
  act(() => root.unmount());
  root = createRoot(host);
});

function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("only takes a whole number from 1 to 10 as the number of rows", () => {
  act(() => root.render(<EditorProvider><ConfigPanel /><PreviewPanel /></EditorProvider>));
  const rows = host.querySelectorAll<HTMLInputElement>('input[type="number"]')[0];
  expect(host.textContent).toContain("r3·c1");

  for (const bad of ["0", "-2", "2.5", "11"]) {
    type(rows, bad);
    expect(host.textContent).toContain("Use a whole number from 1 to 10");
    expect(host.textContent).toContain("r3·c1");
  }

  type(rows, "4");
  expect(host.textContent).not.toContain("Use a whole number from 1 to 10");
  expect(host.textContent).toContain("r4·c1");

  // Leaving the box with an unusable size puts back the last good one.
  type(rows, "0");
  act(() => {
    rows.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(rows.value).toBe("4");
  expect(host.textContent).not.toContain("Use a whole number from 1 to 10");
});
