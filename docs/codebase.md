# How the GRIDDY codebase works

GRIDDY is a **single-page web app with no backend**. Everything runs in the
browser:

- The researcher builds a grid question in the editor.
- Surveys are saved to the browser's `localStorage`.
- The app turns a survey into Qualtrics JavaScript or a full `.qsf` file that
  Qualtrics imports. **The respondent experience runs inside Qualtrics, not on
  GRIDDY.** GRIDDY is only the authoring tool.

```
 ┌──────────────── Browser (www.jlsola.com/GRIDDY) ────────────────┐
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
   embedded-data fields like __js_GridAssignments / __js_GridResponses)
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
| GitHub Pages | Hosting (static files only) |

## Pages (routes)

Defined in [`src/main.tsx`](../src/main.tsx). Every page is wrapped by
[`Providers`](../src/components/Providers.tsx), which supplies NextUI and the
editor state.

| URL | Component | What it does |
| --- | --- | --- |
| `/` | [`App.tsx`](../src/App.tsx) | The editor: config panel on the left, live preview on the right, Save / New / My Surveys / tour in the header. |
| `/history` | [`HistoryPage.tsx`](../src/pages/HistoryPage.tsx) | "My Surveys": open, duplicate, delete, JSON export/import backups. |
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
                                    // interaction on/off, selection mode,
                                    // optional respondentTexts (own wording)
  experimental?: ExperimentalConfig // pre-filled grid + response labels
}
```

Things worth knowing:

- **Categories are stored as a CSV string** (`categoriesCsv: "Family, Friends"`)
  plus a `categoryMeta` map keyed by name (color, image, layer mode). The same
  pattern is used for barriers (`barriersCsv` / `barrierMeta`) and experimental
  response labels (`responseLabelsCsv` / `responseLabelMeta`). The reducer keeps
  the map in sync whenever the CSV changes. Response labels have no Layer mode
  in the editor: a reaction's picture always covers the pre-filled cell, and a
  layer mode saved with a label in an older survey is ignored.
- **Cells are keyed `"r{row}-c{col}"`**, 1-based (e.g. `"r2-c3"`). This key shows
  up in blocked cells, fixed pre-fill assignments and the exported answers.
- **Selection modes**: `paint` (pick a label, click cells), `dropdown`, and
  `dragdrop`.
- **Experimental mode**: the grid is pre-filled (`fixed`, `shuffle` or `weighted`
  random) and the respondent rates each pre-filled cell with a response label.
- **Images** uploaded by the user are compressed in the browser and stored inline
  as `data:` URIs ([`src/lib/imageInput.ts`](../src/lib/imageInput.ts)), so the
  exported survey has no outside image hosting to depend on.
