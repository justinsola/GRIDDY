import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EditorProvider, hasUnsavedChanges, useEditor } from "../EditorContext";
import ConfigPanel from "./ConfigPanel";
import PreviewPanel from "./PreviewPanel";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const host = document.createElement("div");
document.body.appendChild(host);
let root = createRoot(host);
let editor: ReturnType<typeof useEditor>;

function EditorSpy() {
  editor = useEditor();
  return null;
}

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
  expect(label.textContent).toContain(
    "Once a respondent reacts, this picture is drawn over the pre-filled cell, scaled to fit inside it.",
  );
  expect(label.textContent).toContain("A transparent PNG lets the cell's own picture show through.");
  expect(label.textContent).toContain("Dropdown per cell shows only the label's name.");
});

it("opens no file picker from an image's caption, and names each image's address box", () => {
  act(() => root.render(<EditorProvider><ConfigPanel /></EditorProvider>));
  clickButton("Family×");
  const captions = Array.from(host.querySelectorAll("span")).filter(
    (span) => span.textContent === "BACKGROUND IMAGE" || span.textContent === "IMAGE optional",
  );
  expect(captions).toHaveLength(2);
  const picked = vi.fn();
  host.querySelectorAll('input[type="file"]').forEach((input) => input.addEventListener("click", picked));
  for (const caption of captions) act(() => caption.click());
  expect(picked).not.toHaveBeenCalled();
  const addresses = Array.from(host.querySelectorAll('input[type="url"]'));
  expect(addresses.map((input) => input.getAttribute("aria-label"))).toEqual(["Background image URL", "Family image URL"]);
});

it("says under the question box where respondents' wording comes from", () => {
  act(() => root.render(<EditorProvider><ConfigPanel /></EditorProvider>));
  const question = host.querySelector("textarea")!;
  const hint = document.getElementById(question.getAttribute("aria-describedby") ?? "");
  expect(hint?.textContent).toContain("Respondents see this wording.");
  expect(hint?.textContent).toContain("Leave it empty to use the wording written in Qualtrics instead");
});

// ─── Cell size and where a wide grid starts ───────────────────────────────────

const renderEditor = () =>
  act(() => root.render(<EditorProvider><EditorSpy /><ConfigPanel /><PreviewPanel /></EditorProvider>));
const cellBox = (side: "width" | "height") =>
  host.querySelector<HTMLInputElement>(`input[aria-label="Cell ${side} in pixels"]`)!;
/** The lines under the cell size: the grid's size and any notes. */
const sizeNotes = () =>
  document.getElementById(cellBox("width").getAttribute("aria-describedby") ?? "")!.textContent;
const leave = (input: HTMLInputElement) =>
  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
const TOO_WIDE = "Wider than Qualtrics' phone view (292 px): respondents on phones scroll sideways.";
const TOO_SMALL = "Cells smaller than 44 px are hard to tap on a phone.";
const CELL_SIZE_NOTE = "Use a whole number from 20 to 600";

it("only takes a whole number of pixels from 20 to 600 as a cell's width or height", () => {
  renderEditor();
  expect(cellBox("width").value).toBe("90");
  expect(cellBox("height").value).toBe("90");
  // Both boxes name what they set and are grouped under CELL SIZE.
  const group = cellBox("width").closest('[role="group"]')!;
  expect(document.getElementById(group.getAttribute("aria-labelledby")!)!.textContent).toBe("CELL SIZE");
  expect(sizeNotes()).toBe("The grid is 290 × 290 px.");

  for (const bad of ["601", "-40", "120.5", "1e2"]) {
    type(cellBox("width"), bad);
    expect(host.textContent).toContain(CELL_SIZE_NOTE);
    expect(sizeNotes()).toBe("The grid is 290 × 290 px.");
  }

  type(cellBox("width"), "150");
  expect(host.textContent).not.toContain(CELL_SIZE_NOTE);
  expect(editor.state.config.tuning.cellWidth).toBe(150);
  expect(sizeNotes()).toContain("The grid is 470 × 290 px.");
  type(cellBox("height"), "80");
  expect(sizeNotes()).toContain("The grid is 470 × 260 px.");

  // Leaving the box with an unusable size puts back the last good one.
  type(cellBox("height"), "700");
  expect(host.textContent).toContain(CELL_SIZE_NOTE);
  leave(cellBox("height"));
  expect(cellBox("height").value).toBe("80");
  expect(editor.state.config.tuning.cellHeight).toBe(80);
  expect(host.textContent).not.toContain(CELL_SIZE_NOTE);
});

