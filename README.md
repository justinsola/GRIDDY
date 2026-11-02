# GRIDDY

<p align="center">
  <img src="docs/assets/griddy-mascot.png" alt="The GRIDDY mascot: an orange, shaggy character with arms spread wide, wearing a black GRIDDY t-shirt with a 3 by 3 grid on it" width="360">
</p>

GRIDDY is a web-based grid question editor for building custom survey grid questions and exporting them into Qualtrics. It lets researchers configure a grid layout, define categories, preview the respondent experience, save reusable survey designs, and generate JavaScript that can be pasted into a Qualtrics question.

Live app: https://www.jlsola.com/GRIDDY/

## Team

Developed by Michael Alfred Jenkins, Katun Jie Li, Suhas Puttoju, and Ishita Sai Siddamreddy, with Samuel Filmeyer, under Justin Lucas Sola.

## What GRIDDY Does

- Build and preview custom grid questions, at full size or as on a phone.
- Configure survey categories, labels, colors, and interaction behavior.
- Reword the texts GRIDDY shows respondents, for surveys in other languages.
- Save and duplicate surveys locally in the browser.
- Export saved surveys as JSON backups.
- Export a ready-to-import Qualtrics `.qsf` (single grid or a multi-grid bundle) — no manual question/field setup required. The grid records its answers in Qualtrics' new survey-taking experience and in the older layouts.

## Tech Stack

- React + TypeScript
- Vite
- Tailwind CSS
- GitHub Pages for deployment
- Qualtrics JavaScript export for survey delivery

## Local Setup

Clone the repository:

```bash
git clone https://github.com/justinsola/GRIDDY.git
cd GRIDDY
```

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

Open the local URL shown in the terminal, usually `http://localhost:5173`.

## Available Scripts

```bash
npm run dev
```

Starts the local development server.

```bash
npm run build
```

Type-checks the project and builds the production app into `dist/`.

```bash
npm run preview
```

Serves the production build locally for a final check.

```bash
npm run lint
```

Runs ESLint.

```bash
npm run test
```

Runs the Vitest test suite.


## Qualtrics Workflow

The recommended path is a one-click `.qsf` import — GRIDDY builds the entire
survey for you (question, JavaScript, and embedded-data fields), so there is no
manual setup in Qualtrics.

1. Build and preview a grid in GRIDDY (works for standard and experimental modes).
2. Save the survey if you want to reuse or edit it later.
3. Click **Export to Qualtrics**, then **Download .qsf**. (On the *My Surveys*
   page you can select multiple saved surveys and export them all into one
   `.qsf`, one grid per page.)
4. In Qualtrics, click **Create a new project → Survey → Get started**, choose
   **"Import a QSF file"**, select the downloaded `.qsf`, and click
   **Create project**. Each grid is on a page of its own. If you add
   questions, keep the grid as the last question on its page and put
   follow-up questions above it or on the next page: unless the grid allows
   empty cells, its own Next, under the grid, replaces Qualtrics' Next for
   the whole page.
5. **Publish.** The grid renders and saves responses automatically into the
   pre-created embedded-data fields, visible under **Data & Analysis**:
   `__js_GridAssignments` for a single grid, or `__js_GridPrefills` and
   `__js_GridResponses` in experimental mode. Qualtrics puts `__js_` in front
   of each field GRIDDY's script saves. In a multi-question survey each grid
   gets its own fields, named after its data field:
   `__js_GridAssignments_<name>`, or `__js_GridPrefills_<name>` and
   `__js_GridResponses_<name>`. The multi-question page shows each grid's
   exact field names. A grid exported on its own can get a **Field name
   ending** in the export dialog: `Q2` saves to `__js_GridAssignments_Q2`.
   If a field's column isn't shown in **Data & Analysis**, add it with
   **Column chooser → Embedded Data**; data downloads always include it.

### Qualtrics' new survey-taking experience

Qualtrics' new survey-taking experience (formerly Simple Layout) is the
default for surveys created in Qualtrics since 3 June 2026. The grid works the
same in it and in the older layouts. A survey imported from GRIDDY's `.qsf`
starts on the older layout. A grid pasted or copied into a survey created in
Qualtrics since then, or a survey switched to the new experience under
**Look and feel**, runs in the new experience.

