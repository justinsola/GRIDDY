import { beforeEach, expect, it, vi } from "vitest";
import type { GridConfig } from "../grid-types";
import { MISSING_TITLE_MESSAGE, saveEditorSurvey } from "./saveEditorSurvey";
import { STORAGE_FULL_MESSAGE } from "./surveysApi";

// Only the id and name matter to saving.
const survey = (name: string) => ({ id: "s1", name }) as GridConfig;
const storedNames = () =>
  (JSON.parse(window.localStorage.getItem("griddy.localSurveys.v1") ?? "[]") as GridConfig[]).map(
    (s) => s.name,
  );

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

it("refuses a survey without a title and stores nothing", async () => {
  const markSaved = vi.fn();
  await expect(saveEditorSurvey(survey("  "), markSaved)).rejects.toThrow(MISSING_TITLE_MESSAGE);
  expect(storedNames()).toEqual([]);
  expect(markSaved).not.toHaveBeenCalled();
});

it("stores the survey, then runs beforeMarkSaved, then marks it saved", async () => {
  const markSaved = vi.fn();
  const beforeMarkSaved = vi.fn(async () => {
    expect(storedNames()).toEqual(["Map"]);
    expect(markSaved).not.toHaveBeenCalled();
  });
  await saveEditorSurvey(survey("Map"), markSaved, beforeMarkSaved);
  expect(beforeMarkSaved).toHaveBeenCalledOnce();
  expect(markSaved).toHaveBeenCalledOnce();
});

it("does not mark a survey saved when it could not be stored", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("quota", "QuotaExceededError");
  });
  const markSaved = vi.fn();
  const beforeMarkSaved = vi.fn(async () => {});
  await expect(saveEditorSurvey(survey("Map"), markSaved, beforeMarkSaved)).rejects.toThrow(
    STORAGE_FULL_MESSAGE,
  );
  expect(beforeMarkSaved).not.toHaveBeenCalled();
  expect(markSaved).not.toHaveBeenCalled();
});
