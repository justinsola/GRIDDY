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
5. Switch the preview to the mobile view. The grid must keep its designed
   size: cells, text and pictures the same as on desktop, never shrunk to
   fit. A hint ("This grid is wider than your screen. Scroll sideways to see
   all of it.") and an arrow at the right edge must appear. The arrow scrolls
   the grid, and a left arrow appears once it has scrolled.
6. Press the grid's own **Next** button (the red one under the grid) with
   cells still empty. With the default setting (Remind), a reminder says how
   many cells are empty and how many of them are off-screen, the empty cells
   get an orange outline, and the edge arrows show how many empty cells lie
   beyond them. **Show me** scrolls to the first empty cell; **Continue
   anyway** moves on. Qualtrics' own Next button must not be on the page.
7. Finish the survey.

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
was shown) and `GridResponses` (what they answered); check both. A grid that
was shown but left untouched records `{}`, and pre-fills are recorded as soon
as the grid is shown, whether or not the respondent reacts.

## Variations

Run the one that matches what changed:

- **Dropdown per cell** and **Drag and drop**: same design, different input
  method; the output must be identical in form. On a phone, drag with a
  finger; dragging to the grid's edge scrolls it.
- **Empty cells**: set **If cells are left empty** to **Allow** (Next moves
  straight on) and to **Require** (only Show me is offered until every cell
  is filled).
- **Back button**: turn Back on in Qualtrics' **Survey options**, answer the
  grid, go to the next page, come back and go forward again. The grid's
  answers, its pre-fills (even when shuffled or weighted) and its reactions
  must come back unchanged.
- **Keyboard and screen reader**: Tab to a cell and press Enter; in drag and
  drop, press Enter on a chip to pick it up, then Enter on a cell to place
  it. A screen reader should read each cell as "Row 1, column 2: Family".
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
- The survey in Qualtrics' preview sits in an iframe that the accessibility
  tree does not show. Reach it with JavaScript from the top page
  (`iframe.contentDocument`) to set a dropdown, or to simulate a finger
  drag with `PointerEvent`s of `pointerType: "touch"`.
- The desktop and phone views of the preview are separate renders of one
  response: answers made in one appear in the other only after a page
  change.
- A download can sit in Downloads as `<uuid>.tmp` for a few minutes before
  Chrome gives it its name; copying the `.tmp` file works.
