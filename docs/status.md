# GRIDDY project status

_Inventory as of 2 November 2026. Update this file whenever something below
changes; it is the one place that says where the project stands._

## Where everything lives

| Thing | Location |
| --- | --- |
| Source | https://github.com/justinsola/GRIDDY (`main`, public, MIT) |
| Live app | https://www.jlsola.com/GRIDDY/ (GitHub Pages, deployed from `main` by `.github/workflows/pages.yml`) |
| Link from the personal site | www.jlsola.com nav bar, "GRIDDY" tab, opens in a new tab (`justinsola/justinsola.github.io`, `_layouts/default.html`) |
| Documentation | `README.md`, `docs/codebase.md`, `docs/building.md`, `docs/deploying.md`, `docs/testing-in-qualtrics.md`, `docs/GRIDDY-docs.pdf` (source in `docs/pdf-source/`) |
| Citation | `CITATION.cff` (authors in order: Sola, Jenkins, Li, Puttoju, Siddamreddy, Filmeyer) |
| Old locations | `suhasp3/GRIDDY`, `justinsola/GRIDDY_Survey_Tool` and `justinsola/GRIDDY-tool` all redirect to the repository above. Nothing is left on Vercel. |

## Health (checked 2 November 2026)

- `main` is at `b5d3be6` (PR 18, merged 2 November), with the 2 November changes. Its build, its 309 tests in 18 files and lint passed locally on Node 24 before the merge. The main bundle is 504 kB, so the build prints Vite's "Some chunks are larger than 500 kB" warning; it still passes.
- The cell-size change (branch `feat/cell-size` from `b5d3be6`, not merged yet) passes `npm run build`, `npm test` (368 tests in 18 files) and `npm run lint` locally on Node 24; with it the main bundle is 514 kB, and the build still prints Vite's warning. A live check of its phone view on 2 November measured the width Qualtrics' phone view leaves for the grid (292 px in the new survey-taking experience, 309 px in the older layouts) and found the centred start 7 px off in the new experience. The changes made after it (90 × 90 px cells by default, the grid's border drawn outside its size, centring again until the respondent uses the grid, and the fixes from the branch's review) have not been run live yet; `docs/testing-in-qualtrics.md` Part D steps 5, 10 and 11 cover them.
- The live site serves `index.html` and its assets under `/GRIDDY/`; deep links such as `/GRIDDY/history` load the app through `404.html` (the HTTP status is 404, which is expected on GitHub Pages).
- CI (`.github/workflows/ci.yml`) runs build, tests and lint on every pull request and every push to `main`.
- Repository settings: description and seven topics set, homepage field points at the live app, Issues enabled (none open). `main` is not protected and the merged branches have not been deleted; both were declined on 31 October to avoid distractions.

## What the app does today

