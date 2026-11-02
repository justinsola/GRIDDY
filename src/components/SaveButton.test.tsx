import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorProvider, hasUnsavedChanges, useEditor } from "../EditorContext";
import { MISSING_TITLE_MESSAGE } from "../lib/saveEditorSurvey";
import { ExportedSurvey, STORAGE_FULL_MESSAGE } from "../lib/surveysApi";
import SaveButton from "./SaveButton";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const host = document.createElement("div");
document.body.appendChild(host);
let root = createRoot(host);
let editor: ReturnType<typeof useEditor>;

function EditorSpy() {
  editor = useEditor();
  return null;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  act(() => root.render(<EditorProvider><EditorSpy /><SaveButton /></EditorProvider>));
});

afterEach(() => {
  act(() => root.unmount());
  root = createRoot(host);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const button = () => host.querySelector("button")!;
const message = () => host.querySelector('[role="alert"]')?.textContent ?? null;
const clickSave = () => act(async () => button().click());
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const nameSurvey = (name: string) =>
  act(() => editor.dispatch({ type: "setConfig", config: { ...editor.state.config, name } }));
const fillStorage = () =>
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("quota", "QuotaExceededError");
  });
const KEY = "griddy.localSurveys.v1";
const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as ExportedSurvey[];
const dialog = () => host.querySelector<HTMLElement>('[role="dialog"]');
const dialogButton = (text: string) =>
  Array.from(dialog()!.querySelectorAll("button")).find((b) => b.textContent === text)!;
const press = (key: string, shiftKey = false) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey }));
  });

it("keeps a failed save on screen after the title reminder's time is up", async () => {
  await clickSave();
  expect(message()).toBe(MISSING_TITLE_MESSAGE);
  wait(1000);
  nameSurvey("Map");
  fillStorage();
  await clickSave();
  expect(message()).toBe(STORAGE_FULL_MESSAGE);
  wait(5000);
  expect(message()).toBe(STORAGE_FULL_MESSAGE);
});

it("keeps a failed save on screen after Saved!'s time is up", async () => {
  nameSurvey("Map");
  await clickSave();
  expect(button().textContent).toBe("Saved!");
  wait(1000);
  fillStorage();
  await clickSave();
  expect(message()).toBe(STORAGE_FULL_MESSAGE);
  wait(5000);
  expect(message()).toBe(STORAGE_FULL_MESSAGE);
});

it("still hides the title reminder and Saved!, and leaves no timer running", async () => {
  await clickSave();
  wait(3000);
  expect(message()).toBeNull();
  nameSurvey("Map");
  await clickSave();
  expect(button().textContent).toBe("Saved!");
  wait(2000);
  expect(button().textContent).toBe("Save");
  await clickSave();
  // jsdom sends the storage event on a 0 ms timer; let it go so that only
  // the button's own timer is left.
  wait(0);
  expect(vi.getTimerCount()).toBe(1);
  act(() => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
});

describe("before replacing a saved survey", () => {
  /** "Map" is saved, then renamed in the study name box, then saved again. */
  async function renameAndSave() {
    nameSurvey("Map");
    await clickSave();
    nameSurvey("Map v2");
    await clickSave();
  }

  it("asks about a rename in a labelled dialog that starts on Save as new survey", async () => {
    await renameAndSave();
    const box = dialog()!;
    expect(box.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(box.getAttribute("aria-labelledby")!)!.textContent).toBe("Save survey");
    expect(document.getElementById(box.getAttribute("aria-describedby")!)!.textContent).toBe(
      '"Map" is already saved. Replace it, or keep it and save this as a new survey?',
    );
    expect(document.activeElement).toBe(dialogButton("Save as new survey"));
    expect(dialogButton("Replace").getAttribute("aria-label")).toBe('Replace "Map"');
  });

  it("keeps Tab on the dialog's buttons", async () => {
    await renameAndSave();
    press("Tab");
    expect(document.activeElement).toBe(dialogButton("Replace"));
    press("Tab");
    expect(document.activeElement).toBe(dialogButton("Cancel"));
    press("Tab");
    expect(document.activeElement).toBe(dialogButton("Save as new survey"));
    press("Tab", true);
    expect(document.activeElement).toBe(dialogButton("Cancel"));
  });

  it("saves nothing on Cancel or Escape, and gives focus back to Save", async () => {
    await renameAndSave();
    const before = window.localStorage.getItem(KEY);
    act(() => dialogButton("Cancel").click());
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(button());
    await clickSave();
    press("Escape");
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(window.localStorage.getItem(KEY)).toBe(before);
    expect(button().textContent).toBe("Save");
    expect(hasUnsavedChanges(editor.state)).toBe(true);
  });

  it("can save as a new survey, keeping the original as it was", async () => {
    await renameAndSave();
    const [original] = stored();
    await act(async () => dialogButton("Save as new survey").click());
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(button().textContent).toBe("Saved!");
    const [kept, copy] = stored();
    expect(kept).toEqual(original);
    expect(copy.name).toBe("Map v2");
    expect(copy.id).not.toBe(original.id);
    expect(editor.state.config.id).toBe(copy.id);
    expect(hasUnsavedChanges(editor.state)).toBe(false);
    // The editor now holds the new survey: saving again updates it, no questions asked.
    act(() => editor.dispatch({ type: "updateLayout", patch: { rows: 5 } }));
    await clickSave();
    expect(dialog()).toBeNull();
    expect(stored().map((s) => [s.name, s.config.layout.rows])).toEqual([
      ["Map", original.config.layout.rows],
      ["Map v2", 5],
    ]);
  });

  it("can replace the saved survey", async () => {
    await renameAndSave();
    await act(async () => dialogButton("Replace").click());
    expect(dialog()).toBeNull();
    expect(button().textContent).toBe("Saved!");
    expect(stored().map((s) => [s.id, s.name])).toEqual([[editor.state.config.id, "Map v2"]]);
    // The new name is now the saved one.
    await clickSave();
    expect(dialog()).toBeNull();
  });

  it("asks when another tab saved the survey after it was opened here", async () => {
    nameSurvey("Map");
    await clickSave();
    const [record] = stored();
    window.localStorage.setItem(
      KEY,
      JSON.stringify([{ ...record, name: "Map (final)", updated_at: "2099-01-01T00:00:00.000Z" }]),
    );
    await clickSave();
    expect(document.getElementById(dialog()!.getAttribute("aria-describedby")!)!.textContent).toBe(
      '"Map (final)" was changed after you opened it here (in another tab or window, or by importing a backup). Replace that version, or save this as a new survey?',
    );
    expect(dialogButton("Replace").getAttribute("aria-label")).toBe('Replace "Map (final)"');
  });

  it("saves edits without asking when the name and the saved copy are unchanged", async () => {
    nameSurvey("Map");
    await clickSave();
    act(() => editor.dispatch({ type: "updateLayout", patch: { rows: 5 } }));
    await clickSave();
    expect(dialog()).toBeNull();
    expect(button().textContent).toBe("Saved!");
    expect(stored().map((s) => s.config.layout.rows)).toEqual([5]);
  });
});