- To test a branch before it is merged, run its dev server and export from
  there, or build the `.qsf` with a short script that calls
  `buildQualtricsQsf` (the branch's own code).
- Qualtrics projects created by test runs are named `E2E test <date>` or
  `E2E <variation> <date>`; delete them when the run is over.

## Open questions

Behaviour the maintainer should decide. None of these touches recorded
responses; the first can replace a saved survey design.

1. **Save always writes to the survey that was opened.** Renaming a survey
   to make a variant and saving replaces the original, and two tabs editing
   one survey overwrite each other. Option: when the name changed, or the
   survey was saved elsewhere since it was opened, ask "Replace, or save as
   a new survey?", and add Duplicate to My surveys.
2. **With "Allow" empty cells, Qualtrics' own Next stays on the page** next
   to the grid's Next (with Remind or Require it is hidden). Option: always
   hide it on grid pages.
3. **Separately exported grids share field names.** Each single-grid export
   saves to `GridAssignments`, so two of them put into one Qualtrics survey
   overwrite each other's answers. The export dialog now warns and points to
   the multi-question page. Option: let the dialog set the field name.
4. **Response labels offer Layer mode, which does nothing.** Reaction images
   always lie over the cell. Option: remove the control for labels, or give
   it the same meaning as for categories.
5. **The design preview's clicks are only a test.** The tour now says so.
   Option: a one-line note above the design grid as well.
6. **An unused multi-step script** (`buildQualtricsMultiQuestionSnippet` in
   `src/lib/qualtricsExport.ts`) is not called by the app and has none of
   the fixes below. Option: delete it.

## Fixed in November 2026

Found by these runs or by code review, fixed in PR 17. Re-run the matching
check when the code around it changes.

- **Phones:** the grid keeps its designed size and scrolls sideways inside
  its own frame, with a hint and edge arrows (Part D step 5).
- **Empty cells:** a reminder by default, with Allow and Require options;
  Qualtrics' Next is hidden while the check is on (Part D step 6).
- **Recorded data:** answers are recorded as soon as the grid is shown, and
  restored on Back or resume with the same pre-fills (Back button
  variation); pre-fills never land on the centre, a barrier or a cell
  outside the grid; reactions only on pre-filled cells; dropped text that
  is not a label is ignored; a switched-off experiment is not shipped.
- **Input:** drag and drop works with a finger and from the keyboard;
  every answerable cell is a focusable, described button; dropdowns are
  named and keep focus after a choice; larger touch targets.
- **Looks as designed:** dropdown cells show category images; Layer mode
  (Front, Behind) is honoured; a background image shows through empty
  cells; long labels wrap instead of being cut; buttons use the grid's
  font; reactions are dark text on a stronger tint; a barrier on the centre
  no longer hides it; barriers do not join cells outside the grid; a blank
  GRIDDY question keeps the wording written in Qualtrics; question text in
  the `.qsf` is escaped; image URLs with quotes work.
- **Editor:** New, Open and reload ask before discarding unsaved edits, and
  Delete asks first; renaming a label can no longer merge two labels or
  split one at a comma, and names are trimmed; importing a backup keeps the
  newer copy of each survey; a full browser storage is explained; the
  multi-question page shows each grid's real field names, catches two grids
  with the same name, and will not download while a grid has unsaved edits;
  the tour can be restarted after it is closed; SVG uploads stay sharp and
  transparent images stay transparent; background images keep enough
  resolution; the error page leads back; the export dialog closes on Escape
  and its steps match today's Qualtrics; picking a category leaves
  block-cells mode.

## Findings log

| Date | Parts run | Result | Notes |
| --- | --- | --- | --- |
| 2026-11-01 | A to E, standard design | Pass, 1 defect | Built, saved and exported in the live app; validator 25 checks clean. Imported into Qualtrics (project `E2E test 2026-11-01`, survey SV_bK09zSoXw1K73LM) with the JS marker and the Survey Flow field in place. Desktop preview matched GRIDDY's preview; painting, clearing and the inert centre cell behaved; no console errors; the grid's Next button finished the survey. Recorded `GridAssignments` was exactly `{"r1-c1":"Family","r3-c4":"Mom's friends"}`. Mobile view cut off columns 3 and 4 (defect 1). CSV export not tried. |
| 2026-11-01 | D, phone view of the standard design again | Recheck | The grid kept its designed 550 px width. Qualtrics' `.QuestionOuter` box is 339 px wide with `overflow-x: auto` and a scroll width of 565 px, so the right-hand columns can be reached by scrolling sideways, but nothing shows that they exist. Defect 1 rewritten accordingly. |
| 2026-11-01 | A to E, experiment variation (fixed prefills on two cells, one barrier, default reaction labels) | Pass, 1 defect | Validator 24 checks clean. Imported as `E2E experimental 2026-11-01` (SV_5o4hWngBmygOPb0); Survey Flow declared both fields. Preview (on Qualtrics' newer "jfe6" preview engine) showed the prefills, the "—" placeholders and the blocked cell; the blocked cell ignored clicks. Recorded `GridPrefills` `{"r1-c1":"Family","r1-c2":"Friends"}` and `GridResponses` `{"r1-c1":"Agree","r1-c2":"Disagree","r1-c3":"Disagree"}`: the last key is defect 2. |
| 2026-11-01 | A to E, standard design rebuilt on the fix branch (PR 17) | Pass | `E2E fix standard 2026-11-01` (SV_eyBlcA3TWcVxvJY). Desktop: Qualtrics' own Next hidden; Next with 11 empty cells showed the reminder and outlines, and the count fell as cells were filled. Phone view: hint and right arrow shown; the arrow scrolled to the last columns; Next said "10 cells are still empty, including 5 off-screen" with a badge of 5 on the left arrow; Show me scrolled back to the first empty cell. Recorded `{"r1-c1":"Family","r3-c4":"Mom's friends"}` after Continue anyway. |
| 2026-11-01 | A to E, experiment rebuilt on the fix branch | Pass | `E2E fix experimental 2026-11-01` (SV_efA0EANeNObOlpA). A click on an empty cell placed no reaction; Next said "1 pre-filled cell has no reaction yet". Recorded `GridPrefills` `{"r1-c1":"Family","r1-c2":"Friends"}` and `GridResponses` `{"r1-c1":"Disagree"}`. |
| 2026-11-01 | Multi-question survey built in the fix branch's editor: a dropdown grid with an uploaded image, then a paint grid set to Require | Pass, 2 defects found and fixed | `E2E multi 2026-11-01` (SV_0kf3KH11xtrV966). Dropdown cells showed no category image, and the multi-question page labelled the data field differently from the field actually saved; both fixed in PR 17. Require offered only Show me until every cell was filled. Both fields recorded correctly. |
| 2026-11-01 | Drag-and-drop variant, finger drag simulated with pointer events | Pass | `E2E fix dragdrop 2026-11-01` (SV_a4VERZxaeYlQiI6). The label dropped where the finger lifted; in the phone view, dragging to the edge scrolled the grid to its last column. |
| 2026-11-01 | Back button: a paint grid, then a shuffled experiment, with Back on | Pass | `E2E fix back 2026-11-01` (SV_6MrCpbskoTCaIZ0). After Back, page 1 showed its answers; going forward again, page 2 kept the same shuffle and its reaction. Recorded `GridAssignments_BackA` `{"r1-c1":"Family","r3-c4":"Mom's friends"}`, `GridPrefills_BackB` `{"r1-c1":"Friends","r1-c2":"Family","r2-c1":"Coworkers"}` and `GridResponses_BackB` `{"r1-c1":"Agree","r1-c2":"Neutral","r2-c1":"Disagree"}`. |
