# How the GRIDDY codebase works

GRIDDY is a **single-page web app with no backend**. Everything runs in the
browser:

- The researcher builds a grid question in the editor.
- Surveys are saved to the browser's `localStorage`.
- The app turns a survey into Qualtrics JavaScript or a full `.qsf` file that
  Qualtrics imports. **The respondent experience runs inside Qualtrics, not on
  GRIDDY.** GRIDDY is only the authoring tool.

```
 ┌──────────────── Browser (griddy-survey.vercel.app) ────────────────┐
 │                                                                    │
 │  ConfigPanel ──dispatch──▶ EditorContext (reducer, one GridConfig) │
 │       ▲                          │                                 │
 │       └──────── state ───────────┤                                 │
 │                                  ▼                                 │
 │  PreviewPanel / RespondentPreview      SaveButton ─▶ surveysApi    │
 │       │                                               │            │
 │       ▼                                               ▼            │
 │  qualtricsExport.ts ─▶ JS snippet / .qsf      localStorage         │
 └───────│────────────────────────────────────────────────────────────┘
         ▼
   Qualtrics (respondents answer the survey; answers land in
   embedded-data fields like GridAssignments / GridResponses)
```

## Tech stack

| Piece | What it is used for |
| --- | --- |
| React 18 + TypeScript | UI and type safety |
| Vite 5 | Dev server and production bundler |
| Tailwind CSS (+ NextUI, Radix icons) | Styling and a few UI primitives |
| React Router 6 | Client-side pages (`/`, `/history`, `/history/combine`) |
| react-joyride | The guided "tour" in the editor |
| Vitest + jsdom | Unit tests |
| Vercel | Hosting (static files only) |

## Pages (routes)

Defined in [`src/main.tsx`](../src/main.tsx). Every page is wrapped by
[`Providers`](../src/components/Providers.tsx), which supplies NextUI and the
editor state.

| URL | Component | What it does |
| --- | --- | --- |
| `/` | [`App.tsx`](../src/App.tsx) | The editor: config panel on the left, live preview on the right, Save / New / My Surveys / tour in the header. |
| `/history` | [`HistoryPage.tsx`](../src/pages/HistoryPage.tsx) | "My Surveys": open, delete, JSON export/import backups. |
| `/history/combine` | [`CombineSurveysPage.tsx`](../src/pages/CombineSurveysPage.tsx) | Pick several saved surveys, order them, name their data fields, export one combined `.qsf`. |

## The data model

All types live in [`src/grid-types.ts`](../src/grid-types.ts). One survey is a
`GridConfig`:

```ts
GridConfig {
  id, name
  layout:       LayoutConfig        // question text, rows/cols, center cell,
                                    // background image, barriers (walls/roads)
  tuning:       TuningConfig        // sizes: gap, padding, cell w/h, font size
  survey:       SurveyConfig        // categories (CSV + colors/images),
                                    // interaction on/off, selection mode
  experimental?: ExperimentalConfig // pre-filled grid + response labels
}
```

Things worth knowing:

- **Categories are stored as a CSV string** (`categoriesCsv: "Family, Friends"`)
  plus a `categoryMeta` map keyed by name (color, image, layer mode). The same
  pattern is used for barriers (`barriersCsv` / `barrierMeta`) and experimental
  response labels (`responseLabelsCsv` / `responseLabelMeta`). The reducer keeps
  the map in sync whenever the CSV changes.
- **Cells are keyed `"r{row}-c{col}"`**, 1-based (e.g. `"r2-c3"`). This key shows
  up in blocked cells, fixed pre-fill assignments and the exported answers.
- **Selection modes**: `paint` (pick a label, click cells), `dropdown`, and
  `dragdrop`.
- **Experimental mode**: the grid is pre-filled (`fixed`, `shuffle` or `weighted`
  random) and the respondent rates each pre-filled cell with a response label.
- **Images** uploaded by the user are compressed in the browser and stored inline
  as `data:` URIs ([`src/lib/imageInput.ts`](../src/lib/imageInput.ts)), so the
  exported survey has no outside image hosting to depend on.

## Where state lives: `EditorContext`

[`src/EditorContext.tsx`](../src/EditorContext.tsx) holds a single
`useReducer` with the survey being edited. UI components never change the config
directly; they dispatch actions:

