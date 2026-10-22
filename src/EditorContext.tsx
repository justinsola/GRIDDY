import React, { createContext, useContext, useMemo, useReducer } from "react";
import {
  CategoryMeta,
  ExperimentalConfig,
  GridConfig,
  GridStep,
  LayoutConfig,
  SurveyConfig,
  TuningConfig,
} from "./grid-types";
import {
  addFollowUpStep,
  clampStepIndex,
  createDefaultExperimental,
  getStepCount,
  getSteps,
  removeStepAt,
  replaceStep,
  setStepBuildsOnPrevious,
} from "./lib/steps";

const CATEGORY_PALETTE = [
  "#f87171", // red
  "#60a5fa", // blue
  "#4ade80", // green
  "#fb923c", // orange
  "#c084fc", // purple
  "#facc15", // yellow
  "#22d3ee", // cyan
  "#f472b6", // pink
  "#a3e635", // lime
  "#fb7185", // rose
];

/** Sync responseLabelMeta when the CSV changes: keep existing entries, add new ones with palette colors. */
export function syncResponseLabelMeta(
  csv: string,
  existing: Record<string, CategoryMeta>,
): Record<string, CategoryMeta> {
  const names = csv
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);

  const usedColors = new Set(Object.values(existing).map((m) => m.color));
  let paletteIdx = 0;

  const next: Record<string, CategoryMeta> = {};
  for (const name of names) {
    if (existing[name]) {
      next[name] = existing[name];
    } else {
      while (
        paletteIdx < CATEGORY_PALETTE.length &&
        usedColors.has(CATEGORY_PALETTE[paletteIdx])
      ) {
        paletteIdx++;
      }
      const color = CATEGORY_PALETTE[paletteIdx % CATEGORY_PALETTE.length];
      usedColors.add(color);
      paletteIdx++;
      next[name] = { color, imageUrl: "" };
    }
  }
  return next;
}

const defaultExperimental = createDefaultExperimental;

/** Sync categoryMeta when the CSV changes: keep existing entries, add new ones with palette colors. */
export function syncCategoryMeta(
  csv: string,
  existing: Record<string, CategoryMeta>,
): Record<string, CategoryMeta> {
  const names = csv
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const usedColors = new Set(Object.values(existing).map((m) => m.color));
  let paletteIdx = 0;

  const next: Record<string, CategoryMeta> = {};
  for (const name of names) {
    if (existing[name]) {
      next[name] = existing[name];
    } else {
      while (
        paletteIdx < CATEGORY_PALETTE.length &&
        usedColors.has(CATEGORY_PALETTE[paletteIdx])
      ) {
        paletteIdx++;
      }
      const color = CATEGORY_PALETTE[paletteIdx % CATEGORY_PALETTE.length];
      usedColors.add(color);
      paletteIdx++;
      next[name] = { color, imageUrl: "" };
    }
  }
  return next;
}

function normalizeStep<T extends GridStep>(config: T): T {
  const categoriesCsv = config.survey.categoriesCsv ?? "";
  const existingExp: Partial<ExperimentalConfig> = config.experimental ?? {};
  return {
    ...config,
    survey: {
      ...config.survey,
      selectionMode: config.survey.selectionMode ?? "paint",
      categoryMeta: syncCategoryMeta(
        categoriesCsv,
        config.survey.categoryMeta ?? {},
      ),
    },
    experimental: {
      ...defaultExperimental(),
      ...existingExp,
      fixedAssignments: existingExp.fixedAssignments ?? {},
      weightedEntries: existingExp.weightedEntries ?? [],
      responseLabelMeta: syncResponseLabelMeta(
        existingExp.responseLabelsCsv ?? "",
        existingExp.responseLabelMeta ?? {},
      ),
    },
  };
}

export function normalizeConfig(config: GridConfig): GridConfig {
  const normalized = normalizeStep(config);
  if (config.followUpSteps && config.followUpSteps.length > 0) {
    normalized.followUpSteps = config.followUpSteps.map((step) =>
      normalizeStep(step),
    );
  } else {
    delete normalized.followUpSteps;
  }
  return normalized;
}

type CellAnswers = Record<string, string>;

export interface EditorState {
  config: GridConfig;
  savedSurveyId: string | null;
  /** Index of the step being edited (0 = first step). */
  activeStep?: number;
  /**
   * Preview-only answers per step id ("r1-c1" -> label), so a later step can be
   * previewed with what you filled in on the step before it. Never saved.
   */
  previewOutputs?: Record<string, CellAnswers>;
}

type EditorAction =
  | { type: "setConfig"; config: GridConfig }
  | { type: "updateLayout"; patch: Partial<LayoutConfig> }
  | { type: "updateTuning"; patch: Partial<TuningConfig> }
  | { type: "updateSurvey"; patch: Partial<SurveyConfig> }
  | { type: "updateExperimental"; patch: Partial<ExperimentalConfig> }
  | { type: "markSaved" }
  | { type: "newSurvey" }
  | { type: "selectStep"; index: number }
  | { type: "addStep" }
  | { type: "removeStep"; index: number }
  | { type: "setBuildsOnPrevious"; index: number; value: boolean }
  | { type: "setPreviewOutput"; stepId: string; output: CellAnswers }
  | {
      type: "updatePreviewOutput";
      stepId: string;
      updater: (prev: CellAnswers) => CellAnswers;
    }
  | { type: "clearPreviewOutput"; stepId: string };

const EditorContext = createContext<
  { state: EditorState; dispatch: React.Dispatch<EditorAction> } | undefined
>(undefined);

