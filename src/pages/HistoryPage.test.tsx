import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditorProvider, useEditor } from "../EditorContext";
import { ExportedSurvey, saveSurvey } from "../lib/surveysApi";
import HistoryPage from "./HistoryPage";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const host = document.createElement("div");
document.body.appendChild(host);
let root = createRoot(host);
let editor: ReturnType<typeof useEditor>;

function EditorSpy() {
  editor = useEditor();
  return null;
}

const page = (showPage: boolean) => (
  <MemoryRouter>
    <EditorProvider>
      <EditorSpy />
      {showPage && <HistoryPage />}
    </EditorProvider>
  </MemoryRouter>
);

beforeEach(() => window.localStorage.clear());

afterEach(() => {
  act(() => root.unmount());
  root = createRoot(host);
  vi.restoreAllMocks();
});

const KEY = "griddy.localSurveys.v1";
const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as ExportedSurvey[];
/** A button in the row of the saved survey with this name. */
const rowButton = (surveyName: string, text: string) => {
  const row = Array.from(host.querySelectorAll("li")).find(
    (li) => li.querySelector("p")?.textContent === surveyName,
  );
  return Array.from(row?.querySelectorAll("button") ?? []).find((b) => b.textContent === text);
};

/** "Map" is saved, the editor moves on to a new survey, and My surveys opens. */
async function showSavedMap() {
  act(() => root.render(page(false)));
  act(() =>
    editor.dispatch({ type: "setConfig", config: { ...editor.state.config, name: "Map" } }),
  );
  await saveSurvey(editor.state.config);
  act(() => editor.dispatch({ type: "newSurvey" }));
  await act(async () => root.render(page(true)));
}

it("duplicates a survey under a new id and the name chosen for the copy", async () => {
  await showSavedMap();
  const [original] = stored();
  const prompt = vi.spyOn(window, "prompt").mockReturnValue("Map v2");
  await act(async () => rowButton("Map", "Duplicate")!.click());
  expect(prompt).toHaveBeenCalledWith('Name the copy of "Map":', "Map (copy)");
  const [kept, copy] = stored();
  expect(kept).toEqual(original);
  expect(copy.id).not.toBe(original.id);
  expect(copy.name).toBe("Map v2");
  expect(copy.config).toEqual({ ...original.config, id: copy.id, name: "Map v2" });
  expect(rowButton("Map v2", "Open")).toBeDefined();
});

it("does not duplicate when the name is cancelled or left empty", async () => {
  await showSavedMap();
  const before = window.localStorage.getItem(KEY);
  vi.spyOn(window, "prompt").mockReturnValueOnce(null).mockReturnValueOnce("  ");
  await act(async () => rowButton("Map", "Duplicate")!.click());
  expect(host.textContent).not.toContain("Please enter a name for the copy.");
  await act(async () => rowButton("Map", "Duplicate")!.click());
  expect(host.textContent).toContain("Please enter a name for the copy.");
  expect(window.localStorage.getItem(KEY)).toBe(before);
});

it("remembers an opened survey's name and save time, to ask before replacing it", async () => {
  await showSavedMap();
  const [map] = stored();
  await act(async () => rowButton("Map", "Open")!.click());
  expect(editor.state.config.id).toBe(map.id);
  expect(editor.state.savedRecord).toEqual({ id: map.id, name: "Map", updated_at: map.updated_at });
});
