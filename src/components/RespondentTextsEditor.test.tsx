import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EditorProvider, hasUnsavedChanges, useEditor } from "../EditorContext";
import { DEFAULT_RESPONDENT_TEXTS } from "../lib/respondentTexts";
import ConfigPanel from "./ConfigPanel";

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

const render = () =>
  act(() => root.render(<EditorProvider><EditorSpy /><ConfigPanel /></EditorProvider>));
const section03 = () => host.querySelector('[data-tour="section-selection-mode"]')!;
const block = () =>
  Array.from(host.querySelectorAll("details")).find((d) =>
    d.querySelector("summary")!.textContent!.includes("WORDS SHOWN TO RESPONDENTS"),
  )!;
/** The block's boxes, each named by the English it shows while empty. */
const englishShown = () =>
  Array.from(block().querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")).map(
    (box) => box.placeholder,
  );
const box = (english: string) =>
  block().querySelector<HTMLInputElement | HTMLTextAreaElement>(`[placeholder="${english}"]`)!;
const resetButton = (field: HTMLElement) =>
  Array.from(field.parentElement!.querySelectorAll("button")).find((b) => b.textContent === "Reset");

function type(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(prototype, "value")!.set!;
  act(() => {
    setValue.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("sits closed in section 03 and lists only the texts this grid uses", () => {
  render();
  expect(section03().contains(block())).toBe(true);
  expect(block().open).toBe(false);
  // Select & click with the reminder on.
  expect(englishShown()).toEqual(expect.arrayContaining(["Placing:", "Next", "Show me", "Continue anyway"]));
  expect(englishShown()).toContain("{n} cells are still empty.");
  expect(englishShown()).toContain("Use Show me to find them, or Continue anyway.");
  expect(englishShown()).toContain("Row {row}, column {col}: {label}");
  expect(englishShown()).not.toContain("Choose label");
  expect(englishShown()).not.toContain("Reacting:");
  expect(englishShown()).not.toContain(DEFAULT_RESPONDENT_TEXTS.requireFill);

  // Dropdowns, and empty cells allowed: no reminder and no Next of the grid's own.
  act(() =>
    editor.dispatch({ type: "updateSurvey", patch: { selectionMode: "dropdown", skipBehavior: "allow" } }),
  );
  expect(englishShown()).toEqual(
    expect.arrayContaining(["Choose label", "Label for row {row}, column {col}", DEFAULT_RESPONDENT_TEXTS.scrollHint]),
  );
  expect(englishShown()).not.toContain("Placing:");
  expect(englishShown()).not.toContain("Next");
  expect(englishShown()).not.toContain("{n} cells are still empty.");

  // An experiment that requires a reaction on every pre-filled cell.
  act(() => editor.dispatch({ type: "updateExperimental", patch: { enabled: true } }));
  act(() => section03().querySelector("button")!.click()); // Edit
  act(() => editor.dispatch({ type: "updateSurvey", patch: { skipBehavior: "force" } }));
  expect(block().open).toBe(false);
  expect(englishShown()).toEqual(
    expect.arrayContaining([
      DEFAULT_RESPONDENT_TEXTS.chooseReaction,
      "Reaction to {label} in row {row}, column {col}",
      "{n} pre-filled cells have no reaction yet.",
      DEFAULT_RESPONDENT_TEXTS.requireReact,
      "Next",
    ]),
  );
  expect(englishShown()).not.toContain("Choose label");
  expect(englishShown()).not.toContain("Continue anyway");
  expect(englishShown()).not.toContain("{n} cells are still empty.");
});

it("keeps the researcher's wording, and Reset brings back GRIDDY's English", () => {
  render();
  type(box("Next"), "Siguiente");
  expect(editor.state.config.survey.respondentTexts).toEqual({ next: "Siguiente" });
  expect(block().querySelector("summary")!.textContent).toContain("1 changed");
  expect(box("Next").parentElement!.textContent).toContain("English: Next");

  const count = box("{n} cells are still empty.");
  type(count, "Quedan {n} celdas vacías.");
  expect(editor.state.config.survey.respondentTexts).toEqual({
    next: "Siguiente",
    emptyOther: "Quedan {n} celdas vacías.",
  });

  act(() => resetButton(box("Next"))!.click());
  expect(box("Next").value).toBe("");
  expect(resetButton(box("Next"))).toBeUndefined();
  expect(editor.state.config.survey.respondentTexts).toEqual({ emptyOther: "Quedan {n} celdas vacías." });

  // With no wording of its own left, the survey is as it was.
  act(() => resetButton(count)!.click());
  expect(editor.state.config.survey.respondentTexts).toBeUndefined();
  expect(block().querySelector("summary")!.textContent).toContain("English");
  expect(hasUnsavedChanges(editor.state)).toBe(false);
});

it("treats a box of only spaces as empty", () => {
  render();
  type(box("Next"), "   ");
  expect(box("Next").value).toBe("");
  expect(editor.state.config.survey.respondentTexts).toBeUndefined();
});

it("warns, without stopping the edit, when a text loses a placeholder or has one it cannot fill", () => {
  render();
  const count = box("{n} cells are still empty.");
  type(count, "Quedan celdas vacías.");
  expect(editor.state.config.survey.respondentTexts).toEqual({ emptyOther: "Quedan celdas vacías." });
  expect(count.parentElement!.textContent).toContain("Missing {n} (the number of empty cells).");
  const notes = count.getAttribute("aria-describedby")!.split(" ").map((id) => document.getElementById(id)!.textContent);
  expect(notes).toEqual(["{n} the number of empty cells", "Missing {n} (the number of empty cells)."]);
  type(count, "Quedan {n} celdas vacías.");
  expect(count.parentElement!.textContent).not.toContain("Missing");

  const cell = box("Row {row}, column {col}: {label}");
  type(cell, "Fila {row}: {label}");
  expect(cell.parentElement!.textContent).toContain("Missing {col} (the column number).");

  type(box("Next"), "Siguiente {n}");
  expect(box("Next").parentElement!.textContent).toContain(
    "{n} is not filled in here, so respondents see it as typed.",
  );
});

it("suggests wording that fits any number for languages with more plural forms", () => {
  render();
  expect(block().textContent).toContain("such as Polish or Arabic, word both so they fit any number");
  act(() => editor.dispatch({ type: "updateSurvey", patch: { skipBehavior: "allow" } }));
  expect(block().textContent).not.toContain("Polish");
});