- **Editor** (`/`): question text, rows and columns (max 10 each), cell size (width and height in whole pixels from 20 to 600; 90 × 90 for a new survey, so a 3 × 3 grid is 290 × 290 px, which with its border just fits the 292 px Qualtrics' phone view leaves for it; a line gives the grid's size and notes a grid wider than that or cells under 44 px), where a grid wider than the screen starts (its middle or its left edge), optional centre cell with its own label, background image URL, barriers (blocked cells with their own colour or image), categories as a comma-separated list with per-category colour, image and layer mode. A hint under the question box says that leaving it empty (or only spaces) shows the wording written in Qualtrics instead.
- **Saving**: Save asks "Replace, or save as a new survey?" when the survey was renamed since it was opened or saved, or changed since (saved in another tab or window, or replaced by importing a backup). The multi-question page's "Save the editor's changes" asks the same.
- **Respondent input**: paint (click a category, then cells), dropdown per cell, or drag and drop. The export also supports a look-only grid (`allowInteraction: false`), but the editor has no control for it yet.
- **Words shown to respondents** (section 03): each grid can reword every text GRIDDY shows respondents, such as "Placing:", the empty-cell reminder and its buttons, Next, and what screen readers say. English by default; an empty box keeps the English.
- **Experimental mode**: the grid is pre-filled (fixed, shuffled or weighted) and respondents react with response labels (colour and picture, no layer mode); answers go to `__js_GridPrefills` and `__js_GridResponses` instead of `__js_GridAssignments`.
- **Previews**: both show the grid at 100% (the size its cells, rows and columns make) by default and scroll sideways when the panel is narrower; the preview column is 616 px wide on windows 1280 px and wider. The design preview offers Fit, which only shrinks the grid, and says what a click does; in an experiment with fixed or shuffled pre-fills, Clear pre-fills asks first. The respondent preview runs the real exported script as Desktop, Phone (the 292 px Qualtrics' phone view leaves for the grid, with the scroll hint and edge arrows; a wider grid starts at its middle unless the survey says its left edge) or Fit. Each preview remembers its view in this browser.
- **My Surveys** (`/history`): surveys saved in `localStorage` (`griddy.localSurveys.v1`), Duplicate (asks for the copy's name), JSON backup and restore (surveys told apart by id), multi-select `.qsf` export.
- **Combine surveys** (`/history/combine`): several saved grids become one `.qsf` with one block and one page per grid; the page shows each grid's `__js_` field names.
- **Export**: a `.qsf` that Qualtrics imports directly (one Text/Graphic question per grid with the JavaScript attached, embedded-data fields declared in the Survey Flow under their `__js_` names) or the raw JavaScript to paste. Every exported script starts with the MIT notice. The grid records its answers in Qualtrics' new survey-taking experience (the default for surveys created since 3 June 2026) and in the older layouts. Surveys exported by an older GRIDDY record nothing in the new experience until they are exported again.

## Repository facts

- Package `griddy` 0.9.0, `engines.node >= 22`, Vite 5, React 18, TypeScript 5, Vitest 4, ESLint 8.
- 18 pull requests, all merged with merge commits. 0 releases, 0 tags.
- Branches on origin besides `main`: 17 merged feature/fix branches left in place, plus one unmerged branch, `feature/multi-step-surveys` (Katun Li, 22 October 2026, one commit, 105 behind `main`).
- Git identities seen in history: Justin Lucas Sola; Katun Jie Li (as `katunli`, `Katun Li`, `katun`); Suhas Puttoju; Ishita Sai Siddamreddy (as `Ishita Siddamreddy`, `ishitasr76`). Michael Alfred Jenkins and Samuel Filmeyer are credited in `CITATION.cff` without commits on `main`.

## Decisions already made

| Decision | Done |
| --- | --- |
| License is MIT, copyright Justin Lucas Sola only | PR 11 (30 October 2026) |
| Mascot at the top of the README | PR 12 |
| Package metadata, citation, favicon, repository URLs | PR 13 |
| Host on GitHub Pages at www.jlsola.com/GRIDDY instead of Vercel; repository renamed to `GRIDDY` | PR 14, PR 15, rename on 31 October |
| GRIDDY tab on the personal site | `justinsola.github.io` commit 8bb973b |
| Repository description, topics, homepage, Issues on | 31 October |
| The exported grid keeps its designed size on every screen; overflow scrolls with clear cues and empty cells get a reminder by default | Decided 1 November 2026 |
| Save answers with `setJSEmbeddedData`, so Qualtrics' new survey-taking experience records them; the columns become `__js_GridAssignments`, `__js_GridPrefills` and `__js_GridResponses` | PR 18 (2 November 2026) |
| Save asks before replacing a renamed survey or one saved in another tab; Duplicate in My surveys (open question 1) | PR 18 (2 November 2026) |
| Reaction labels have no Layer mode (open question 2) | PR 18 (2 November 2026) |
| The design preview says what a click does; Clear pre-fills asks first (open question 3) | PR 18 (2 November 2026) |
| Delete the unused multi-step script (open question 4) | PR 18 (2 November 2026) |
| The grid's Next stays under the grid; researchers keep the grid as the last question on its page (open question 5) | Decided 2 November 2026 |
| Each grid can reword the texts GRIDDY shows respondents; one grid per language for a survey in several languages (open question 6) | PR 18 (2 November 2026) |
| GRIDDY's question text, when it has visible characters, is what respondents see; text of only spaces counts as empty (open question 7) | PR 18 (2 November 2026) |
| Keep loading the grid's two fonts from Google Fonts (open question 8) | Decided 2 November 2026 |
| Previews show the grid at 100% unless the researcher picks another view (Fit, Phone) | PR 18 (2 November 2026) |
| A grid's size follows from its cell size (set per survey), rows and columns, instead of every grid filling 550 × 550 px: a design has the same size on every device and is never shrunk, but designs differ in size. Surveys saved earlier keep their exact size | Built 2 November 2026 on `feat/cell-size`, not merged yet |
| The editor's phone width is 292 px, what Qualtrics' phone view leaves for the grid in the new survey-taking experience (309 px in the older layouts; the phone preview itself is 339 px wide), and a new survey's cells are 90 × 90 px, so its 3 × 3 grid, 292 px with its border, fits exactly (about half the 550 px of before) | Decided 2 November 2026 after a live check, built on `feat/cell-size`, not merged yet |
| A grid wider than the screen starts scrolled to its middle and is centred again whenever the layout changes, until the respondent first uses the grid (presses, touches, scrolls or types in it, drops a label in it, or presses Show me); after that it is never moved. The researcher can choose its left edge instead. Vertically the page scrolls as before | Built 2 November 2026 on `feat/cell-size`; centring again decided the same day after a live check, where the page settled 14 px narrower after the grid had centred itself. Not merged yet |
| Delete merged branches, protect `main` | Declined for now |

## Known gaps

- The end-to-end path (build, export, import into Qualtrics, preview, recorded answers) was run fifteen times on 1 and 2 November 2026, on `main` and on the fix branches; the last four runs covered Qualtrics' new survey-taking experience as well as the older layout. The phone view of `feat/cell-size` was also checked live on 2 November (see the findings log). The runs used fourteen Qualtrics test projects, which are still in Justin's account; he deletes them himself. `docs/testing-in-qualtrics.md` is the process and its findings log. PR 17 fixed what the 1 November runs and three code reviews found. The 2 November changes make the grid record its answers in the new survey-taking experience and settle the eight open questions; the doc's "Open questions" section lists the two still open (run-time language sets, and piped text with a quote).
- Tried live: eleven respondent texts in Spanish, in both survey-taking experiences. Not yet tried in a live Qualtrics survey: a full set of texts in another language, right-to-left texts, and a real screen reader hearing translated texts.
- Tests are unit tests only (export builders, reducer, storage, preview panel, editor pages). Nothing drives the real UI automatically.
- The app page has no `description` or social-preview meta tags.
- Page 7 of the documentation PDF is half blank (cosmetic).
- Dependencies: ESLint 8 is end of life; `@nextui-org/*` is deprecated in favour of `@heroui/*`.

## Next steps, in order

1. Run Part D steps 5, 10 and 11 of `docs/testing-in-qualtrics.md` on `feat/cell-size` in both survey-taking experiences, then review and merge it.
2. Tag `v0.9.0`, publish a GitHub release, mint a Zenodo DOI and add it to `CITATION.cff` and the README. The release notes must say that the answer columns are now the `__js_` names, that surveys exported earlier record nothing in Qualtrics' new survey-taking experience until they are exported again, and that a grid's size now follows from its cells (90 × 90 px for a new survey; surveys saved earlier keep their size).
3. Shelve `feature/multi-step-surveys` as a tagged archive branch.
4. Bugs and features: persist experimental pre-fills across reloads, add paradata, and the two open questions in `docs/testing-in-qualtrics.md`.
5. Optional housekeeping: delete the merged branches, protect `main`.
