import type { SavedRecord } from "../EditorContext";
import type { GridConfig } from "../grid-types";
import { findSurvey, saveSurvey, SurveyMeta } from "./surveysApi";

/** Shown when a survey without a title is saved. */
export const MISSING_TITLE_MESSAGE = "Please enter a survey title before saving.";

/** Why a save stopped to ask first: the survey was renamed since it was
 * opened or last saved, or its stored copy changed since then, saved in
 * another tab or window or replaced by importing a backup. `storedName` is
 * the stored copy's name. */
export interface SaveConflict {
  reason: "renamed" | "savedElsewhere";
  storedName: string;
}

/** The researcher's answer to a SaveConflict. */
export type SaveChoice = "replace" | "saveAsNew";

/** The question the save dialog asks about a SaveConflict. */
export function saveConflictMessage({ reason, storedName }: SaveConflict): string {
  return reason === "renamed"
    ? `"${storedName}" is already saved. Replace it, or keep it and save this as a new survey?`
    : `"${storedName}" was changed after you opened it here (in another tab or window, or by importing a backup). Replace that version, or save this as a new survey?`;
}

/** Whether saving would replace a stored copy the researcher may want to
 * keep. A survey with no stored copy (never saved, or deleted elsewhere)
 * just saves. */
async function findSaveConflict(
  config: GridConfig,
  savedRecord: SavedRecord | null,
): Promise<SaveConflict | null> {
  const stored = await findSurvey(config.id);
  if (!stored) return null;
  const opened = savedRecord?.id === config.id ? savedRecord : null;
  if (!opened || stored.updated_at !== opened.updated_at) {
    return { reason: "savedElsewhere", storedName: stored.name };
  }
  if (config.name.trim() !== opened.name.trim()) {
    return { reason: "renamed", storedName: stored.name };
  }
  return null;
}

/**
 * Save the survey open in the editor, then mark the editor saved. Shared by
 * the Save button and the multi-question page so both save the same way.
 * Saved surveys are listed by name, so a survey needs a title first.
 *
 * Saving replaces the stored survey with the editor's id. If the survey was
 * renamed since it was opened or last saved, or its stored copy changed
 * since (in another tab, or by importing a backup), nothing is saved: the
 * promise resolves to the SaveConflict to ask about.
 * Call again with the researcher's answer as `choice`: "replace", or
 * "saveAsNew", which stores the survey under a new id and leaves the stored
 * one as it is. `markSaved` gets the record the survey was stored as.
 *
 * `beforeMarkSaved` runs once the survey is stored and before the editor
 * counts as saved, so a page that shows saved surveys can reload them first.
 * Rejects with a message to show the researcher: MISSING_TITLE_MESSAGE, or
 * why the save failed (for example, the browser's storage is full).
 */
export async function saveEditorSurvey(
  editor: { config: GridConfig; savedRecord: SavedRecord | null },
  markSaved: (record: SurveyMeta) => void,
  { choice, beforeMarkSaved }: { choice?: SaveChoice; beforeMarkSaved?: () => Promise<void> } = {},
): Promise<SaveConflict | null> {
  const { config } = editor;
  if (!config.name.trim()) throw new Error(MISSING_TITLE_MESSAGE);
  if (!choice) {
    const conflict = await findSaveConflict(config, editor.savedRecord);
    if (conflict) return conflict;
  }
  const record = await saveSurvey(
    choice === "saveAsNew" ? { ...config, id: crypto.randomUUID() } : config,
  );
  if (beforeMarkSaved) await beforeMarkSaved();
  markSaved(record);
  return null;
}
