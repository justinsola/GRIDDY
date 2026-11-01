# Testing GRIDDY end to end in Qualtrics

This is the manual test process for the whole path a researcher takes:
build a design in the live app, export it, import it into Qualtrics, preview
it there, and check that the answers come out right. Run it before a release,
after any change to `src/lib/qualtricsExport.ts`, and whenever Qualtrics
changes something on its side.

The process is written so that a person or a Claude session driving a browser
can run it. Each part lists the steps, what must be true afterwards, and what
to record. Findings go in the log at the bottom.

## What you need

- A browser signed in to the Qualtrics account you test with. A Claude
  session uses **Claude in Chrome** for this, because it needs the signed-in
  session; the built-in browser pane is not signed in and cannot sign in.
- Node 22 or newer, for the `.qsf` validator (`scripts/check-qsf.mjs`, no
  dependencies).
- About twenty minutes.

## The standard test design

Use this design for every run so results are comparable. It is deliberately
not the editor's default, so an export that silently reverted to defaults is
caught.

| Setting | Value |
| --- | --- |
| Survey name | `E2E test <date>` (for example `E2E test 2026-11-01`) |
| Question text | `Who lives where? Fill in the grid:` (default) |
| Rows × columns | 3 × 4 (non-square, so a rows/columns swap is visible) |
| Centre cell | on, label `Your House` |
| Categories | `Family, Friends, Coworkers, Neighbors, Mom's friends` (the fifth one is added by hand; the apostrophe checks escaping) |
| Respondent input | Select & click (paint) |
| Experiment | off |
| Barriers, images | none |

Variations to run when the relevant code changed are listed at the end.

## Part A: build and export in GRIDDY

1. Open https://www.jlsola.com/GRIDDY/ and click **New** if the editor is not
   empty.
2. Type the survey name in the box at the top (placeholder "Untitled survey").
3. In **01 Question & grid**, set **Columns** to 4. Leave rows at 3 and the
   centre cell on.
4. In **02 Categories**, click **+ Add category**, type `Mom's friends` in
   the **Name** box of the editor that opens, and click **Done**.
5. Click **Save**. The button reads "Saved!" for a moment.
6. Click **Export to Qualtrics** (bottom of the preview column), then
   **Download .qsf** in the dialog. Close the dialog with its **Close**
   button.
7. Switch the preview to **Respondent preview**, pick a category and click a
   few cells. The grid in this tab is drawn by the real exported script, so
   the layout and labels here are what Qualtrics will show.

Afterwards: the file `E2E_test_<date>.qsf` is in Downloads, the preview
shows a 3 × 4 grid with "Your House" in the middle of row 2 and five
category buttons, and nothing in the browser console mentions an error.

## Part B: check the file before importing it

Run the validator on the download and give it the design, so it compares the
file with what was built:

```bash
node scripts/check-qsf.mjs ~/Downloads/E2E_test_2026-11-01.qsf --questions 1 --rows 3 --cols 4 --categories "Family, Friends, Coworkers, Neighbors, Mom's friends" --mode paint --experimental no --fields GridAssignments --name "E2E test 2026-11-01"
```

It checks the parts of the file Qualtrics relies on (survey entry, the
eleven structural elements, blocks, Survey Flow, the question type), that the
attached JavaScript parses and starts with the MIT notice, that every
embedded-data field the script writes is declared in the Survey Flow, and
that the grid in the file is the grid that was designed. Exit code 0 means
every check passed. For a multi-grid export (My Surveys → Make
multi-question survey) pass `--questions N` and use `--q N` to point the
design checks at one grid.

## Part C: import into Qualtrics

1. In Qualtrics, go to **Projects** and click **Create a new project**.
2. Choose **Survey**, then **Get started**.
3. Name the project, choose **Import a QSF file**, pick the downloaded file
   and click **Create project**.

Afterwards: the survey builder opens with one block holding one question.
The question text is the question text from the design, the question shows
the **JS** marker that means JavaScript is attached, and **Survey flow**
(left toolbar) starts with an **Embedded Data** element that declares
`GridAssignments` before the block. If Qualtrics rejects the file, record the
exact message in the findings log; the validator's output tells you whether
the file was already wrong before Qualtrics saw it.

## Part D: preview in Qualtrics

1. Click **Preview** at the top right of the builder and preview the survey.
2. Check the desktop view first. The grid must look like the respondent
   preview in GRIDDY: 3 × 4, "Your House" in the centre cell, five category
   buttons, the design's fonts and colours.
3. Pick **Family** and click two cells; pick **Mom's friends** and click one
   cell; click one of the painted cells again to clear it. Each click must
   change exactly that cell.
4. Open the browser console (F12). Nothing from the grid script should be
   logged as an error.
5. Switch the preview to the mobile view and check that the grid still fits
   and cells can still be painted.
6. Click the grid's own **Next** button (the red one under the grid), then
   finish the survey.

Record anything that differs from the GRIDDY preview, however small.

## Part E: check the outputs

1. In the Qualtrics project, open **Data & Analysis**. Preview responses are
   recorded; the table can take a minute to show a new one, so reload it.
   Add the `GridAssignments` column with **Column chooser → Embedded Data**.
2. Read the `GridAssignments` value for the response. It must be a
   JSON object whose keys are the painted cells in `r{row}-c{col}` form and
   whose values are the category names exactly as typed, for example
   `{"r1-c1":"Family","r1-c2":"Family","r3-c4":"Mom's friends"}`. A cell
   that was painted and then cleared must be absent.
3. Export the data to CSV once and confirm the column survives the export
   unchanged.