The answer columns were renamed in November 2026: they used to be
`GridAssignments`, `GridPrefills` and `GridResponses`, and are now the
`__js_` names above. Analysis code that looks for `GridAssignments` must use
`__js_GridAssignments`. A survey exported from an older GRIDDY (its Survey
Flow declares the names without `__js_`) still records in the older layouts,
but records nothing in the new experience, although the grid looks and works
normally. For such a survey, either:

- export it from GRIDDY again and import the new `.qsf`, or paste the new
  script into the grid question and declare the `__js_` fields in the Survey
  Flow; or
- switch the survey back to the older layout in **Survey options**.

### Manual fallback

To paste into an existing survey instead, use **Copy code** in the export
dialog: add an Embedded Data element with the listed field(s) to your Survey
Flow, under their `__js_` names (for example `__js_GridAssignments`), add a
Text/Graphic question on its own page, and paste the script into its
JavaScript editor. A Survey Flow that declares only `GridAssignments` records
nothing in the new survey-taking experience. Unless the grid allows empty
cells, it hides Qualtrics' Next button on its page and moves on with its own
Next. Each grid in a survey needs its own fields: give each one its own
**Field name ending** in the export dialog, or combine them on the
multi-question page, which names each grid's fields. A grid question copied in
Qualtrics, or repeated with Loop & Merge, would share its fields with the
original.

### Words shown to respondents

GRIDDY adds a few words of its own around the grid: the **Placing:** label,
the drag instructions, the empty-cell reminder with **Show me** and
**Continue anyway**, the grid's **Next**, the scroll hint, and what screen
readers hear. They are English by default, and Qualtrics' Translate tool
does not reach them. To reword them, open **03 How respondents answer →
Words shown to respondents** in the editor. Each grid keeps its own wording;
an empty box keeps GRIDDY's English, and Respondent preview shows the result.

- Keep placeholders such as `{n}`; the editor warns when one is missing.
  Counts have one text for 1 and one for 2 or more.
- The spoken reminder names the buttons in its own words ("Use Show me … or
  Continue anyway"). If you rename the buttons, reword it to match.
- Text typed there is shown exactly as typed: Qualtrics piped text such as
  `${e://Field/Name}` is not filled in there.
- For a survey in several languages, add one grid per language and show each
  with display logic on `Q_Language`.

The question itself is the **Question text** typed in GRIDDY. Leave that box
empty to show the wording written in Qualtrics instead, for example to format
or translate it there.

## Deployment

The production app is hosted on GitHub Pages at https://www.jlsola.com/GRIDDY/.
A GitHub Actions workflow builds the app with:

```bash
npm run build
```

and publishes the generated `dist/` folder. No environment variables are required.
Every push to `main` deploys to the live site automatically; other branches and
PRs only run the CI checks. See [docs/deploying.md](docs/deploying.md) for the
full workflow.

## Project Structure

- `src/App.tsx`: Main grid editor page.
- `src/components/`: Editor (`ConfigPanel`), preview, save, and tour components.
- `src/pages/`: My Surveys (history), combine-surveys, and error pages.
- `src/lib/`: Saved survey and Qualtrics export helpers.
- `src/grid-types.ts`: Shared TypeScript types for grid configuration.

## Documentation

- [docs/codebase.md](docs/codebase.md) — how the app is structured, the data model, and where to add features.
- [docs/building.md](docs/building.md) — local setup, scripts, the build, and troubleshooting.
- [docs/deploying.md](docs/deploying.md) — how GitHub Pages deploys, the branch → PR → merge workflow, and rollbacks.

## License

GRIDDY is released under the [MIT License](LICENSE). Copyright (c) 2026 Justin Lucas Sola.

The JavaScript that GRIDDY exports into your Qualtrics survey is covered by the
same license. The exported code carries the copyright and permission notice as
a comment, so a survey that embeds it already satisfies the license's one
condition; no further attribution is required.
