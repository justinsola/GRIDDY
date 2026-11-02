# Testing GRIDDY end to end in Qualtrics

This is the manual test process for the whole path a researcher takes:
build a design in the live app, export it, import it into Qualtrics, preview
it there, and check that the answers come out right. Run it before a release,
after any change to `src/lib/qualtricsExport.ts` or
`src/lib/respondentTexts.ts`, and whenever Qualtrics changes something on its
side.

The process is written so that a person or a Claude session driving a browser
can run it. Each part lists the steps, what must be true afterwards, and what
to record. Findings go in the log at the bottom.

## What you need

- A browser signed in to the Qualtrics account you test with. A Claude
  session uses **Claude in Chrome** for this, because it needs the signed-in
  session; the built-in browser pane is not signed in and cannot sign in.
- Node 22 or newer, for the `.qsf` validator (`scripts/check-qsf.mjs`, no
  dependencies).
- About half an hour: Part D runs in both of Qualtrics' survey-taking
  experiences.

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
   few cells. The grid in this tab is drawn by the real exported script at
   full size (**View: Desktop**), so the grid's layout and labels are what
   Qualtrics will show; the Qualtrics theme around it can differ. Cells
   filled in either preview are a test and are not saved.

Afterwards: the file `E2E_test_<date>.qsf` is in Downloads, the preview
shows a 3 × 4 grid with "Your House" in the middle of row 2 and five
category buttons, and nothing in the browser console mentions an error.

## Part B: check the file before importing it

Run the validator on the download and give it the design, so it compares the
file with what was built:

```bash
node scripts/check-qsf.mjs ~/Downloads/E2E_test_2026-11-01.qsf --questions 1 --rows 3 --cols 4 --categories "Family, Friends, Coworkers, Neighbors, Mom's friends" --mode paint --experimental no --fields __js_GridAssignments --name "E2E test 2026-11-01"
```

