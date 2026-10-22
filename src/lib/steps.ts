import { ExperimentalConfig, GridConfig, GridStep } from "../grid-types";

export function createDefaultExperimental(): ExperimentalConfig {
  return {
    enabled: false,
    prefillMode: "fixed",
    fixedAssignments: {},
    weightedEntries: [],
    responseLabelsCsv: "",
    responseLabelMeta: {},
  };
}

/** All steps in order, as stored (no inheritance applied). Step 1 is the config itself. */
export function getSteps(config: GridConfig): GridStep[] {
  const first: GridStep = {
    id: config.id,
    layout: config.layout,
    tuning: config.tuning,
    survey: config.survey,
  };
  if (config.experimental) first.experimental = config.experimental;
  return [first, ...(config.followUpSteps ?? [])];
}

export function getStepCount(config: GridConfig): number {
  return 1 + (config.followUpSteps?.length ?? 0);
}

export function clampStepIndex(config: GridConfig, index: number): number {
  return Math.max(0, Math.min(index, getStepCount(config) - 1));
}

/** Write an ordered list of steps back onto the config. Step 1 keeps the survey id. */
export function setSteps(config: GridConfig, steps: GridStep[]): GridConfig {
  const [first, ...rest] = steps;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, buildsOnPrevious: _builds, ...firstFields } = first;
  const next: GridConfig = { ...config, ...firstFields };
  if (rest.length > 0) {
    next.followUpSteps = rest;
  } else {
    delete next.followUpSteps;
  }
  return next;
}

export function replaceStep(
  config: GridConfig,
  index: number,
  step: GridStep,
): GridConfig {
  const steps = getSteps(config);
  steps[clampStepIndex(config, index)] = step;
  return setSteps(config, steps);
}

/**
 * Steps with inheritance applied: a step that builds on the previous one takes the
 * previous step's grid, sizing and categories, and is always experimental.
 * Its own question text, input method and response labels are kept.
 */
export function resolveSteps(config: GridConfig): GridStep[] {
  const resolved: GridStep[] = [];
  getSteps(config).forEach((step, index) => {
    if (index === 0 || !step.buildsOnPrevious) {
      resolved.push(index === 0 ? { ...step, buildsOnPrevious: false } : step);
      return;
    }
    const prev = resolved[index - 1];
    resolved.push({
      ...step,
      layout: { ...prev.layout, questionText: step.layout.questionText },
      tuning: { ...prev.tuning },
      survey: {
        ...step.survey,
        categoriesCsv: prev.survey.categoriesCsv,
        categoryMeta: prev.survey.categoryMeta,
        allowInteraction: true,
      },
      experimental: {
        ...(step.experimental ?? createDefaultExperimental()),
        enabled: true,
      },
      buildsOnPrevious: true,
    });
  });
  return resolved;
}

export function resolveStep(config: GridConfig, index: number): GridStep {
  return resolveSteps(config)[clampStepIndex(config, index)];
}

/** A new step that builds on `prev`: same grid, experimental, no response labels yet. */
export function createFollowUpStep(prev: GridStep): GridStep {
  return {
    id: crypto.randomUUID(),
    layout: {
      ...prev.layout,
      questionText: "How do you feel about each of these neighbors?",
    },
    tuning: { ...prev.tuning },
    survey: { ...prev.survey, advancedCategories: false },
    experimental: { ...createDefaultExperimental(), enabled: true },
    buildsOnPrevious: true,
  };
}

export function addFollowUpStep(config: GridConfig): GridConfig {
  const resolved = resolveSteps(config);
  const steps = getSteps(config);
  return setSteps(config, [
    ...steps,
    createFollowUpStep(resolved[resolved.length - 1]),
  ]);
}

/**
 * Copy inherited values into the stored step so it still looks right once it no
 * longer inherits (it was unlinked, or the step it built on was removed).
 */
function materialize(config: GridConfig): GridStep[] {
  const resolved = resolveSteps(config);
  return getSteps(config).map((step, i) =>
    i > 0 && step.buildsOnPrevious ? { ...resolved[i] } : step,
  );
}

export function removeStepAt(config: GridConfig, index: number): GridConfig {
  if (getStepCount(config) <= 1) return config;
  const steps = materialize(config);
  steps.splice(clampStepIndex(config, index), 1);
  steps[0] = { ...steps[0], buildsOnPrevious: false };
  return setSteps(config, steps);
}

export function setStepBuildsOnPrevious(
  config: GridConfig,
  index: number,
  value: boolean,
): GridConfig {
  if (index <= 0 || index >= getStepCount(config)) return config;
  const steps = materialize(config);
  steps[index] = { ...steps[index], buildsOnPrevious: value };
  return setSteps(config, steps);
}