function createDefaultConfig(): GridConfig {
  const layout: LayoutConfig = {
    questionText: "Who lives where? Fill in the grid:",
    rows: 3,
    cols: 3,
    includeCenterCell: true,
    centerCellLabel: "Your House",
    centerRow: null,
    centerCol: null,
    backgroundImageUrl: "",
  };

  const tuning: TuningConfig = {
    gridGap: 10,
    gridPadding: 0,
    labelFontSizeRem: 1,
    cellWidth: 100,
    cellHeight: 120,
    previewWidth: 550,
    previewHeight: 550,
  };

  const defaultCsv = "Dwarves, Elves, Hobbits, Rohirrim";
  const survey: SurveyConfig = {
    categoriesCsv: defaultCsv,
    allowInteraction: true,
    selectionMode: "paint",
    advancedCategories: false,
    categoryMeta: syncCategoryMeta(defaultCsv, {}),
  };

  return {
    id: crypto.randomUUID(),
    name: "",
    layout,
    tuning,
    survey,
    experimental: defaultExperimental(),
  };
}

/** Apply `fn` to the step currently being edited. */
function updateActiveStep(
  state: EditorState,
  fn: (step: GridStep) => GridStep,
): EditorState {
  const index = clampStepIndex(state.config, state.activeStep ?? 0);
  const step = getSteps(state.config)[index];
  return { ...state, config: replaceStep(state.config, index, fn(step)) };
}

function sameAnswers(a: CellAnswers, b: CellAnswers): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

function setPreviewOutput(
  state: EditorState,
  stepId: string,
  output: CellAnswers,
): EditorState {
  const outputs = state.previewOutputs ?? {};
  if (sameAnswers(outputs[stepId] ?? {}, output)) return state;
  return { ...state, previewOutputs: { ...outputs, [stepId]: output } };
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "setConfig": {
      const config = normalizeConfig(action.config);
      if (config.id !== state.config.id) {
        // A different survey was loaded: start on step 1 with a clean preview.
        return { ...state, config, activeStep: 0, previewOutputs: {} };
      }
      return {
        ...state,
        config,
        activeStep: clampStepIndex(config, state.activeStep ?? 0),
      };
    }
    case "markSaved":
      return { ...state, savedSurveyId: state.config.id };
    case "newSurvey":
      return {
        config: createDefaultConfig(),
        savedSurveyId: null,
        activeStep: 0,
        previewOutputs: {},
      };
    case "selectStep":
      return {
        ...state,
        activeStep: clampStepIndex(state.config, action.index),
      };
    case "addStep": {
      const config = normalizeConfig(addFollowUpStep(state.config));
      return { ...state, config, activeStep: getStepCount(config) - 1 };
    }
    case "removeStep": {
      if (getStepCount(state.config) <= 1) return state;
      const removedId = getSteps(state.config)[
        clampStepIndex(state.config, action.index)
      ].id;
      const config = removeStepAt(state.config, action.index);
      const outputs = { ...(state.previewOutputs ?? {}) };
      delete outputs[removedId];
      const current = state.activeStep ?? 0;
      const nextActive = current > action.index ? current - 1 : current;
      return {
        ...state,
        config,
        activeStep: clampStepIndex(config, nextActive),
        previewOutputs: outputs,
      };
    }
    case "setBuildsOnPrevious":
      return {
        ...state,
        config: setStepBuildsOnPrevious(
          state.config,
          action.index,
          action.value,
        ),
      };
    case "setPreviewOutput":
      return setPreviewOutput(state, action.stepId, action.output);
    case "updatePreviewOutput":
      return setPreviewOutput(
        state,
        action.stepId,
        action.updater(state.previewOutputs?.[action.stepId] ?? {}),
      );
    case "clearPreviewOutput":
      return setPreviewOutput(state, action.stepId, {});
    case "updateLayout":
      return updateActiveStep(state, (step) => ({
        ...step,
        layout: { ...step.layout, ...action.patch },
      }));
    case "updateTuning":
      return updateActiveStep(state, (step) => ({
        ...step,
        tuning: { ...step.tuning, ...action.patch },
      }));
    case "updateSurvey":
      return updateActiveStep(state, (step) => {
        const merged = { ...step.survey, ...action.patch };
        if (action.patch.categoriesCsv !== undefined) {
          merged.categoryMeta = syncCategoryMeta(
            action.patch.categoriesCsv,
            merged.categoryMeta,
          );
          // Prune fixedAssignments referencing categories that no longer exist
          const validCats = new Set(
            action.patch.categoriesCsv
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean),
          );
          const exp = step.experimental ?? defaultExperimental();
          const prunedAssignments = Object.fromEntries(
            Object.entries(exp.fixedAssignments).filter(([, v]) =>
              validCats.has(v),
            ),
          );
          const prunedWeights = exp.weightedEntries.filter((e) =>
            validCats.has(e.category),
          );
          return {
            ...step,
            survey: merged,
            experimental: {
              ...exp,
              fixedAssignments: prunedAssignments,
              weightedEntries: prunedWeights,
            },
          };
        }
        return { ...step, survey: merged };
      });
    case "updateExperimental":
      return updateActiveStep(state, (step) => {
        const merged: ExperimentalConfig = {
          ...(step.experimental ?? defaultExperimental()),
          ...action.patch,
        };
        if (action.patch.responseLabelsCsv !== undefined) {
          merged.responseLabelMeta = syncResponseLabelMeta(
            action.patch.responseLabelsCsv,
            merged.responseLabelMeta,
          );
        }
        return { ...step, experimental: merged };
      });
    default:
      return state;
  }
}

export const EditorProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(editorReducer, {
    config: createDefaultConfig(),
    savedSurveyId: null,
    activeStep: 0,
    previewOutputs: {},
  });

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
};

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error("useEditor must be used within EditorProvider");
  }
  return ctx;
}