It checks the parts of the file Qualtrics relies on (survey entry, the
eleven structural elements, blocks, Survey Flow, the question type), that the
attached JavaScript parses and starts with the MIT notice, that the script
saves its answers with `setJSEmbeddedData`, that every field it saves is
declared in the Survey Flow under its `__js_` name, and that the grid in the
file is the grid that was designed. `--fields` takes the declared names, as
Qualtrics records them. Exit code 0 means every check passed (25 checks for
the standard design). A `.qsf` from an older GRIDDY version fails with
"export the survey again". For a multi-grid export (My Surveys → Make
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
`__js_GridAssignments` before the block. The imported survey uses Qualtrics'
older layout; Part D step 8 switches it to the new survey-taking experience.
If Qualtrics rejects the file, record the exact message in the findings log;
the validator's output tells you whether the file was already wrong before
Qualtrics saw it.

GRIDDY gives each grid a page of its own. A researcher who adds questions
should keep the grid as the last question on its page and put follow-up
questions above it or on the next page: unless the grid allows empty cells,
its own Next, under the grid, replaces Qualtrics' Next for the whole page.

Compare the buttons you clicked with the steps in GRIDDY's export dialog, the
notice on the multi-question page and the README. Qualtrics renames buttons
from time to time; when they differ, update all three.

## Part D: preview in Qualtrics

Run steps 1 to 7 twice: first in the older layout the imported survey starts
on, then in Qualtrics' new survey-taking experience (step 8). Each run
records its own response for Part E.

1. Click **Preview** at the top right of the builder and preview the survey.
2. Check the desktop view first. The grid must look like the respondent
   preview in GRIDDY (**View: Desktop**): 3 × 4, "Your House" in the centre
   cell, five category buttons, the design's fonts and colours.
3. Pick **Family** and click two cells; pick **Mom's friends** and click one
   cell; click one of the painted cells again to clear it. Each click must
   change exactly that cell.
4. Open the browser console (F12). Nothing from the grid script should be
   logged as an error. Nothing should say "deprecated, please use
   setJSEmbeddedData" either: that message comes from a script made by an
   older GRIDDY, which records nothing in the new survey-taking experience.
5. Switch the preview to the mobile view. The grid must keep its designed
   size: cells, text and pictures the same as on desktop, never shrunk to
   fit. A hint ("Part of this grid is out of view. Scroll sideways to see all
   of it.") and an arrow at the right edge must appear. The arrow scrolls
   the grid, and a left arrow appears once it has scrolled. GRIDDY's
   Respondent preview with **View: Phone** (a frame 375 px wide) must show
   the same hint and arrows; compare the two.
6. Press the grid's own **Next** button (the red one under the grid) with
   cells still empty. With the default setting (Remind), a reminder says how
   many cells are empty and how many of them are off-screen, the empty cells
   get an orange outline, and the edge arrows show how many empty cells lie
   beyond them. **Show me** scrolls to the first empty cell that is out of
   view and moves the keyboard focus to it; **Continue anyway** moves on.
   Qualtrics' own Next button must not be on the page.
7. Finish the survey.
8. Switch to the new survey-taking experience and run steps 1 to 7 again.
   In the builder, open **Look and feel**; Qualtrics offers the new
   survey-taking experience with **Get started**. Click it, then **Apply**,
   and preview again. The preview's address names an engine (in our runs
   `jfe1`, `jfe5`, `jfe6` and `jfe7` each turned up, `jfe1` and `jfe6` for
   both experiences), so do not rely on the number: in the new experience the
   survey page has a `#next-button` element inside `#navigation`, which the
   older layouts do not have. The grid must look and work the same in both.
9. **Words shown to respondents.** In GRIDDY, open **03 How respondents
   answer → Words shown to respondents** and change a few texts, for example
   **Before the label buttons** to `Colocando:`, **Next button** to
   `Siguiente` and **How many: 2 or more** to `Quedan {n} celdas vacías.`
   Respondent preview must show them straight away; press `Siguiente` there
   with cells empty to see the reminder. Then put the new script into
   Qualtrics (**Copy code** under **Advanced: view raw JavaScript** in the
   export dialog, pasted over the question's JavaScript) and preview again.
   The same words must appear, and every text left empty must still be
   GRIDDY's English.

Record anything that differs from the GRIDDY preview, however small.

## Part E: check the outputs

1. In the Qualtrics project, open **Data & Analysis**. Preview responses are
   recorded; the table can take a minute to show a new one, so reload it.
   Add the `__js_GridAssignments` column with **Column chooser → Embedded
   Data**. The chooser lists only the fields the Survey Flow declares: the
   plain `GridAssignments` that the script also saves in the older layout is
   not recorded.
2. Read the `__js_GridAssignments` value for each response, one from each
   experience. It must be a JSON object whose keys are the painted cells in
   `r{row}-c{col}` form and whose values are the category names exactly as
   typed, for example
   `{"r1-c1":"Family","r1-c2":"Family","r3-c4":"Mom's friends"}`. A cell
   that was painted and then cleared must be absent.
3. Export the data to CSV once and confirm the column survives the export
   unchanged.

For the experimental mode the fields are `__js_GridPrefills` (what the
respondent was shown) and `__js_GridResponses` (what they answered); check
both. A grid that was shown but left untouched records `{}`, and pre-fills
are recorded as soon as the grid is shown, whether or not the respondent
reacts.

## Variations

Run the one that matches what changed:

- **Dropdown per cell** and **Drag and drop**: same design, different input
  method; the output must be identical in form. On a phone, drag with a
  finger; dragging to the grid's edge scrolls it.
- **Empty cells**: set **If cells are left empty** to **Allow** (the grid
  shows no Next of its own and Qualtrics' Next stays) and to **Require**
  (only Show me is offered until every cell is filled).
- **Back button**: turn Back on in Qualtrics' **Survey options**, answer the
  grid, go to the next page, come back and go forward again. The grid's
  answers, its pre-fills (even when shuffled or weighted) and its reactions
  must come back unchanged, in both experiences (the new one reads them back
  with `getJSEmbeddedData`).
- **Keyboard and screen reader**: Tab to a cell and press Enter; in drag and
  drop, press Enter on a chip to pick it up, then Enter on a cell to place
  it, and Enter on a filled cell's × clears it. With a screen reader on
  (NVDA, VoiceOver or TalkBack), activate a chip and then a cell; the label
  must be placed. A screen reader should read each cell as "Row 1, column
  2: Family", and read the reminder once each time Next is pressed. A mouse
  click on a chip does nothing; it has to be dragged.
- **Display logic on the grid's page**: put a Yes/No question above the
  grid on the same page and give the grid display logic "show if Yes" with
  **In Page** ticked. Before answering, and with No, Qualtrics' Next must be
  there and nothing is recorded for the grid; with Yes, the grid appears
  and its own Next replaces Qualtrics'.
- **Two grids on one page**: move a second grid question into the first
  one's block (give it its own field name ending). Only the lower grid
  shows a Next, and it checks both grids; each grid shows its own reminder.
- **A page without a grid after the grid**: add a plain question on the
  next page. Qualtrics' Next must be there.
- **Field name ending**: in the export dialog, type an ending such as `Q2`.
  The listed fields and the `.qsf`'s Survey Flow must use
  `__js_GridAssignments_Q2` (or `__js_GridPrefills_Q2` and
  `__js_GridResponses_Q2`), and the copied script must save
  `GridAssignments_Q2`, which Qualtrics records with the `__js_`.
- **Experiment**: turn on **04 Add an experiment**, pre-fill a few cells,
  add response labels `Like, Dislike`; check `__js_GridPrefills` and
  `__js_GridResponses`. In the design preview, clicks change the pre-fills
  (the line above the grid says so), and **Clear pre-fills** asks before
  removing them.
- **Barriers**: add a barrier type and block two adjacent cells; they must
  be non-interactive in Qualtrics and drawn as one shape.
- **Images**: give a category an uploaded image. The validator reports the
  size of embedded images; note how Qualtrics behaves if the question
  script grows past a few hundred kilobytes.
- **Multi-question survey**: save two designs, go to **My surveys → Make
  multi-question survey**, export one `.qsf`, and check that each grid is on
  its own page with its own `__js_` field, as the page lists it ("Saved in
  Qualtrics as …").
- **Another language**: reword every text under **Words shown to
  respondents** (for example a full Spanish set). Check the reminder with 1
  and with several empty cells, with some of them off-screen, with Require,
  and with a screen reader. Also try Arabic or Hebrew texts: their
  punctuation must sit at the correct end, because GRIDDY's text elements
  have `dir="auto"`.
- **Raw JavaScript**: in the export dialog open **Advanced: view raw
  JavaScript**, copy it, and paste it into a Text/Graphic question's
  JavaScript in Qualtrics by hand; also declare the listed field in the
  Survey Flow yourself, under its `__js_` name (`__js_GridAssignments`, or
  `__js_GridAssignments_<ending>` with a field name ending). Try it in a
  survey created in Qualtrics, which uses the new survey-taking experience:
  there a Survey Flow that declares only `GridAssignments` records nothing.

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
- In the new survey-taking experience the page has no jQuery, and
  `Qualtrics.SurveyEngine.setEmbeddedData` and `getEmbeddedData` only log
  "deprecated, please use setJSEmbeddedData". To probe what a page records,
  use `setJSEmbeddedData` with a field declared under its `__js_` name.
- Qualtrics projects created by test runs are named `E2E test <date>` or
  `E2E <variation> <date>`. The account owner deletes them once a round of
  runs is over.

## Open questions

Decided on 2 November 2026: the eight questions of 1 November, and one more
about the previews.

1. **Saving:** Save asks "Replace, or save as a new survey?" when the survey
   was renamed since it was opened or saved, or changed since (in another
   tab or window, or by importing a backup). The multi-question page's "Save the editor's changes" asks
   too. My surveys has Duplicate. Done.
2. **Reaction labels:** Layer mode is removed for response labels and kept
   for categories. The picture hint says what respondents see. Done.
3. **Design preview clicks:** a line above the design preview says what a
   click does in the current mode. In an experiment with Fixed or Shuffle
   pre-fills, Clear Cells reads "Clear pre-fills" and asks first. Done.
4. **The unused multi-step script** is deleted. Done.
5. **The grid's Next stays under the grid.** Keep the grid as the last
   question on its page and put follow-up questions above it or on the next
   page. The `.qsf` already gives each grid its own page.
6. **Words shown to respondents:** each grid can reword every text GRIDDY
   shows respondents (section 03). For a survey in several languages, use
   one grid per language, shown with display logic on `Q_Language`. Done.
7. **Question wording:** GRIDDY's question text still wins when it has
   visible characters; changing that was judged too risky. Text made only of
   spaces now counts as empty, and a hint under the question box says how to
   use the wording written in Qualtrics instead. Done.
8. **Google Fonts:** kept. The maintainer is not concerned.
9. **Previews** show the grid at 100% unless the researcher picks another
   view: Fit, or Phone in the respondent preview. Done.

Still open:

- **Surveys translated with Qualtrics' Translate tool:** choosing a grid's
  texts at run time from `Q_Language`. Today: one grid per language, shown
  with display logic.
- **Piped text that contains a quote:** question text and labels typed in
  GRIDDY are embedded in the script as they are, and Qualtrics fills in
  piped text such as `${e://Field/Name}` inside them. A piped value that
  contains a double quote can break the script. This was already so before
  November. GRIDDY's own respondent texts are escaped and never piped.

## Fixed in November 2026

Found by these runs or by code review. Re-run the matching check when the
code around it changes.

Fixed in PR 17 (1 November):

- **Phones:** the grid keeps its designed size and scrolls sideways inside
  its own frame, with a hint and edge arrows (Part D step 5).
- **Empty cells:** a reminder by default, with Allow and Require options;
  Qualtrics' Next is hidden while the check is on (Part D step 6), and only
  while the grid is on screen: display logic that hides the grid gives
  Qualtrics' Next back, several grids on one page share one Next that
  checks them all, and leaving the page gives Qualtrics' Next back. With
  Allow, or a grid with nothing to fill, only Qualtrics' Next is shown.
- **Recorded data:** answers are recorded as soon as the grid is shown, and
  restored on Back or resume with the same pre-fills (Back button
  variation); pre-fills never land on the centre, a barrier or a cell
  outside the grid; reactions only on pre-filled cells; dropped text that
  is not a label is ignored; a switched-off experiment is not shipped; a
  look-only grid records nothing; a grid neither shows nor overwrites
  answers another question saved under the same field names, and a field
  name ending in the export dialog keeps two grids' fields apart.
- **Input:** drag and drop works with a finger, from the keyboard and with
  a screen reader; a finger resting at an edge keeps the grid scrolling;
  Enter on a cell's × clears it; every answerable cell is a focusable,
  described button; the reminder is read out once per press of Next, and
  Show me focuses the first empty cell out of view; dropdowns are named and
  keep focus after a choice; larger touch targets; in right-to-left surveys
  column 1 stays on the left.
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
  block-cells mode; Rows and Columns take only whole numbers from 1 to 10;
  label names saved with spaces at either end are repaired.

Fixed on 2 November, with the decisions above:

- **Recording in the new survey-taking experience:** the script saves with
  `setJSEmbeddedData`, which both experiences record as `__js_` and the
  field name, and also with `setEmbeddedData` where that still works. The
  `.qsf`, the export dialog and the multi-question page use the `__js_`
  names; Back and resume read them back. A save that fails no longer stops
  the grid, its reminder or its Next (Part D step 8, Part E).
- **Question text** made only of spaces counts as empty, so respondents see
  the wording written in Qualtrics.
- **Saving:** Save asks before replacing a renamed survey or one changed
  since (in another tab or window, or by importing a backup); My surveys has Duplicate; importing a backup
  tells surveys apart by id, so a copy is no longer skipped as a duplicate.
- **Previews:** both show the grid at full size, with Phone and Fit views;
  the design preview says what a click does, and Clear pre-fills asks
  first.
- **Labels:** reactions no longer offer Layer mode, which did nothing, and
  each chip editor's Layer mode radios form a group of their own.
- **Words shown to respondents** can be reworded for each grid (Part D
  step 9), and GRIDDY's own text elements have `dir="auto"`, so their
  punctuation sits at the correct end in right-to-left surveys.
- **Code:** the unused multi-step script is deleted, and `check-qsf.mjs`
  checks the `__js_` names and flags `.qsf` files from older GRIDDY
  versions.

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
| 2026-11-01 | Weighted experiment in drag-and-drop mode, with a joined barrier, a background image and a category image in Front layer mode | Pass | `E2E fix weighted 2026-11-01` (SV_9AAyTfMVm7P2ocu); Qualtrics accepted a 250 KB question script with two embedded images. Weighted pre-fills filled all 13 open cells and were recorded on display; the two barrier cells drew as one shape; the background showed through. A simulated finger drag placed "Agree" and the keyboard (Enter on a chip, then on a cell) placed "Disagree"; screen-reader labels read "Row 1, column 1: Friends, reaction Agree"; the reminder counted the 11 cells still without a reaction. |
| 2026-11-01 | Page check after the third review: in-page display logic, two grids on one page, a page without a grid, a copy of a grid saving to the same field, Back on | Pass, 1 defect found and fixed | `E2E page check 2026-11-01` (SV_aa8Ssj8Wm5rqafs), jfe6 preview. After import the display logic's **In Page** box was ticked but took effect only once the logic was saved in the builder. While the grid was hidden, Qualtrics' Next was on the page and nothing was recorded; Yes showed the grid, recorded `{}` and put the grid's Next in place of Qualtrics'; No gave Qualtrics' Next back. On the page with two grids only the lower grid had a Next; pressing it showed both grids' reminders, and Continue anyway on the Remind grid stayed on the page while the Require grid had empty cells. A mouse click on a drag-and-drop chip did nothing; Space picked it up, Enter on a cell placed it, and Space on the cell's × cleared it without placing the held label. The page without a grid had Qualtrics' Next and Back. The copy of grid A opened empty, and Back restored both earlier pages as answered. Defect: pressing the untouched copy's Next wrote its empty answer over grid A's, so `GridAssignments_A` was recorded as `{}`; fixed so that on Next a grid records only fields it owns. `GridAssignments_B` recorded all eight cells and `GridAssignments_C` `{}`. |
| 2026-11-01 | Copy check after that fix | Pass | `E2E copy check 2026-11-01` (SV_ewVoTsKYCAbjlC6), jfe preview. The copy of grid A opened empty, and Continue anyway on it left `GridAssignments_A` as `{"r1-c1":"Family"}`. |
| 2026-11-01 | New survey-taking experience check on `main` | Defect found, fixed on the 2 November branch | `E2E new experience 2026-11-01` (SV_51kMYX4GBU1wMLQ). `main`'s script recorded `GridAssignments` in the older layout (jfe preview). After **Look and feel → Get started → Apply** the grid looked and worked the same (reminder, Continue anyway), but the response recorded nothing: `setEmbeddedData` and `getEmbeddedData` are stubs there that log "deprecated, please use setJSEmbeddedData". Probe fields showed that `setJSEmbeddedData` with a declared `__js_` field records in both experiences. The page has `#next-button` inside `#navigation`, and no jQuery. |
| 2026-11-02 | Fix branch in both experiences: three grids on three pages, Back on | Pass | `E2E fix new exp 2026-11-02` (SV_0lcDvB3bTweMQ50). Grid A plain; grid B with only spaces in GRIDDY's question text and "Qualtrics wording for grid B" typed in the builder; grid C 10 × 10 with long labels (a 3,621-character answer). Run in the older layout (jfe5) and again after switching to the new experience (jfe7). Both runs: the reminder and Continue anyway worked, Back restored grid A as it was left (read with `getJSEmbeddedData`), grid B showed the Qualtrics wording, and `__js_GridAssignments_A`, `_B` and `_C` recorded every answer, including all 100 cells of grid C. An empty block added by mistake in the builder was skipped. The Column chooser listed only the declared `__js_` fields (the plain names the script also writes in the older layout are not recorded). |
| 2026-11-02 | Experiment in the new experience | Pass | `E2E fix new exp experiment 2026-11-02` (SV_bdQpj829TVAzp42), new experience (jfe1). The pre-fills were recorded when the grid appeared, and the reaction was recorded: `__js_GridPrefills` `{"r1-c1":"Family","r2-c3":"Friends"}`, `__js_GridResponses` `{"r1-c1":"Agree"}`. |
| 2026-11-02 | Final branch: Spanish respondent texts in both experiences | Pass | `E2E final texts 2026-11-02` (SV_cNED6I9CL3NIIsu). One grid with field name ending `ES` and eleven texts reworded in Spanish under Words shown to respondents, one of them with quotes and a backslash (`Siguiente "→" \`) and one with a piped-text code (`Colocando ${e://Field/Probe}:`). Run in the older layout (jfe1 preview) and again in the new experience (jfe6 preview). Both runs: every text appeared as typed, the piped code stayed literal (Qualtrics did not fill it in), the reminder read "Quedan 5 celdas vacías. Están marcadas en naranja. Puede completarlas ahora o continuar de todos modos." with Mostrar and Continuar de todos modos, and Data & Analysis recorded both answers under `__js_GridAssignments_ES` (`{"r1-c1":"Familia"}` and `{"r1-c1":"Amigos","r1-c2":"Amigos"}`). |
