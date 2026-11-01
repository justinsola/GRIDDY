import type { GridConfig } from "../grid-types";
import { saveSurvey } from "./surveysApi";

/** Shown when a survey without a title is saved. */
export const MISSING_TITLE_MESSAGE = "Please enter a survey title before saving.";

/**
 * Save the survey open in the editor, then mark the editor saved. Shared by
 * the Save button and the multi-question page so both save the same way.
 * Saved surveys are listed by name, so a survey needs a title first.
 * `beforeMarkSaved` runs once the survey is stored and before the editor
 * counts as saved, so a page that shows saved surveys can reload them first.
 * Rejects with a message to show the researcher: MISSING_TITLE_MESSAGE, or
 * why the save failed (for example, the browser's storage is full).
 */
export async function saveEditorSurvey(
  config: GridConfig,
  markSaved: () => void,
  beforeMarkSaved?: () => Promise<void>,
): Promise<void> {
  if (!config.name.trim()) throw new Error(MISSING_TITLE_MESSAGE);
  await saveSurvey(config);
  if (beforeMarkSaved) await beforeMarkSaved();
  markSaved();
}
