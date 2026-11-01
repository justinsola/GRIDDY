import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import CategoryChips, { ChipItem } from "./CategoryChips";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const host = document.createElement("div");
document.body.appendChild(host);
let root = createRoot(host);

afterEach(() => {
  act(() => root.unmount());
  root = createRoot(host);
});

function openChip(items: ChipItem[], name: string) {
  const onChange = vi.fn();
  act(() => root.render(<CategoryChips items={items} onChange={onChange} />));
  const chip = Array.from(host.querySelectorAll("button")).find((b) =>
    b.textContent?.startsWith(name),
  )!;
  act(() => chip.click());
  return { onChange, input: host.querySelector<HTMLInputElement>('input[type="text"]')! };
}

function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const items: ChipItem[] = [
  { name: "Family", color: "#ff0000" },
  { name: "Friends", color: "#00ff00" },
];

it("does not rename a label to another label's name, even for a moment", () => {
  const { onChange, input } = openChip(items, "Friends");
  type(input, "Family");
  expect(onChange).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Another label is already called "Family"');
  type(input, "Family2");
  expect(onChange).toHaveBeenLastCalledWith([
    { name: "Family", color: "#ff0000" },
    { name: "Family2", color: "#00ff00" },
  ]);
});

it("keeps commas out of label names", () => {
  const { onChange, input } = openChip(items, "Friends");
  type(input, "Mom, Dad");
  expect(onChange).toHaveBeenLastCalledWith([
    { name: "Family", color: "#ff0000" },
    { name: "Mom Dad", color: "#00ff00" },
  ]);
  expect(host.textContent).toContain("Names can't contain commas.");
});

it("drops spaces at the ends of a name when the field is left", () => {
  const { onChange, input } = openChip(items, "Friends");
  type(input, "Neighbours ");
  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith([
    { name: "Family", color: "#ff0000" },
    { name: "Neighbours", color: "#00ff00" },
  ]);
});
