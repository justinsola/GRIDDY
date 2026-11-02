import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditorProvider, hasUnsavedChanges, useEditor } from "../EditorContext";
import { ExportedSurvey, saveSurvey, STORAGE_FULL_MESSAGE } from "../lib/surveysApi";
import CombineSurveysPage, { EDITOR_NAME_MISSING } from "./CombineSurveysPage";

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
      {showPage && <CombineSurveysPage />}
    </EditorProvider>
  </MemoryRouter>
);

beforeEach(() => window.localStorage.clear());

afterEach(() => {
  act(() => root.unmount());
  root = createRoot(host);
  vi.restoreAllMocks();
});

const UNSAVED = "has changes in the editor that are not saved";
const button = (text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent === text)!;
const editConfig = (patch: { name?: string; questionText?: string }) =>
  act(() => {
    const { config } = editor.state;
    editor.dispatch({
      type: "setConfig",
      config: {
        ...config,
        name: patch.name ?? config.name,
        layout: { ...config.layout, questionText: patch.questionText ?? config.layout.questionText },
      },
    });
  });

function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Clicks Download and returns the .qsf text. jsdom cannot make object URLs
 * or download files, so the file is caught on its way out. */
async function downloadQsf(): Promise<string> {
  const files: Blob[] = [];
  const stubs = {
    createObjectURL: (blob: Blob) => {
      files.push(blob);
      return "blob:qsf";
    },
    revokeObjectURL: () => {},
  };
  const originals = Object.keys(stubs).map((key) => [key, Object.getOwnPropertyDescriptor(URL, key)] as const);
  Object.assign(URL, stubs);
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  try {
    act(() => button("Download .qsf").click());
    expect(files).toHaveLength(1);
    return await files[0].text();
  } finally {
    anchorClick.mockRestore();
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(URL, key, original);
      else delete (URL as unknown as Record<string, unknown>)[key];
    }
  }
}

/** "Map" is saved, edited in the editor without saving, then added on the page. */
async function addSurveyWithUnsavedEdits() {
  act(() => root.render(page(false)));
  editConfig({ name: "Map", questionText: "Saved question" });
  const record = await saveSurvey(editor.state.config);
  act(() => editor.dispatch({ type: "markSaved", record }));
  editConfig({ questionText: "Edited question" });
  await act(async () => root.render(page(true)));
  act(() => button("+ Add").click());
  expect(host.textContent).toContain(`"Map" ${UNSAVED}`);
  expect(button("Download .qsf").disabled).toBe(true);
}

it("saves the editor's changes without losing the page's choices", async () => {
  await addSurveyWithUnsavedEdits();
  const [title, field] = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="text"]'));
  type(title, "Wave 1");
  type(field, "map_question");

  await act(async () => button("Save the editor's changes").click());

  expect(hasUnsavedChanges(editor.state)).toBe(false);
  expect(host.textContent).not.toContain(UNSAVED);
  expect(button("Download .qsf").disabled).toBe(false);
  expect(title.value).toBe("Wave 1");
  expect(field.value).toBe("map_question");
  const qsf = await downloadQsf();
  expect(qsf).toContain("Edited question");
  expect(qsf).not.toContain("Saved question");
  expect(qsf).toContain("Wave 1");
});

it("shows why the editor's changes were not saved and keeps Download off", async () => {
  await addSurveyWithUnsavedEdits();

  editConfig({ name: " " });
  await act(async () => button("Save the editor's changes").click());
  expect(host.textContent).toContain(EDITOR_NAME_MISSING);

  editConfig({ name: "Map" });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("quota", "QuotaExceededError");
  });
  await act(async () => button("Save the editor's changes").click());
  expect(host.textContent).toContain(STORAGE_FULL_MESSAGE);
  expect(host.textContent).toContain(UNSAVED);
  expect(button("Download .qsf").disabled).toBe(true);
  expect(hasUnsavedChanges(editor.state)).toBe(true);
});

it("can use the saved version instead, leaving the editor's changes out", async () => {
  await addSurveyWithUnsavedEdits();

  act(() => button("Use the saved version instead").click());
  expect(host.textContent).not.toContain(UNSAVED);
  expect(button("Download .qsf").disabled).toBe(false);
  expect(hasUnsavedChanges(editor.state)).toBe(true);
  const qsf = await downloadQsf();
  expect(qsf).toContain("Saved question");
  expect(qsf).not.toContain("Edited question");
});

const KEY = "griddy.localSurveys.v1";
const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as ExportedSurvey[];
const dialog = () => host.querySelector<HTMLElement>('[role="dialog"]');