| Action | Effect |
| --- | --- |
| `setConfig` | Replace the whole config (e.g. when loading a saved survey). Runs `normalizeConfig` to fill defaults and sync meta maps. |
| `updateLayout` / `updateTuning` / `updateSurvey` / `updateExperimental` | Merge a partial patch into that section. Also handles renames, so a category rename keeps its placements. |
| `markSaved` | Remember that the current config is saved. |
| `newSurvey` | Reset to a fresh default survey. |

Read state anywhere with `const { state, dispatch } = useEditor();`.

**Adding a new survey setting usually means:** add the field to the type in
`grid-types.ts` → give it a default in `createDefaultConfig` (and in
`normalizeConfig`, so old saved surveys still load) → add a control in
`ConfigPanel.tsx` → render it in `PreviewPanel.tsx` → render it in the Qualtrics
script in `qualtricsExport.ts` → add a test.

## Components

| File | Role |
| --- | --- |
| [`ConfigPanel.tsx`](../src/components/ConfigPanel.tsx) | The left-hand editor (numbered sections: question & grid, categories, selection mode, experiment setup). |
| [`CategoryChips.tsx`](../src/components/CategoryChips.tsx) | Chip editor for categories / barriers / labels, with color presets and image upload. |
| [`ImageInput.tsx`](../src/components/ImageInput.tsx) | URL-or-upload image field. |
| [`PreviewPanel.tsx`](../src/components/PreviewPanel.tsx) | Live, interactive grid preview (design view) and the **Export to Qualtrics** modal. |
| [`RespondentPreview.tsx`](../src/components/RespondentPreview.tsx) | Runs the *exact exported script* in an isolated frame, so you see what respondents will see. |
| [`SaveButton.tsx`](../src/components/SaveButton.tsx) | Saves to localStorage (needs a survey title). |
| [`TourGuide.tsx`](../src/components/TourGuide.tsx) | Step-by-step onboarding tour. |
| [`FlexContainer.tsx`](../src/components/FlexContainer.tsx) | Small layout helper. |
| `LayoutTab.tsx`, `SurveyTab.tsx` | **Dead code**: older editor UI replaced by `ConfigPanel`. Safe to delete. |

## Library code (`src/lib/`)

| File | Role |
| --- | --- |
| [`surveysApi.ts`](../src/lib/surveysApi.ts) | Save/list/load/delete surveys and JSON export/import. Storage key: `griddy.localSurveys.v1`. Import skips duplicates using `surveyFingerprint` (a stable hash of name + config, ignoring `id`). |
| [`qualtricsExport.ts`](../src/lib/qualtricsExport.ts) | The biggest file. `buildQualtricsSnippet` writes a self-contained vanilla-JS renderer for one grid; `buildQualtricsQsf` / `buildQualtricsQsfForConfig` wrap one or many grids into an importable `.qsf` (questions + JS + embedded-data fields + survey flow). |
| [`imageInput.ts`](../src/lib/imageInput.ts) | Downscale/compress an uploaded image to a base64 data URI. |
| [`utils.ts`](../src/lib/utils.ts) | `cn()` class-name helper for Tailwind. |

**Important:** the Qualtrics script is plain JavaScript written as a template
string inside `qualtricsExport.ts`, not React. Any visual feature has to be built
twice: once in React for the editor preview, and once in that script for real
respondents. `RespondentPreview` runs the exported script, so use it to check
that the two match.

## What gets saved in Qualtrics

The exported script writes the respondent's answers as JSON into embedded-data
fields:

- Standard mode: `GridAssignments` (cell key → category).
- Experimental mode: `GridPrefills` (what was shown) and `GridResponses` (how
  they rated it).

With combined exports, each grid gets its own field names, which you set on the
Combine page.

## Tests

Tests sit next to the code as `*.test.ts(x)`:

- `EditorContext.test.ts`: reducer, CSV/meta syncing, renames.
- `lib/surveysApi.test.ts`: localStorage save/import/dedupe.
- `lib/qualtricsExport.test.ts`: snippet and `.qsf` generation.
- `components/PreviewPanel.test.tsx`: preview rendering.

## History notes

- Sign-in and Supabase cloud sync were **removed on 2026-08-14**. The
  [`CLAUDE.md`](../CLAUDE.md) file explains how to bring them back. `.mcp.json`
  still points at the old Supabase project, and `localforage` / `react-webcam`
  are unused leftover dependencies.
- `package.json` still says `"name": "photobooth"` (from the starter template).
  It's harmless.
