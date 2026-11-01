import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditorProvider, hasUnsavedChanges, useEditor } from "../EditorContext";
import { saveSurvey, STORAGE_FULL_MESSAGE } from "../lib/surveysApi";
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
  await saveSurvey(editor.state.config);
  act(() => editor.dispatch({ type: "markSaved" }));
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
