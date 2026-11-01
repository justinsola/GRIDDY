import { GridConfig } from "../grid-types";

const LOCAL_SURVEYS_STORAGE_KEY = "griddy.localSurveys.v1";

export interface SurveyMeta {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ExportedSurvey {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  config: GridConfig;
}

export interface SurveysExportFile {
  version: 1;
  exportedAt: string;
  surveys: ExportedSurvey[];
}

export interface ImportSurveysResult {
  /** Surveys that were not in this browser before. */
  importedCount: number;
  /** Surveys already here that the backup had a newer version of. */
  updatedCount: number;
  /** Surveys already here whose local copy was newer than the backup's, so it was kept. */
  keptNewerCount: number;
  skippedDuplicateCount: number;
}

/** One sentence telling the researcher what an import did. */
export function describeImport(result: ImportSurveysResult): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (result.importedCount) parts.push(`imported ${plural(result.importedCount, "survey")}`);
  if (result.updatedCount) {
    parts.push(`updated ${plural(result.updatedCount, "survey")} with newer versions from the backup`);
  }
  if (result.keptNewerCount) {
    parts.push(`kept your newer copy of ${plural(result.keptNewerCount, "survey")}`);
  }
  if (result.skippedDuplicateCount) {
    parts.push(`skipped ${plural(result.skippedDuplicateCount, "duplicate")}`);
  }
  if (parts.length === 0) return "Backup imported, but it did not contain any surveys.";
  const last = parts.pop()!;
  const text = parts.length ? `${parts.join(", ")} and ${last}` : last;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function readLocalSurveys(): ExportedSurvey[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(LOCAL_SURVEYS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (survey): survey is ExportedSurvey =>
        !!survey &&
        typeof survey === "object" &&
        typeof survey.id === "string" &&
        typeof survey.name === "string" &&
        typeof survey.created_at === "string" &&
        typeof survey.updated_at === "string" &&
        typeof (survey as ExportedSurvey).config === "object" &&
        (survey as ExportedSurvey).config !== null,
    );
  } catch {
    return [];
  }
}

export const STORAGE_FULL_MESSAGE =
  "This browser's storage for GRIDDY is full, so nothing was saved. Uploaded images take the most space: export a JSON backup from My surveys, then delete surveys you no longer need or use smaller images.";

function writeLocalSurveys(surveys: ExportedSurvey[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_SURVEYS_STORAGE_KEY, JSON.stringify(surveys));
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
      throw new Error(STORAGE_FULL_MESSAGE);
    }
    throw e;
  }
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function surveyFingerprint(name: string, config: GridConfig): string {
  const normalizedName = name.trim().toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _ignoredId, ...configWithoutId } = config;

  return stableStringify({
    name: normalizedName,
    config: configWithoutId,
  });
}

export async function saveSurvey(config: GridConfig): Promise<void> {
  const now = new Date().toISOString();
  const surveys = readLocalSurveys();
  const existingIndex = surveys.findIndex((survey) => survey.id === config.id);
  const existing = existingIndex >= 0 ? surveys[existingIndex] : null;
  const record: ExportedSurvey = {
    id: config.id,
    name: config.name,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    config,
  };

  if (existingIndex >= 0) {
    surveys[existingIndex] = record;
  } else {
    surveys.push(record);
  }

  writeLocalSurveys(surveys);
}

export async function listSurveys(): Promise<SurveyMeta[]> {
  return readLocalSurveys()
    .map(({ id, name, created_at, updated_at }) => ({
      id,
      name,
      created_at,
      updated_at,
    }))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function loadSurvey(id: string): Promise<GridConfig> {
  const survey = readLocalSurveys().find((item) => item.id === id);
  if (!survey) {
    throw new Error("Survey not found in local storage.");
  }
  return survey.config;
}

export async function deleteSurvey(id: string): Promise<void> {
  writeLocalSurveys(readLocalSurveys().filter((survey) => survey.id !== id));
}

export async function getActiveSurveyQuestionCount(): Promise<number> {
  return readLocalSurveys().length;
}

export async function exportSurveys(): Promise<SurveysExportFile> {
  const surveys = [...readLocalSurveys()].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    surveys,
  };
}

export async function importSurveys(
  surveys: ExportedSurvey[],
): Promise<ImportSurveysResult> {
  if (surveys.length === 0) {
    return { importedCount: 0, updatedCount: 0, keptNewerCount: 0, skippedDuplicateCount: 0 };
  }

  const existingSurveys = readLocalSurveys();
  const existingById = new Map<string, string>();
  const existingFingerprints = new Set<string>();

  for (const survey of existingSurveys) {
    const fp = surveyFingerprint(survey.name, survey.config);
    existingById.set(survey.id, fp);
    existingFingerprints.add(fp);
  }

  const seenInImport = new Set<string>();
  const nextById = new Map(existingSurveys.map((survey) => [survey.id, survey]));
  let importedCount = 0;
  let updatedCount = 0;
  let keptNewerCount = 0;
  let skippedDuplicateCount = 0;

  for (const survey of surveys) {
    const fp = surveyFingerprint(survey.name, survey.config);

    if (seenInImport.has(fp)) {
      skippedDuplicateCount++;
      continue;
    }
    seenInImport.add(fp);

    if (existingById.has(survey.id) && existingById.get(survey.id) === fp) {
      skippedDuplicateCount++;
      continue;
    }

    // The same survey with different content: keep whichever copy was
    // edited last, so restoring an old backup cannot overwrite newer work.
    const local = nextById.get(survey.id);
    if (local) {
      const localTime = Date.parse(local.updated_at) || 0;
      const backupTime = Date.parse(survey.updated_at) || 0;
      if (localTime >= backupTime) {
        keptNewerCount++;
        continue;
      }
      nextById.set(survey.id, survey);
      existingById.set(survey.id, fp);
      existingFingerprints.add(fp);
      updatedCount++;
      continue;
    }

    if (!existingById.has(survey.id) && existingFingerprints.has(fp)) {
      skippedDuplicateCount++;
      continue;
    }

    nextById.set(survey.id, survey);
    existingById.set(survey.id, fp);
    existingFingerprints.add(fp);
    importedCount++;
  }

  writeLocalSurveys(Array.from(nextById.values()));
  return { importedCount, updatedCount, keptNewerCount, skippedDuplicateCount };
}