For the experimental mode the fields are `GridPrefills` (what the respondent
was shown) and `GridResponses` (what they answered); check both.

## Variations

Run the one that matches what changed:

- **Dropdown per cell** and **Drag and drop**: same design, different input
  method; the output must be identical in form.
- **Experiment**: turn on **04 Add an experiment**, pre-fill a few cells,
  add response labels `Like, Dislike`; check `GridPrefills` and
  `GridResponses`.
- **Barriers**: add a barrier type and block two adjacent cells; they must
  be non-interactive in Qualtrics and drawn as one shape.
- **Images**: give a category an uploaded image. The validator reports the
  size of embedded images; note how Qualtrics behaves if the question
  script grows past a few hundred kilobytes.
- **Multi-question survey**: save two designs, go to **My surveys → Make
  multi-question survey**, export one `.qsf`, and check that each grid is on
  its own page with its own field.
- **Raw JavaScript**: in the export dialog open **Advanced: view raw
  JavaScript**, copy it, and paste it into a Text/Graphic question's
  JavaScript in Qualtrics by hand; also declare `GridAssignments` in the
  Survey Flow yourself.

## Running it with Claude

In a Claude Code session with Claude in Chrome connected and Chrome signed
in to Qualtrics (the UNC brand lives at unc.pdx1.qualtrics.com), ask for:
"Run docs/testing-in-qualtrics.md end to end with the standard design, run
the validator on the download, and add a row to the findings log." Claude
drives the GRIDDY app and Qualtrics in Chrome, runs `scripts/check-qsf.mjs`
locally, and reports what differed. Learned on the first runs:

- Click **Download .qsf** by screen coordinates, not by element reference;
  a reference click does not start the download in Chrome.
- Chrome's file-upload tool can only read files inside the session's own
  folder, so copy the download there before Part C.
- Preview responses appear in Data & Analysis about a minute after the
  survey ends. Reload the page, then add the embedded-data columns with
  **Column chooser → Embedded Data**.
- Qualtrics projects created by test runs are named `E2E test <date>` or
  `E2E <variation> <date>`; delete them when the run is over.

## Open defects

Found by this process and not yet fixed. Remove an entry when its fix is on
`main` and a re-run confirms it.

1. **On a phone, part of the grid is off-screen with no cue, and nothing
   warns about empty cells.** The grid keeps the size the researcher
   designed on every screen. That is a design decision: cells, fonts and
   pictures are never shrunk to fit a screen. So on a phone a 550 px grid
   meets about 340 px of question area. A recheck showed that Qualtrics'
   question box already scrolls sideways (`.QuestionOuter` has
   `overflow-x: auto`), so nothing is lost. But nothing tells respondents
   that more of the grid is there, phones hide scrollbars until you scroll,
   and Next submits whatever was filled. Fix: scroll the grid inside its own
   frame with a hint and arrows at the edges, and by default remind
   respondents about empty cells when they press Next, including how many
   are off-screen, with options to allow empty cells or require every cell.
   Do not fix this by shrinking the grid. Found by run 1 and reframed after
   the recheck.
2. **Reactions can be placed on empty cells in experimental mode.** The
   reaction handlers only skip the centre cell and blocked cells
   (`src/lib/qualtricsExport.ts` near lines 1101, 1130 and 493), so a
   respondent can react to a cell that shows "—", and `GridResponses` then
   holds keys that `GridPrefills` does not. The editor says reactions go on
   pre-filled cells. Fix: return early when `prefills[cellKey]` is empty, in
   all three input modes. Found by run 2.
3. **The export dialog does not close on Escape**, only on its Close button
   (minor). Found by run 1.
4. **"Block cells" stays on after a category is picked.** In the design
   preview of an experiment, picking a category chip while blocking cells
   leaves blocking on, so the next clicks block cells instead of pre-filling
   them. The researcher has to notice and press "Done blocking". Found by
   run 2.

## Findings log

| Date | Parts run | Result | Notes |
| --- | --- | --- | --- |
| 2026-11-01 | A to E, standard design | Pass, 1 defect | Built, saved and exported in the live app; validator 25 checks clean. Imported into Qualtrics (project `E2E test 2026-11-01`, survey SV_bK09zSoXw1K73LM) with the JS marker and the Survey Flow field in place. Desktop preview matched GRIDDY's preview; painting, clearing and the inert centre cell behaved; no console errors; the grid's Next button finished the survey. Recorded `GridAssignments` was exactly `{"r1-c1":"Family","r3-c4":"Mom's friends"}`. Mobile view cut off columns 3 and 4 (defect 1). CSV export not tried. |
| 2026-11-01 | D, phone view of the standard design again | Recheck | The grid kept its designed 550 px width. Qualtrics' `.QuestionOuter` box is 339 px wide with `overflow-x: auto` and a scroll width of 565 px, so the right-hand columns can be reached by scrolling sideways, but nothing shows that they exist. Defect 1 rewritten accordingly. |
| 2026-11-01 | A to E, experiment variation (fixed prefills on two cells, one barrier, default reaction labels) | Pass, 1 defect | Validator 24 checks clean. Imported as `E2E experimental 2026-11-01` (SV_5o4hWngBmygOPb0); Survey Flow declared both fields. Preview (on Qualtrics' newer "jfe6" preview engine) showed the prefills, the "—" placeholders and the blocked cell; the blocked cell ignored clicks. Recorded `GridPrefills` `{"r1-c1":"Family","r1-c2":"Friends"}` and `GridResponses` `{"r1-c1":"Agree","r1-c2":"Disagree","r1-c3":"Disagree"}`: the last key is defect 2. |
