import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedRecord } from "../EditorContext";
import type { GridConfig } from "../grid-types";
import { MISSING_TITLE_MESSAGE, saveConflictMessage, saveEditorSurvey } from "./saveEditorSurvey";
import { ExportedSurvey, saveSurvey, STORAGE_FULL_MESSAGE } from "./surveysApi";

// Only the id and name matter to saving.
const survey = (name: string) => ({ id: "s1", name }) as GridConfig;
const KEY = "griddy.localSurveys.v1";
const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as ExportedSurvey[];
const storedNames = () => stored().map((s) => s.name);

/** The editor just after `config` was saved: what markSaved remembers. */
async function savedEditor(config: GridConfig): Promise<{ config: GridConfig; savedRecord: SavedRecord }> {
  const { id, updated_at } = await saveSurvey(config);
  return { config, savedRecord: { id, name: config.name, updated_at } };
}

/** Another tab saves the stored survey again, perhaps under another name. */
function saveInAnotherTab(name = "Map") {
  const [record] = stored();
  window.localStorage.setItem(
    KEY,
    JSON.stringify([{ ...record, name, updated_at: "2099-01-01T00:00:00.000Z" }]),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

it("refuses a survey without a title and stores nothing", async () => {
  const markSaved = vi.fn();
  await expect(
    saveEditorSurvey({ config: survey("  "), savedRecord: null }, markSaved),
  ).rejects.toThrow(MISSING_TITLE_MESSAGE);
  expect(storedNames()).toEqual([]);
  expect(markSaved).not.toHaveBeenCalled();
});

it("stores the survey, then runs beforeMarkSaved, then marks it saved", async () => {
  const markSaved = vi.fn();
  const beforeMarkSaved = vi.fn(async () => {
    expect(storedNames()).toEqual(["Map"]);
    expect(markSaved).not.toHaveBeenCalled();
  });
  const conflict = await saveEditorSurvey({ config: survey("Map"), savedRecord: null }, markSaved, {
    beforeMarkSaved,
  });
  expect(conflict).toBeNull();
  expect(beforeMarkSaved).toHaveBeenCalledOnce();
  expect(markSaved).toHaveBeenCalledOnce();
  expect(markSaved).toHaveBeenCalledWith({
    id: "s1",
    name: "Map",
    created_at: stored()[0].created_at,
    updated_at: stored()[0].updated_at,
  });
});

it("does not mark a survey saved when it could not be stored", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("quota", "QuotaExceededError");
  });
  const markSaved = vi.fn();
  const beforeMarkSaved = vi.fn(async () => {});
  await expect(
    saveEditorSurvey({ config: survey("Map"), savedRecord: null }, markSaved, { beforeMarkSaved }),
  ).rejects.toThrow(STORAGE_FULL_MESSAGE);
  expect(beforeMarkSaved).not.toHaveBeenCalled();
  expect(markSaved).not.toHaveBeenCalled();
});

describe("before replacing a saved survey", () => {
  it("saves without asking when the name and the stored copy are as they were", async () => {
    const editor = await savedEditor(survey("Map"));
    const markSaved = vi.fn();
    // Spaces at either end of the name are not a rename.
    expect(await saveEditorSurvey({ ...editor, config: survey(" Map ") }, markSaved)).toBeNull();
    expect(markSaved).toHaveBeenCalledOnce();
  });

  it("asks about a rename and stores nothing", async () => {
    const editor = await savedEditor(survey("Map"));
    const before = window.localStorage.getItem(KEY);
    const markSaved = vi.fn();
    const conflict = await saveEditorSurvey({ ...editor, config: survey("Map v2") }, markSaved);
    expect(conflict).toEqual({ reason: "renamed", storedName: "Map" });
    expect(window.localStorage.getItem(KEY)).toBe(before);
    expect(markSaved).not.toHaveBeenCalled();
  });

  it("asks about a save made in another tab since, under the name it saved", async () => {
    const editor = await savedEditor(survey("Map"));
    saveInAnotherTab("Map (final)");
    const before = window.localStorage.getItem(KEY);
    const markSaved = vi.fn();
    const conflict = await saveEditorSurvey(editor, markSaved);
    expect(conflict).toEqual({ reason: "savedElsewhere", storedName: "Map (final)" });
    expect(window.localStorage.getItem(KEY)).toBe(before);
    expect(markSaved).not.toHaveBeenCalled();
  });

  it("asks about a stored copy this editor never opened or saved", async () => {
    await saveSurvey(survey("Map"));
    const conflict = await saveEditorSurvey({ config: survey("Map"), savedRecord: null }, vi.fn());
    expect(conflict).toEqual({ reason: "savedElsewhere", storedName: "Map" });
  });

  it("just saves a survey deleted elsewhere", async () => {
    const editor = await savedEditor(survey("Map"));
    window.localStorage.clear();
    const markSaved = vi.fn();
    expect(await saveEditorSurvey({ ...editor, config: survey("Map v2") }, markSaved)).toBeNull();
    expect(storedNames()).toEqual(["Map v2"]);
    expect(markSaved).toHaveBeenCalledOnce();
  });

  it("replaces the stored survey when asked to", async () => {
    const editor = await savedEditor(survey("Map"));
    saveInAnotherTab();
    const markSaved = vi.fn();
    const conflict = await saveEditorSurvey({ ...editor, config: survey("Map v2") }, markSaved, {
      choice: "replace",
    });
    expect(conflict).toBeNull();
    expect(stored().map((s) => [s.id, s.name])).toEqual([["s1", "Map v2"]]);
    expect(markSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "s1", name: "Map v2" }));
  });

  it("saves as a new survey with its own id, leaving the stored one as it was", async () => {
    const editor = await savedEditor(survey("Map"));
    const [original] = stored();
    const markSaved = vi.fn();
    const conflict = await saveEditorSurvey({ ...editor, config: survey("Map v2") }, markSaved, {
      choice: "saveAsNew",
    });
    expect(conflict).toBeNull();
    const [kept, copy] = stored();
    expect(kept).toEqual(original);
    expect(copy.name).toBe("Map v2");
    expect(copy.id).not.toBe("s1");
    expect(copy.config.id).toBe(copy.id);
    expect(markSaved).toHaveBeenCalledWith(expect.objectContaining({ id: copy.id, name: "Map v2" }));
  });

  it("asks in words a researcher can answer", () => {
    expect(saveConflictMessage({ reason: "renamed", storedName: "Map" })).toBe(
      '"Map" is already saved. Replace it, or keep it and save this as a new survey?',
    );
    expect(saveConflictMessage({ reason: "savedElsewhere", storedName: "Map" })).toBe(
      '"Map" was saved in another tab or window after you opened it here. Replace that version, or save this as a new survey?',
    );
  });
});
