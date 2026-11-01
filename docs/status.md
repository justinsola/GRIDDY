# GRIDDY project status

_Inventory as of 1 November 2026. Update this file whenever something below
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

## Health (checked 1 November 2026)

- `main` is at `c0d1ae4`. `npm run build`, `npm test` (82 tests in 4 files on `main`; 142 in 8 files with PR 17) and `npm run lint` all pass locally on Node 24 and in CI on Node 22.
- The live site serves `index.html` and its assets under `/GRIDDY/`; deep links such as `/GRIDDY/history` load the app through `404.html` (the HTTP status is 404, which is expected on GitHub Pages).
- CI (`.github/workflows/ci.yml`) runs build, tests and lint on every pull request and every push to `main`.
- Repository settings: description and seven topics set, homepage field points at the live app, Issues enabled (none open). `main` is not protected and the merged branches have not been deleted; both were declined on 31 October to avoid distractions.

## What the app does today

- **Editor** (`/`): question text, rows and columns (max 10 each), optional centre cell with its own label, background image URL, barriers (blocked cells with their own colour or image), categories as a comma-separated list with per-category colour, image and layer mode.
- **Respondent input**: paint (click a category, then cells), dropdown per cell, or drag and drop. The export also supports a look-only grid (`allowInteraction: false`), but the editor has no control for it yet.
- **Experimental mode**: the grid is pre-filled (fixed, shuffled or weighted) and respondents react with response labels; answers go to `GridPrefills` and `GridResponses` instead of `GridAssignments`.
- **Respondent preview**: runs the real exported script inside the app.
- **My Surveys** (`/history`): surveys saved in `localStorage` (`griddy.localSurveys.v1`), JSON backup and restore, multi-select `.qsf` export.
- **Combine surveys** (`/history/combine`): several saved grids become one `.qsf` with one block and one page per grid.
- **Export**: a `.qsf` that Qualtrics imports directly (one Text/Graphic question per grid with the JavaScript attached, embedded-data fields declared in the Survey Flow) or the raw JavaScript to paste. Every exported script starts with the MIT notice.

## Repository facts

- Package `griddy` 0.9.0, `engines.node >= 22`, Vite 5, React 18, TypeScript 5, Vitest 4, ESLint 8.
- 15 pull requests, all merged with merge commits. 0 releases, 0 tags.
- Branches on origin besides `main`: 14 merged feature/fix branches left in place, plus one unmerged branch, `feature/multi-step-surveys` (Katun Li, 22 October 2026, one commit, 55 behind `main`).
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
| Delete merged branches, protect `main` | Declined for now |

## Known gaps

- The end-to-end path (build, export, import into Qualtrics, preview, recorded answers) was run seven times on 1 November 2026, on `main` and on the fix branch. `docs/testing-in-qualtrics.md` is the process; PR 17 fixes what the runs and two code reviews found, and the doc's "Open questions" section lists six behaviours for the maintainer to decide.
- Tests are unit tests only (export builders, reducer, storage, preview panel). Nothing drives the real UI automatically.
- The app page has no `description` or social-preview meta tags.
- Page 7 of the documentation PDF is half blank (cosmetic).
- Dependencies: ESLint 8 is end of life; `@nextui-org/*` is deprecated in favour of `@heroui/*`.

## Next steps, in order

1. Run the Qualtrics test process and fix what it finds.
2. Tag `v0.9.0`, publish a GitHub release, mint a Zenodo DOI and add it to `CITATION.cff` and the README.
3. Shelve `feature/multi-step-surveys` as a tagged archive branch.
4. Bugs and features: persist experimental pre-fills across reloads, add paradata.
5. Optional housekeeping: delete the merged branches, protect `main`.
