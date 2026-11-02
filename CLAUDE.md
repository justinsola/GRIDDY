# GRIDDY

React + TypeScript + Vite + Tailwind app for building custom grid-question surveys and exporting them to Qualtrics (`.qsf` import or raw JS paste). See `README.md` for setup/scripts.

## Architecture

- `src/EditorContext.tsx` — single reducer (`editorReducer`) + React context holding the whole `GridConfig`. All editor UI dispatches typed actions here. `normalizeConfig` runs on every `setConfig` (opening a survey, and every keystroke in the study name box) to keep `categoryMeta`/`barrierMeta`/`responseLabelMeta` in sync with their CSV fields, to repair older saves (label names with spaces at either end, grid sizes that are not whole numbers of at least 1), and to keep only known texts with visible words in `survey.respondentTexts`. Keep it cheap and idempotent. The state also holds `savedRecord` (the id, the name then and `updated_at` of the survey as last opened or saved), which `markSaved` sets from the stored record.
- `src/grid-types.ts` — canonical types. `GridConfig` = `LayoutConfig` + `TuningConfig` + `SurveyConfig` + optional `ExperimentalConfig`.
- `src/components/ConfigPanel.tsx` — the live editor UI (question/grid, categories, selection mode with "Words shown to respondents" from `RespondentTextsEditor.tsx`, experiment setup).
- `src/components/PreviewPanel.tsx` — the design preview (paint/dropdown/dragdrop, painting pre-fills, blocking cells), the **Design preview / Respondent preview** switch, and the Export-to-Qualtrics modal. `RespondentPreview.tsx` runs the exported script itself in a sandboxed iframe with a stand-in for Qualtrics. Both previews show the grid at 100% by default. The View switch (`PreviewViewChoice.tsx`, remembered per browser by `src/lib/previewView.ts`) offers Fit, and Phone (375 px) in the respondent preview. Fit scales the iframe from the editor; the page inside is never zoomed.
- `src/lib/qualtricsExport.ts` — builds a vanilla-JS Qualtrics snippet, and a full `.qsf` (Qualtrics Survey Format) JSON document that Qualtrics can import directly (question + JS + embedded-data fields + survey flow, no manual setup). The snippet is self-contained except for the two Google Fonts it loads (kept on purpose, decided 2 November 2026). It is a template literal that runs in respondents' browsers: keep it ES2017-compatible, and write `${` in it only for real interpolation, because Qualtrics fills in `${...}` as piped text.
- Saving answers: the script saves through `saveField`, which calls `setJSEmbeddedData` (Qualtrics records the field as `__js_` plus the name) and also `setEmbeddedData`, unless that is the stub of Qualtrics' new survey-taking experience, where `setEmbeddedData` and `getEmbeddedData` only log that they are deprecated. Reading answers back tries `getJSEmbeddedData` first. A failed save must never stop the grid, its reminder or its Next. The script, `QualtricsQsfItem`, `qsfEmbeddedFields` and the field collision check use the plain names; the `.qsf` Survey Flow, the export dialog and the multi-question page show `recordedFieldName(name)`, the `__js_` name researchers see in Data & Analysis.
- Words shown to respondents: every word the script shows respondents comes from its `texts` object through `fillText`. To add one, add a key with its English default, label, `usedBy` and placeholders in `src/lib/respondentTexts.ts`; never hard-code English in the script template. `scriptJson` embeds the texts with `<`, `$` and U+2028/U+2029 escaped.
- The exported grid keeps its designed size on every screen. When it is wider than the screen it scrolls sideways inside its own frame, with a hint and edge arrows; never shrink cells, text or pictures to fit. The editor's previews show the grid at 100% unless the researcher picks another view; never make a scaled view the default. GRIDDY's question text, when it has visible characters, is what respondents see. `docs/status.md` lists these and the other standing decisions.
- `src/lib/surveysApi.ts` — save/load/duplicate/delete/export/import surveys, entirely via browser `localStorage` (key `griddy.localSurveys.v1`). Import matches surveys by id; `surveyFingerprint` (stable JSON hash of name + config minus `id`) only skips a survey that is already here unchanged.
- `src/lib/saveEditorSurvey.ts` — the save shared by the Save button and the multi-question page. When the survey was renamed since it was opened or saved, or its stored `updated_at` no longer matches `savedRecord` (saved in another tab or window), it stores nothing and returns a `SaveConflict`; `SaveChoiceDialog.tsx` then asks: Save as new survey, Replace or Cancel.
- `src/pages/HistoryPage.tsx` ("My Surveys") — list/open/duplicate/delete saved surveys, JSON export/import.
- `src/pages/CombineSurveysPage.tsx` — the multi-question page: several saved grids in one `.qsf`, each with its own embedded-data fields.
- `docs/testing-in-qualtrics.md` — the end-to-end test process in a real Qualtrics account, in both of Qualtrics' survey-taking experiences, with its findings log. `scripts/check-qsf.mjs` checks a downloaded `.qsf` before import; it requires every field a script saves to be declared under its `__js_` name.

## Removed: sign-in / cloud accounts (2026-08-14)

Sign-in and Supabase-backed cloud sync were removed to simplify the app to a local-storage-only tool — no backend/database is needed anymore. This section exists so the feature can be reimplemented later without re-deriving the design.

**What existed before removal:**
- `src/lib/supabase.ts` — Supabase client, read `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from env.
- `src/lib/authContext.tsx` — `AuthProvider`/`useAuth()`, wrapping Supabase Auth (email/password sign in, sign up with first/last name metadata, sign out), backed by `supabase.auth.onAuthStateChange` + `getSession()`.
- `src/pages/AuthPage.tsx` — sign-in/sign-up form at `/auth`.
- `src/pages/ProfilePage.tsx` — profile view at `/profile` (name, email, saved-survey count).
- `src/components/AuthModal.tsx` — an unused NextUI-based modal variant of the same sign-in/sign-up form (was already dead code before removal).
- `App.tsx` header had a Sign In / avatar-initials-linking-to-profile / Sign Out cluster.
- `surveysApi.ts` functions (`saveSurvey`, `listSurveys`, `loadSurvey`, `deleteSurvey`, `exportSurveys`, `importSurveys`, `getActiveSurveyQuestionCount`) all took an optional `userId`: when present they read/wrote a Supabase `surveys` table (`id, user_id, name, config jsonb, created_at, updated_at`) instead of `localStorage`, so a signed-in user's surveys synced across devices.

**To reimplement:** restore the files above (recoverable from git history before this change), reintroduce `userId`-branching in `surveysApi.ts`, re-add the `surveys` Supabase table + RLS policy scoping rows to `auth.uid()`, add `@supabase/supabase-js` back to `package.json`, and restore `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` env vars (local `.env` + the hosting provider's settings).

**What stayed:** all local-storage save/load/delete, JSON export/import (survey backups), and Qualtrics `.qsf`/JS export/download — none of that depended on auth.