it("waits while a cell size is still being typed, and puts back the last good one on leaving", () => {
  renderEditor();
  // 150 typed a digit at a time: 1 and 15 are too small, but not wrong yet.
  for (const typed of ["1", "15"]) {
    type(cellBox("width"), typed);
    expect(host.textContent).not.toContain(CELL_SIZE_NOTE);
    expect(editor.state.config.tuning.cellWidth).toBe(90);
  }
  type(cellBox("width"), "150");
  expect(host.textContent).not.toContain(CELL_SIZE_NOTE);
  expect(editor.state.config.tuning.cellWidth).toBe(150);

  // Leaving the box while it holds 15 puts back the last good size.
  type(cellBox("width"), "15");
  leave(cellBox("width"));
  expect(cellBox("width").value).toBe("150");
  expect(editor.state.config.tuning.cellWidth).toBe(150);
  expect(host.textContent).not.toContain(CELL_SIZE_NOTE);

  for (const typed of ["0", "19", ""]) {
    type(cellBox("height"), typed);
    expect(host.textContent).not.toContain(CELL_SIZE_NOTE);
    leave(cellBox("height"));
    expect(cellBox("height").value).toBe("90");
  }
  expect(editor.state.config.tuning.cellHeight).toBe(90);
});

it("notes a grid wider than Qualtrics' phone view and cells too small to tap", () => {
  renderEditor();
  const cols = host.querySelectorAll<HTMLInputElement>('input[type="number"]')[1];
  // A new survey's 290 px grid and its 1 px border fill the 292 px exactly.
  expect(sizeNotes()).toBe("The grid is 290 × 290 px.");

  type(cols, "4");
  expect(sizeNotes()).toBe(`The grid is 390 × 290 px.${TOO_WIDE}`);
  type(cols, "3");
  type(cellBox("width"), "91");
  expect(sizeNotes()).toBe(`The grid is 293 × 290 px.${TOO_WIDE}`);

  // One column of cells reaches the exact edge. Like the exported script,
  // the note lets the grid overflow by 1 px, a rounding pixel: 291 px and
  // its border fit, 292 px and its border do not.
  type(cols, "1");
  type(cellBox("width"), "291");
  expect(sizeNotes()).toBe("The grid is 291 × 290 px.");
  type(cellBox("width"), "292");
  expect(sizeNotes()).toBe(`The grid is 292 × 290 px.${TOO_WIDE}`);

  type(cellBox("height"), "43");
  expect(sizeNotes()).toContain(TOO_SMALL);
  type(cellBox("height"), "44");
  expect(sizeNotes()).not.toContain(TOO_SMALL);
});

it("shows a migrated survey's cells rounded and keeps their size until they are edited", () => {
  renderEditor();
  // A survey saved before cell sizes: its 3 × 3 grid filled a 550 × 550 px frame.
  const oldTuning = {
    gridGap: 10,
    gridPadding: 0,
    labelFontSizeRem: 1,
    cellWidth: 100,
    cellHeight: 120,
    previewWidth: 550,
    previewHeight: 550,
  };
  act(() =>
    editor.dispatch({ type: "setConfig", config: { ...editor.state.config, id: "older-survey", tuning: oldTuning } }),
  );
  expect(cellBox("width").value).toBe("177");
  expect(cellBox("height").value).toBe("177");
  expect(sizeNotes()).toBe(`The grid is 550 × 550 px.${TOO_WIDE}`);
  leave(cellBox("width"));
  expect(editor.state.config.tuning.cellWidth).toBe(530 / 3);

  // Typing 177 again, a digit at a time.
  type(cellBox("width"), "17");
  expect(editor.state.config.tuning.cellWidth).toBe(530 / 3);
  type(cellBox("width"), "177");
  expect(editor.state.config.tuning.cellWidth).toBe(177);
  expect(editor.state.config.tuning.cellHeight).toBe(530 / 3);
  expect(sizeNotes()).toContain("The grid is 551 × 550 px.");
});

it("lets the researcher choose where a grid wider than the screen starts", () => {
  renderEditor();
  const caption = Array.from(host.querySelectorAll("span")).find(
    (span) => span.textContent === "ON A NARROW SCREEN, START AT",
  )!;
  const choice = host.querySelector<HTMLElement>(`[aria-labelledby="${caption.id}"]`)!;
  expect(choice.getAttribute("role")).toBe("radiogroup");
  expect(document.getElementById(choice.getAttribute("aria-describedby")!)!.textContent).toBe(
    "When the grid is wider than the screen, respondents see this part first.",
  );
  const [center, left] = Array.from(choice.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  expect([center.parentElement!.textContent, left.parentElement!.textContent]).toEqual(["The center", "The left edge"]);
  expect(center.checked).toBe(true);

  act(() => left.click());
  expect(editor.state.config.layout.scrollStart).toBe("left");
  expect(left.checked).toBe(true);
  expect(hasUnsavedChanges(editor.state)).toBe(true);

  // The center is the default: choosing it again leaves nothing to save.
  act(() => center.click());
  expect(center.checked).toBe(true);
  expect(editor.state.config.layout.scrollStart).toBeUndefined();
  expect(hasUnsavedChanges(editor.state)).toBe(false);
});