it("asks before replacing a survey renamed in the editor, and can save it as a new one", async () => {
  await addSurveyWithUnsavedEdits();
  const field = host.querySelectorAll<HTMLInputElement>('input[type="text"]')[1];
  type(field, "map_question");
  editConfig({ name: "Map v2" });
  const before = window.localStorage.getItem(KEY);

  await act(async () => button("Save the editor's changes").click());
  expect(dialog()!.textContent).toContain(
    '"Map" is already saved. Replace it, or keep it and save this as a new survey?',
  );
  act(() => button("Cancel").click());
  expect(dialog()).toBeNull();
  expect(window.localStorage.getItem(KEY)).toBe(before);
  expect(host.textContent).toContain(UNSAVED);

  await act(async () => button("Save the editor's changes").click());
  await act(async () => button("Save as new survey").click());
  expect(dialog()).toBeNull();
  expect(stored().map((s) => s.name)).toEqual(["Map", "Map v2"]);
  expect(stored()[0].config.layout.questionText).toBe("Saved question");
  expect(hasUnsavedChanges(editor.state)).toBe(false);
  // The page now uses the new survey, with the field name typed for the old one.
  expect(host.textContent).not.toContain(UNSAVED);
  expect(host.querySelectorAll<HTMLInputElement>('input[type="text"]')[1].value).toBe("map_question");
  expect(button("+ Add")).toBeDefined();
  const qsf = await downloadQsf();
  expect(qsf).toContain("Edited question");
  expect(qsf).not.toContain("Saved question");
  expect(qsf).toContain("GridAssignments_map_question");
});

it("asks before replacing a copy saved in another tab, and can replace it", async () => {
  await addSurveyWithUnsavedEdits();
  const [record] = stored();
  window.localStorage.setItem(
    KEY,
    JSON.stringify([{ ...record, updated_at: "2099-01-01T00:00:00.000Z" }]),
  );

  await act(async () => button("Save the editor's changes").click());
  expect(dialog()!.textContent).toContain('"Map" was saved in another tab or window');
  await act(async () => button("Replace").click());
  expect(dialog()).toBeNull();
  expect(stored()).toHaveLength(1);
  expect(stored()[0].config.layout.questionText).toBe("Edited question");
  expect(host.textContent).not.toContain(UNSAVED);
  expect(button("Download .qsf").disabled).toBe(false);
});

it("names a grid's fields after the field name ending set in its export dialog", async () => {
  act(() => root.render(page(false)));
  editConfig({ name: "Map" });
  act(() =>
    editor.dispatch({ type: "updateSurvey", patch: { fieldSuffix: "Q2" } }),
  );
  const record = await saveSurvey(editor.state.config);
  act(() => editor.dispatch({ type: "markSaved", record }));
  await act(async () => root.render(page(true)));
  act(() => button("+ Add").click());
  expect(host.textContent).toContain("Saved in Qualtrics as __js_GridAssignments_Q2");
  expect(await downloadQsf()).toContain('"Field": "__js_GridAssignments_Q2"');
});

it("shows the fields as Qualtrics records them, and names a field two questions share", async () => {
  act(() => root.render(page(false)));
  const { config } = editor.state;
  await saveSurvey({ ...config, id: "map-1", name: "Map" });
  await saveSurvey({ ...config, id: "map-2", name: "Map" });
  await saveSurvey({
    ...config,
    id: "reactions",
    name: "Reactions",
    experimental: { ...config.experimental!, enabled: true },
  });
  await act(async () => root.render(page(true)));
  for (let i = 0; i < 3; i++) act(() => button("+ Add").click());

  expect(host.textContent).toContain("Saved in Qualtrics as __js_GridAssignments_Map");
  expect(host.textContent).toContain(
    "Saved in Qualtrics as __js_GridPrefills_Reactions and __js_GridResponses_Reactions",
  );
  expect(host.textContent).toContain('both write to the field "__js_GridAssignments_Map"');
  expect(button("Download .qsf").disabled).toBe(true);
});

it("keeps each grid's own words for respondents in the .qsf", async () => {
  act(() => root.render(page(false)));
  const { config } = editor.state;
  await saveSurvey({
    ...config,
    id: "mapa",
    name: "Mapa",
    survey: { ...config.survey, respondentTexts: { next: "Siguiente" } },
  });
  await saveSurvey({ ...config, id: "map", name: "Map" });
  await act(async () => root.render(page(true)));
  for (let i = 0; i < 2; i++) act(() => button("+ Add").click());
  const scripts = JSON.parse(await downloadQsf())
    .SurveyElements.filter((e: { Element: string }) => e.Element === "SQ")
    .map((q: { Payload: { QuestionJS: string } }) => q.Payload.QuestionJS);
  expect(scripts.filter((js: string) => js.includes('"next": "Siguiente"'))).toHaveLength(1);
  expect(scripts.filter((js: string) => js.includes('"next": "Next"'))).toHaveLength(1);
});