- **Words shown to respondents** are stored per grid in the optional
  `survey.respondentTexts` (text key → the grid's own wording). A text left
  out, empty or made only of spaces shows GRIDDY's English, so surveys saved
  without the field need no repair. `normalizeConfig` keeps only known keys
  with visible text. The keys, their English and their placeholders live in
  [`src/lib/respondentTexts.ts`](../src/lib/respondentTexts.ts).
- **Question text** made only of spaces counts as empty: the exported grid
  then shows the wording written in Qualtrics, and the `.qsf` leaves the
  Qualtrics question text blank.

## Where state lives: `EditorContext`

[`src/EditorContext.tsx`](../src/EditorContext.tsx) holds a single
`useReducer` with the survey being edited. UI components never change the config
directly; they dispatch actions:

| Action | Effect |
| --- | --- |
| `setConfig` | Replace the whole config (e.g. when loading a saved survey). Runs `normalizeConfig` to fill defaults, sync meta maps and drop unusable `respondentTexts`. |
| `updateLayout` / `updateTuning` / `updateSurvey` / `updateExperimental` | Merge a partial patch into that section. Also handles renames, so a category rename keeps its placements. |
| `markSaved` | Remember that the current config is saved, as the stored `record` it was just saved or opened as. Sets `savedRecord` (id, the name then, `updated_at`). After "Save as new survey" the editor's survey takes the new record's id. |
| `newSurvey` | Reset to a fresh default survey and forget `savedRecord`. |

Read state anywhere with `const { state, dispatch } = useEditor();`.

**Saving** goes through `saveEditorSurvey`
([`src/lib/saveEditorSurvey.ts`](../src/lib/saveEditorSurvey.ts)), shared by the
Save button and the multi-question page's "Save the editor's changes". If the
survey was renamed since it was opened or last saved, or its stored copy has a
different `updated_at` (it was saved in another tab or window, or replaced
by importing a newer backup), it stores
nothing and returns a `SaveConflict`. `SaveChoiceDialog` then asks: Save as new
survey (a new id, the original left as it was), Replace, or Cancel.

**Adding a new survey setting usually means:** add the field to the type in
`grid-types.ts` → give it a default in `createDefaultConfig` (and in
`normalizeConfig`, so old saved surveys still load) → add a control in
`ConfigPanel.tsx` → render it in `PreviewPanel.tsx` → render it in the Qualtrics
script in `qualtricsExport.ts` → add a test. An optional field with no default
is fine when leaving it out means today's behaviour; `survey.respondentTexts`
is an example.

## Components

| File | Role |
| --- | --- |
| [`ConfigPanel.tsx`](../src/components/ConfigPanel.tsx) | The left-hand editor (numbered sections: question & grid, categories, how respondents answer, experiment setup). A hint under the question box says that leaving it empty uses the wording written in Qualtrics. |
| [`CategoryChips.tsx`](../src/components/CategoryChips.tsx) | Chip editor for categories / barriers / labels, with color presets and image upload. Layer mode is offered for categories only. |
| [`RespondentTextsEditor.tsx`](../src/components/RespondentTextsEditor.tsx) | "Words shown to respondents" in section 03: the grid's own wording for GRIDDY's texts. Lists only the texts the grid can show: those its answer mode, experiment and empty-cell setting use, and, for a grid respondents only look at (no labels to place, or interaction off), just the scroll hint and the arrows, with the English as placeholder, a Reset, and a warning when a placeholder such as `{n}` is missing or unknown. |
| [`ImageInput.tsx`](../src/components/ImageInput.tsx) | URL-or-upload image field. |
| [`PreviewPanel.tsx`](../src/components/PreviewPanel.tsx) | Live, interactive grid preview (design view) and the **Export to Qualtrics** modal. The design grid is drawn at 100% (or Fit), and a line above it says what a click does. In an experiment with fixed or shuffled pre-fills, "Clear pre-fills" asks first. |
| [`RespondentPreview.tsx`](../src/components/RespondentPreview.tsx) | Runs the exported script in an isolated frame with a stand-in for Qualtrics. Desktop (the default) shows the page at full size, Phone in a 375 px wide frame with the grid's scroll hint and edge arrows, and Fit zooms the whole frame out. The Qualtrics theme around the question can still differ. |
| [`PreviewViewChoice.tsx`](../src/components/PreviewViewChoice.tsx) | The View switch above each preview: 100% / Fit, or Desktop / Phone / Fit. |
| [`SaveButton.tsx`](../src/components/SaveButton.tsx) | Saves to localStorage (needs a survey title). Opens `SaveChoiceDialog` when saving would replace a survey renamed or saved elsewhere since. |
| [`SaveChoiceDialog.tsx`](../src/components/SaveChoiceDialog.tsx) | Asks "Replace, or save as a new survey?" for the Save button and the multi-question page. |
| [`TourGuide.tsx`](../src/components/TourGuide.tsx) | Step-by-step onboarding tour. |
| [`FlexContainer.tsx`](../src/components/FlexContainer.tsx) | Small layout helper. |

## Library code (`src/lib/`)

| File | Role |
| --- | --- |
| [`surveysApi.ts`](../src/lib/surveysApi.ts) | Save/list/load/find/duplicate/delete surveys and JSON export/import. Storage key: `griddy.localSurveys.v1`. Import tells surveys apart by id: `surveyFingerprint` (a stable hash of name + config, ignoring `id`) only skips a survey already here unchanged, and of two different copies with one id the newer is kept. |
| [`saveEditorSurvey.ts`](../src/lib/saveEditorSurvey.ts) | The save shared by the Save button and the multi-question page: checks for a `SaveConflict`, then replaces the stored survey or saves it as a new one. |
| [`qualtricsExport.ts`](../src/lib/qualtricsExport.ts) | The biggest file. `buildQualtricsSnippet` writes a vanilla-JS renderer for one grid; `buildQualtricsQsf` / `buildQualtricsQsfForConfig` wrap one or many grids into an importable `.qsf` (questions + JS + embedded-data fields + survey flow). `recordedFieldName` gives the `__js_` name Qualtrics records a field under, which the `.qsf` declares. |
| [`respondentTexts.ts`](../src/lib/respondentTexts.ts) | The 50 texts GRIDDY shows respondents: key, English, editor label, group, which setups use it, and the placeholders it fills and needs. `respondentTextsFor` merges a grid's own wording with the English for the script; `cleanRespondentTexts`, `missingPlaceholders` and `unknownPlaceholders` serve `normalizeConfig` and the editor. |
| [`combineFields.ts`](../src/lib/combineFields.ts) | Finds two questions of a multi-question survey that would save to the same field, and names it as Qualtrics records it. |
| [`previewView.ts`](../src/lib/previewView.ts) | The previews' view choices, remembered in localStorage (`griddy.designPreviewView.v1`, `griddy.respondentPreviewView.v1`), and `useClientWidth`. |
| [`imageInput.ts`](../src/lib/imageInput.ts) | Downscale/compress an uploaded image to a base64 data URI. |
| [`utils.ts`](../src/lib/utils.ts) | `cn()` class-name helper for Tailwind. |

**Important:** the Qualtrics script is plain JavaScript written as a template
string inside `qualtricsExport.ts`, not React. Any visual feature has to be built
twice: once in React for the editor preview, and once in that script for real
respondents. `RespondentPreview` runs the exported script, so use it to check
that the two match.

Every word the script shows respondents comes from its `texts` object: the
grid's own wording merged with GRIDDY's English. `scriptJson` embeds it with
`<`, `$` and the line separators escaped, so a text can neither close the
script nor be filled in by Qualtrics as piped text. `fillText` fills
placeholders such as `{n}` in one pass, without a regex; `joinSentences` adds
no space after 。！？; each count has a One text for 1 and an Other text for 2
or more. To add a text, add its key in `respondentTexts.ts`; never hard-code
English in the script. Write `${` in the template only for real
interpolation, because Qualtrics fills in `${...}` as piped text.

## What gets saved in Qualtrics

The exported script saves the respondent's answers as JSON with
`setJSEmbeddedData`, which Qualtrics records under `__js_` and the field's
name. That is the name the `.qsf` declares in the Survey Flow, and the column
in Data & Analysis and in data downloads, in both Qualtrics experiences:

- Standard mode: `__js_GridAssignments` (cell key → category).
- Experimental mode: `__js_GridPrefills` (what was shown) and
  `__js_GridResponses` (how they rated it).

The script itself uses the plain names (`saveField("GridAssignments", …)`).
In Qualtrics' new survey-taking experience, the default for surveys created
since 3 June 2026, `setEmbeddedData` and `getEmbeddedData` are stubs that only
log "deprecated, please use setJSEmbeddedData". `saveField` also calls
`setEmbeddedData` where it is not that stub, so in the older layouts the
script still records the plain names in a survey whose Survey Flow declares
them (one first set up from an older GRIDDY export). Going Back or resuming reads the `__js_` field first, then the
plain name. A save that throws is skipped, so it never stops the grid, its
reminder or its Next.

With combined exports, each grid gets its own field names, which you set on the
Combine page. A field name ending set in the export dialog does the same for a
grid exported on its own (`__js_GridAssignments_Q2`).

## Tests

Tests sit next to the code as `*.test.ts(x)`:

- `EditorContext.test.ts`: reducer, CSV/meta syncing, renames, unsaved-edit
  detection, repairs of older saves, `savedRecord`, cleaning respondent texts.
- `lib/surveysApi.test.ts`: fingerprints, importing backups (copies told apart
  by id, newer copy kept), duplicating, full storage.
- `lib/saveEditorSurvey.test.ts`, `components/SaveButton.test.tsx`,
  `pages/HistoryPage.test.tsx`, `pages/CombineSurveysPage.test.tsx`: saving,
  asking before replacing, Save as new survey, Duplicate, the multi-question
  page.
- `lib/qualtricsExport.test.ts`: snippet and `.qsf` generation, the declared
  `__js_` names, escaping of respondent texts.
- `lib/respondentExperience.test.ts`: runs the exported script in a fake
  Qualtrics page: scroll cues, the empty-cell reminder, restoring answers,
  touch and keyboard input, and a full non-English set of texts. The fake page
  is the new survey-taking experience by default; pass
  `{ engine: "older" | "plain" | "failing" }` for the other kinds of page.
- `lib/respondentTexts.test.ts`, `components/RespondentTextsEditor.test.tsx`:
  the respondent texts and their editor.
- `lib/combineFields.test.ts`, `lib/imageInput.test.ts`, `lib/gridSize.test.ts`:
  small helpers.
- `components/PreviewPanel.test.tsx`, `components/ConfigPanel.test.tsx`,
  `components/CategoryChips.test.tsx`: editor and preview behaviour, including
  the preview views and the export dialog's field names.

## History notes

- Sign-in and Supabase cloud sync were **removed on 2026-08-14**. The
  [`CLAUDE.md`](../CLAUDE.md) file explains how to bring them back.
- The unused multi-step script (`buildQualtricsMultiQuestionSnippet`), which
  showed several grids inside one Qualtrics question and had not been used by
  the app since June 2026, was **deleted on 2026-11-02**. Git history keeps it.
- Until 2026-11-02 the script saved answers with `setEmbeddedData`, under the
  plain names (`GridAssignments`, `GridPrefills`, `GridResponses`). Those
  exports record nothing in Qualtrics' new survey-taking experience; export
  the survey again.
