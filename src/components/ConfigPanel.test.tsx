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

function clickButton(text: string) {
  const button = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === text)!;
  act(() => button.click());
}

// The open chip editor whose heading reads `title`, e.g. "EDITING LABEL".
function chipEditor(title: string): HTMLElement {
  const heading = Array.from(host.querySelectorAll("span")).find((span) => span.textContent === title)!;
  return heading.parentElement!.parentElement!;
}

it("offers Layer mode for a category's picture but not for a reaction's", () => {
  act(() => root.render(<EditorProvider><ConfigPanel /></EditorProvider>));
  clickButton("Family×");
  const category = chipEditor("EDITING CATEGORY");
  type(category.querySelector<HTMLInputElement>('input[type="url"]')!, "https://example.com/family.png");
  expect(category.textContent).toContain("LAYER MODE");
  expect(category.querySelectorAll('input[type="radio"]')).toHaveLength(3);

  act(() =>
    Array.from(host.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("Add an experiment"))!
      .click(),
  );
  clickButton("Agree×");
  const label = chipEditor("EDITING LABEL");
  type(label.querySelector<HTMLInputElement>('input[type="url"]')!, "https://example.com/smile.png");
  expect(label.textContent).not.toContain("LAYER MODE");
  expect(label.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  // The hint says what the exported grid does with a reaction's picture.
  expect(label.textContent).toContain("Once a respondent reacts, this picture covers the whole pre-filled cell.");
  expect(label.textContent).toContain("Dropdown per cell shows only the label's name.");
});

it("says under the question box where respondents' wording comes from", () => {
  act(() => root.render(<EditorProvider><ConfigPanel /></EditorProvider>));
  const question = host.querySelector("textarea")!;
  const hint = document.getElementById(question.getAttribute("aria-describedby") ?? "");
  expect(hint?.textContent).toContain("Respondents see this wording.");
  expect(hint?.textContent).toContain("Leave it empty to use the wording written in Qualtrics instead");
});
