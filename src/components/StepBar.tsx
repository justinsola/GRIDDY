import React from "react";
import { useEditor } from "../EditorContext";
import { clampStepIndex, resolveSteps } from "../lib/steps";

/** Lists the survey's steps, lets you switch between them, add one, or link/unlink/remove the active one. */
export const StepBar: React.FC = () => {
  const {
    state: { config, activeStep },
    dispatch,
  } = useEditor();

  const steps = resolveSteps(config);
  const active = clampStepIndex(config, activeStep ?? 0);
  const activeBuilds = active > 0 && !!steps[active].buildsOnPrevious;

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold text-slate-600">Steps</span>
        {steps.map((step, index) => {
          const isActive = index === active;
          return (
            <React.Fragment key={step.id}>
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={`text-xs ${step.buildsOnPrevious ? "text-violet-500" : "text-slate-300"}`}
                  title={
                    step.buildsOnPrevious
                      ? "Builds on the previous step"
                      : "Independent step"
                  }
                >
                  {step.buildsOnPrevious ? "→" : "·"}
                </span>
              )}
              <button
                type="button"
                onClick={() => dispatch({ type: "selectStep", index })}
                aria-current={isActive ? "step" : undefined}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                  isActive
                    ? "border-slate-900 bg-white text-slate-900 shadow-sm"
                    : "border-slate-200 bg-white/60 text-slate-600 hover:bg-white"
                }`}
              >
                {index + 1}.{" "}
                {step.experimental?.enabled ? "Experimental" : "Standard"}
              </button>
            </React.Fragment>
          );
        })}
        <button
          type="button"
          onClick={() => dispatch({ type: "addStep" })}
          className="rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-400 hover:bg-white"
        >
          + Add step
        </button>
      </div>

      {steps.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2">
          {active > 0 ? (
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-slate-300"
                checked={activeBuilds}
                onChange={(e) =>
                  dispatch({
                    type: "setBuildsOnPrevious",
                    index: active,
                    value: e.target.checked,
                  })
                }
              />
              Build on step {active} (same grid, pre-filled with the
              respondent's answers)
            </label>
          ) : (
            <span className="text-xs text-slate-500">
              Step 1 is the first thing respondents see.
            </span>
          )}
          <button
            type="button"
            onClick={() => dispatch({ type: "removeStep", index: active })}
            className="text-xs font-medium text-red-600 hover:text-red-700"
          >
            Remove step {active + 1}
          </button>
        </div>
      )}
    </div>
  );
};

export default StepBar;
