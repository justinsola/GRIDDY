import { act, useState } from "react";
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

// Feeds each change back in, as the editor does, so the chips show what was saved.
function SavedLabels({ initial, onChange }: { initial: ChipItem[]; onChange: (items: ChipItem[]) => void }) {
  const [list, setList] = useState(initial);
  return (
    <CategoryChips
      items={list}
      onChange={(next) => {
        onChange(next);
        setList(next);
      }}
    />
  );
}

it("puts the old name back when the field is left on another label's name", () => {
  const onChange = vi.fn();
  act(() => root.render(<SavedLabels initial={items} onChange={onChange} />));
  const chipNames = () =>
    Array.from(host.querySelectorAll("button"))
      .filter((b) => b.textContent?.endsWith("×"))
      .map((b) => b.textContent!.slice(0, -1));
  act(() => Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Friends×")!.click());
  const input = host.querySelector<HTMLInputElement>('input[type="text"]')!;
  act(() => {
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  });

  // Typed one letter at a time: each shorter name is free, so each is saved.
  for (let n = 1; n <= "Family".length; n++) type(input, "Family".slice(0, n));
  expect(onChange.mock.calls.map(([next]) => next[1].name)).toEqual(["F", "Fa", "Fam", "Fami", "Famil"]);
  expect(chipNames()).toEqual(["Family", "Famil"]);
  expect(host.textContent).toContain('Another label is already called "Family"');

  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith([
    { name: "Family", color: "#ff0000" },
    { name: "Friends", color: "#00ff00" },
  ]);
  expect(chipNames()).toEqual(["Family", "Friends"]);
  expect(input.value).toBe("Friends");
  expect(host.textContent).not.toContain("Another label is already called");
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
