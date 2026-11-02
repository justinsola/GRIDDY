import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditorProvider, useEditor } from "../EditorContext";
import { DESIGN_VIEW_STORAGE_KEY, RESPONDENT_VIEW_STORAGE_KEY } from "../lib/previewView";
import ConfigPanel from "./ConfigPanel";
import PreviewPanel from "./PreviewPanel";
import RespondentPreview from "./RespondentPreview";

const host = document.createElement("div");
document.body.appendChild(host);
let root = createRoot(host);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
let editor: ReturnType<typeof useEditor>;

function EditorSpy() {
  editor = useEditor();
  return null;
}

// The previews remember their view in this browser; start each test afresh.
beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  root = createRoot(host);
  vi.restoreAllMocks();
});

const renderPanel = () =>
  act(() => root.render(<EditorProvider><EditorSpy /><ConfigPanel /><PreviewPanel /></EditorProvider>));
const buttonByText = (text: string) =>
  Array.from(host.querySelectorAll("button")).find((button) => button.textContent === text);
const click = (text: string) => act(() => buttonByText(text)!.click());
const isPressed = (text: string) => buttonByText(text)!.getAttribute("aria-pressed") === "true";
/** A design-grid cell, found by its "r1·c1" tag. */
const cell = (tag: string) =>
  Array.from(host.querySelectorAll("span")).find((span) => span.textContent === tag)!.parentElement!;
/** The box the design grid's cells sit in. */
const designGrid = () => cell("r1·c1").parentElement!.parentElement!;
/** The muted line at the top of the design preview. */
const designNote = () => host.querySelector('section[aria-label="Grid preview"] p')!.textContent;
const prefills = () => editor.state.config.experimental!.fixedAssignments;
const startExperiment = (prefillMode: "fixed" | "shuffle" | "weighted") =>
  act(() => editor.dispatch({ type: "updateExperimental", patch: { enabled: true, prefillMode } }));

it("switches from coordinate-based design to the exported respondent renderer and back", () => {
  act(() => root.render(<EditorProvider><PreviewPanel /></EditorProvider>));
  expect(host.textContent).toContain("r1·c1");
  const respondentButton = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Respondent preview",
  )!;
  act(() => respondentButton.click());
  expect(respondentButton.getAttribute("aria-pressed")).toBe("true");
  expect(host.textContent).not.toContain("r1·c1");
  const frame = host.querySelector("iframe")!;
  expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
  expect(frame.srcdoc).toContain("Qualtrics.SurveyEngine.addOnReady");
  expect(host.textContent).not.toContain("Block cells");
  act(() => Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Design preview",
  )!.click());
  expect(host.querySelector("iframe")).toBeNull();
  expect(host.textContent).toContain("r1·c1");
});

it("keeps script-like survey text from escaping the preview bootstrap", () => {
  const snippet = 'var label = "</script><script>unexpected()</script>";';
  act(() =>
    root.render(<RespondentPreview snippet={snippet} gridWidth={550} view="desktop" onViewChange={() => {}} />),
  );
  const html = host.querySelector("iframe")!.srcdoc;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  expect(parsed.querySelectorAll("script")).toHaveLength(1);
  expect(() => new Function(parsed.querySelector("script")!.textContent!)).not.toThrow();
});

it("closes the export dialog with Escape", () => {
  act(() => root.render(<EditorProvider><PreviewPanel /></EditorProvider>));
  const exportButton = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Export to Qualtrics",
  )!;
  act(() => exportButton.click());
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});

it("leaves block-cells mode when the researcher picks a category to place", () => {
  act(() => root.render(<EditorProvider><ConfigPanel /><PreviewPanel /></EditorProvider>));
  const buttonByText = (text: string) =>
    Array.from(host.querySelectorAll("button")).find((button) => button.textContent === text)!;
  act(() => buttonByText("+ Add barrier").click());
  act(() => buttonByText("Block cells").click());
  expect(buttonByText("Done blocking")).toBeDefined();
  const familyChips = Array.from(host.querySelectorAll("button")).filter(
    (button) => button.textContent?.trim() === "Family",
  );
  act(() => familyChips[familyChips.length - 1].click());
  expect(Array.from(host.querySelectorAll("button")).some((b) => b.textContent === "Done blocking")).toBe(false);
  expect(buttonByText("Block cells")).toBeDefined();
});

/** The export dialog's list of result fields, and its manual-paste steps. */
const exportDialog = () => {
  const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
  return {
    dialog,
    resultFields: () => Array.from(dialog.querySelectorAll("ul code.font-bold")).map((c) => c.textContent),
    pasteSteps: () => dialog.querySelector("details p")!.textContent,
  };
};

it("lets the export dialog give this grid's fields their own ending", () => {
  act(() => root.render(<EditorProvider><PreviewPanel /></EditorProvider>));
  click("Export to Qualtrics");
  const { dialog, resultFields, pasteSteps } = exportDialog();
  expect(resultFields()).toEqual(["__js_GridAssignments"]);
  const input = dialog.querySelector<HTMLInputElement>('input[aria-label="Field name ending"]')!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(input, "Q2");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // Researchers see the names Qualtrics records; the script saves the plain one.
  expect(resultFields()).toEqual(["__js_GridAssignments_Q2"]);
  expect(pasteSteps()).toContain("Add an Embedded Data element to your Survey Flow with __js_GridAssignments_Q2,");
  expect(dialog.querySelector("textarea")!.value).toContain('saveField("GridAssignments_Q2"');
});

it("names an experiment's recorded fields and says where answers appear", () => {
  renderPanel();
  startExperiment("fixed");
  click("Export to Qualtrics");
  const { dialog, resultFields, pasteSteps } = exportDialog();
  expect(resultFields()).toEqual(["__js_GridPrefills", "__js_GridResponses"]);
  expect(pasteSteps()).toContain("with __js_GridPrefills and __js_GridResponses,");
  expect(dialog.textContent).toContain(
    "The grid works in Qualtrics' new survey-taking experience and in the older layouts.",
  );
  expect(dialog.textContent).toContain("Answers appear under Data & Analysis with the __js_ names listed above.");
  expect(dialog.textContent).toContain("add it with Column chooser → Embedded Data");
});

it("tells researchers to keep the grid last on its page in Qualtrics", () => {
  renderPanel();
  click("Export to Qualtrics");
  const steps = Array.from(exportDialog().dialog.querySelectorAll("ol > li")).map((step) => step.textContent);
  expect(steps[2]).toContain("click Create project.");
  expect(steps[3]).toBe(
    "If you add questions to the grid's page, keep the grid last and put follow-up questions above it or on the next page: unless empty cells are allowed, the grid's Next replaces Qualtrics' Next.",
  );
  expect(steps[4]).toContain("Publish");
});

/** A preview panel narrower than a new survey's 290 px grid and its borders,
 * and 80% as wide as the respondent preview's page for that grid. */
const NARROW_PANEL = 248;
/** The preview panel's width inside its padding on a window 1280 px wide or
 * wider. */
const WIDE_PANEL = 576;

it("draws the design grid at its designed size until Fit is chosen, and remembers the choice", () => {
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(WIDE_PANEL);
  renderPanel();
  expect(isPressed("100%")).toBe(true);
  // A new survey's 3 × 3 grid: cells of 90 × 90 px, 10 px apart.
  expect(designGrid().style.width).toBe("290px");
  expect(designGrid().style.height).toBe("290px");
  expect(designGrid().style.boxSizing).toBe("content-box");
  expect(host.textContent).not.toContain("Scaled to fit");

  click("Fit");
  expect(isPressed("Fit")).toBe(true);
  // Fit only shrinks: the frame, borders included, is never wider than at
  // 100%, so in this wide panel the grid stays at its designed size.
  expect(designGrid().style.width).toBe("100%");
  expect(designGrid().style.maxWidth).toBe("292px");
  expect(designGrid().style.aspectRatio).toBe("292 / 292");
  expect(designGrid().style.height).toBe("");
  expect(host.textContent).toContain("The whole grid fits at full size.");
  expect(host.textContent).not.toContain("Scaled to fit");
  expect(window.localStorage.getItem(DESIGN_VIEW_STORAGE_KEY)).toBe("fit");

  act(() => root.unmount());
  root = createRoot(host);
  renderPanel();
  expect(isPressed("Fit")).toBe(true);
  expect(designGrid().style.width).toBe("100%");
});

it("sizes both previews from the grid's cells, rows and columns", () => {
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(WIDE_PANEL);
  renderPanel();
  act(() => editor.dispatch({ type: "updateTuning", patch: { cellWidth: 150, cellHeight: 60 } }));
  act(() => editor.dispatch({ type: "updateLayout", patch: { cols: 4 } }));
  // 4 columns of 150 px and 3 rows of 60 px, 10 px apart.
  expect(designGrid().style.width).toBe("630px");
  expect(designGrid().style.height).toBe("200px");

  click("Fit");
  // Fit keeps the shape of the grid and its borders, never draws them wider
  // than at 100%, and scales them down to this narrower panel.
  expect(designGrid().style.aspectRatio).toBe("632 / 202");
  expect(designGrid().style.maxWidth).toBe("632px");
  expect(host.textContent).toContain("Scaled to fit this panel. Respondents see the grid at 630 × 200 px.");

  click("Respondent preview");
  // The grid, its borders and the page's padding.
  expect(host.querySelector("iframe")!.style.minWidth).toBe("650px");
});

it("keeps a survey saved before cell sizes at the size it had in both previews", () => {
  renderPanel();
  // The tuning every survey was saved with before November 2026.
  const oldTuning = {
    gridGap: 10,
    gridPadding: 0,
    labelFontSizeRem: 1,
    cellWidth: 100,
    cellHeight: 120,
    previewWidth: 550,
    previewHeight: 550,
  };
  act(() => editor.dispatch({ type: "setConfig", config: { ...editor.state.config, tuning: oldTuning } }));
  expect(designGrid().style.width).toBe("550px");
  expect(designGrid().style.height).toBe("550px");
  click("Respondent preview");
  expect(host.querySelector("iframe")!.style.minWidth).toBe("570px");
});

it("lets the researcher fill design cells in both views", () => {
  renderPanel();
  act(() => cell("r1·c1").click());
  expect(cell("r1·c1").textContent).toContain("Family");
  click("Fit");
  act(() => cell("r1·c2").click());
  expect(cell("r1·c2").textContent).toContain("Family");
  expect(cell("r1·c1").textContent).toContain("Family");
});

it("keeps blocking, dropdown and drag-and-drop cells working at full size", () => {
  renderPanel();
  expect(isPressed("100%")).toBe(true);

  click("+ Add barrier");
  click("Block cells");
  act(() => {
    cell("r1·c1").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    window.dispatchEvent(new MouseEvent("mouseup"));
  });
  expect(Object.keys(editor.state.config.layout.blockedCells)).toEqual(["r1-c1"]);
  click("Done blocking");

  act(() => editor.dispatch({ type: "updateSurvey", patch: { selectionMode: "dropdown" } }));
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="Choose label for row 1 column 2"]')!;
  act(() => {
    select.value = "Friends";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(cell("r1·c2").textContent).toContain("Friends");

  act(() => editor.dispatch({ type: "updateSurvey", patch: { selectionMode: "dragdrop" } }));
  act(() => {
    buttonByText("Coworkers")!.dispatchEvent(new Event("dragstart", { bubbles: true }));
  });
  act(() => {
    cell("r1·c3").dispatchEvent(new Event("drop", { bubbles: true }));
  });
  expect(cell("r1·c3").textContent).toContain("Coworkers");
});

it("says when the design grid is wider than the panel, and that Fit scales it down", () => {
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(NARROW_PANEL);
  renderPanel();
  expect(host.textContent).toContain("Wider than this panel. Scroll sideways, or choose Fit.");
  click("Fit");
  expect(host.textContent).not.toContain("Wider than this panel");
  expect(host.textContent).toContain("Scaled to fit this panel. Respondents see the grid at 290 × 290 px.");
  expect(host.textContent).not.toContain("The whole grid fits at full size.");
});

it("says what a click in the design preview does right now", () => {
  renderPanel();
  expect(designNote()).toBe("Cells you fill here are a test. Respondents start with an empty grid.");

  click("+ Add barrier");
  click("Block cells");
  expect(designNote()).toBe("Blocking changes the survey. Respondents cannot use blocked cells.");
  click("Done blocking");

  const changesPrefills =
    "Clicks here change the pre-fills every respondent sees. Try answering in Respondent preview.";
  startExperiment("fixed");
  expect(designNote()).toBe(changesPrefills);
  startExperiment("shuffle");
  expect(designNote()).toBe(changesPrefills);
  startExperiment("weighted");
  expect(designNote()).toBe("Sample preview — each respondent gets an independent draw.");
});

it("asks before Clear removes an experiment's pre-fills, but not before it empties a test fill", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  renderPanel();
  act(() => cell("r1·c1").click());
  click("Clear Cells");
  expect(cell("r1·c1").textContent).toBe("r1·c1");
  expect(confirm).not.toHaveBeenCalled();

  startExperiment("fixed");
  expect(buttonByText("Clear Cells")).toBeUndefined();
  // With nothing pre-filled there is nothing to ask about.
  click("Clear pre-fills");
  expect(confirm).not.toHaveBeenCalled();

  act(() => cell("r1·c1").click());
  click("Clear pre-fills");
  expect(confirm).toHaveBeenLastCalledWith("Remove 1 pre-fill from this survey?");
  act(() => cell("r1·c2").click());
  click("Clear pre-fills");
  expect(confirm).toHaveBeenLastCalledWith("Remove all 2 pre-fills from this survey?");
  expect(prefills()).toEqual({ "r1-c1": "Family", "r1-c2": "Family" });

  confirm.mockReturnValue(true);
  click("Clear pre-fills");
  expect(prefills()).toEqual({});
});

it("shows the respondent preview at full size, on a phone or zoomed to fit, and remembers the choice", () => {
  renderPanel();
  click("Respondent preview");
  const frame = () => host.querySelector("iframe")!;
  expect(isPressed("Desktop")).toBe(true);
  // Desktop: nothing zooms the page, and the frame is at least as wide as
  // the 290 px grid with its borders and the page's padding.
  expect(frame().srcdoc).not.toContain("zoom");
  expect(frame().style.transform).toBe("");
  expect(frame().style.width).toBe("100%");
  expect(frame().style.minWidth).toBe("310px");

  click("Phone");
  // Inside its borders the page is 308 px, and its padding leaves the
  // question the 292 px that Qualtrics' phone view leaves for the grid.
  expect(frame().style.width).toBe("308px");
  expect(frame().style.boxSizing).toBe("content-box");
  expect(frame().style.minWidth).toBe("");
  expect(frame().style.transform).toBe("");
  expect(host.textContent).toContain("Phone, as Qualtrics' phone view: 292 px for the grid");
  expect(buttonByText("Phone")!.title).toBe("Full size, as in Qualtrics' phone view: 292 px for the grid");
  expect(window.localStorage.getItem(RESPONDENT_VIEW_STORAGE_KEY)).toBe("phone");

  act(() => root.unmount());
  root = createRoot(host);
  renderPanel();
  click("Respondent preview");
  expect(isPressed("Phone")).toBe(true);
  expect(frame().style.width).toBe("308px");
});

it("gives the grid the same 292 px in the Phone view whatever its size", () => {
  renderPanel();
  act(() => editor.dispatch({ type: "updateLayout", patch: { cols: 4 } }));
  click("Respondent preview");
  const frame = host.querySelector("iframe")!;
  // Desktop makes room for the 390 px grid; Phone does not.
  expect(frame.style.minWidth).toBe("410px");
  click("Phone");
  expect(frame.style.width).toBe("308px");
});

it("zooms the respondent preview out when Fit is chosen, and says by how much", () => {
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(NARROW_PANEL);
  renderPanel();
  click("Respondent preview");
  const frame = host.querySelector("iframe")!;
  expect(host.textContent).toContain("Wider than this panel. Scroll sideways, or choose Fit.");

  click("Fit");
  expect(frame.style.width).toBe("310px");
  expect(frame.style.transform).toBe("scale(0.8)");
  expect(host.textContent).toContain("Shown at 80% so the whole grid fits. Respondents see it at full size.");
  expect(host.textContent).not.toContain("Wider than this panel");
});

/** What the respondent preview's page tells the editor: how tall it is. */
const reportPageHeight = (frame: HTMLIFrameElement, height: number) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "griddy-preview-height", height },
        source: frame.contentWindow,
      }),
    );
  });

it("sizes the respondent frame to its page in every view", () => {
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(NARROW_PANEL);
  renderPanel();
  click("Respondent preview");
  const frame = host.querySelector("iframe")!;
  const reportHeight = (height: number) => reportPageHeight(frame, height);

  reportHeight(600);
  expect(frame.style.height).toBe("616px");
  click("Phone");
  reportHeight(700);
  expect(frame.style.height).toBe("716px");
  click("Fit");
  reportHeight(800);
  expect(frame.style.height).toBe("816px");
  // The zoomed-out frame takes up only its shown height.
  expect(frame.parentElement!.style.height).toBe("653px");
});

it("lets the respondent frame grow as tall as the tallest grid's page", () => {
  renderPanel();
  click("Respondent preview");
  const frame = host.querySelector("iframe")!;
  // 10 rows of 600 px cells make a page more than 6000 px tall.
  reportPageHeight(frame, 6400);
  expect(frame.style.height).toBe("6416px");
  // The limit only stops a page that keeps growing.
  reportPageHeight(frame, 50000);
  expect(frame.style.height).toBe("8092px");
});

/**
 * Loads the respondent preview's page into its frame, as a browser does with
 * srcdoc (jsdom does not), and lays the grid's scroller out by the frame's
 * width, which jsdom does not do either: the page's padding takes 16 px of
 * the width inside the frame, and a page scrollbar its own width while there
 * is one. `relayout` then does what a browser does when that width changes:
 * it keeps the scroll position within the new room (and fires a scroll event
 * when that moves it), fires resize when the frame itself was resized, and
 * calls the ResizeObservers watching the scroller.
 */
function loadRespondentPage(frame: HTMLIFrameElement, panelWidth: number, scrollbar: number) {
  const win = frame.contentWindow as unknown as typeof globalThis;
  const observed: Array<{ callback: () => void; target: Element }> = [];
  class FakeResizeObserver {
    constructor(private callback: () => void) {}
    observe(target: Element) {
      observed.push({ callback: this.callback, target });
    }
    disconnect() {}
  }
  (win as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
  const page = { scrollbar };
  // Inside the frame: all of a content-box frame's width, or a border-box
  // frame's width less its borders.
  const pageWidth = () => {
    if (frame.style.boxSizing === "content-box") return parseFloat(frame.style.width);
    const width = frame.style.width.endsWith("px")
      ? parseFloat(frame.style.width)
      : Math.max(panelWidth, parseFloat(frame.style.minWidth));
    return width - 2;
  };
  const space = () => pageWidth() - 16 - page.scrollbar;
  const isScroller = (el: Element) => el.hasAttribute("data-griddy-scroller");
  // The grid and its 1 px borders.
  const gridWidth = (el: Element) => parseFloat((el.firstElementChild as HTMLElement).style.width) + 2;
  const room = (el: Element) => Math.max(0, gridWidth(el) - space());
  let left = 0;
  Object.defineProperties(win.HTMLElement.prototype, {
    clientWidth: {
      configurable: true,
      get(this: HTMLElement) {
        return isScroller(this) ? space() : 0;
      },
    },
    scrollWidth: {
      configurable: true,
      get(this: HTMLElement) {
        return isScroller(this) ? space() + room(this) : 0;
      },
    },
    scrollLeft: {
      configurable: true,
      get(this: HTMLElement) {
        return isScroller(this) ? left : 0;
      },
      set(this: HTMLElement, value: number) {
        if (isScroller(this)) left = Math.max(0, Math.min(Math.round(value), room(this)));
      },
    },
  });
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(frame.srcdoc);
  doc.close();
  const scroller = doc.querySelector<HTMLElement>("[data-griddy-scroller]")!;
  const relayout = (resized: boolean) => {
    const before = left;
    left = Math.min(left, room(scroller));
    if (resized) win.dispatchEvent(new win.Event("resize"));
    if (left !== before) scroller.dispatchEvent(new win.Event("scroll"));
    observed.filter((o) => isScroller(o.target)).forEach((o) => o.callback());
  };
  const arrows = () =>
    (["left", "right"] as const).map(
      (side) => doc.querySelector<HTMLElement>(`[data-griddy-edge="${side}"]`)!.style.display,
    );
  return { scroller, page, relayout, arrows };
}

it("starts a wide grid at its middle in the Phone view after the Desktop view", () => {
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(NARROW_PANEL);
  renderPanel();
  // 4 columns of 90 px: 390 px, wider than this panel and than the phone view.
  act(() => editor.dispatch({ type: "updateLayout", patch: { cols: 4 } }));
  click("Respondent preview");
  const frame = host.querySelector("iframe")!;
  // The page never shows a scrollbar of its own.
  expect(frame.srcdoc).toContain("html { scrollbar-width: none; } html::-webkit-scrollbar { display: none; }");

  // Desktop is exactly as wide as the grid needs. A scrollbar there for a
  // moment, as the page had before, makes the grid overflow by its width,
  // and the grid centres itself in that small room.
  const { scroller, page, relayout, arrows } = loadRespondentPage(frame, NARROW_PANEL, 15);
  expect(scroller.scrollLeft).toBe(8);
  page.scrollbar = 0;
  relayout(false);
  expect(scroller.scrollLeft).toBe(0);
  expect(arrows()).toEqual(["none", "none"]);

  // The grid and its border are 392 px in the phone view's 292 px: 100 px
  // to scroll, and the middle is 50.
  click("Phone");
  relayout(true);
  expect(scroller.scrollLeft).toBe(50);
  expect(arrows()).toEqual(["flex", "flex"]);
});

it("shows the zoomed-out page from its top left corner after Desktop was scrolled", () => {
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(NARROW_PANEL);
  renderPanel();
  click("Respondent preview");
  const stage = host.querySelector("iframe")!.parentElement!;
  expect(stage.className).toBe("overflow-x-auto");
  // Scrolled sideways by the researcher, or by a reminder in the page.
  stage.scrollLeft = 114;
  stage.scrollTop = 20;

  click("Fit");
  // The stage clips instead of scrolling; browsers without overflow: clip
  // use hidden, so the offset left from Desktop is reset too.
  expect(stage.className).toBe("overflow-hidden overflow-clip");
  expect(stage.scrollLeft).toBe(0);
  expect(stage.scrollTop).toBe(0);

  click("Desktop");
  expect(stage.className).toBe("overflow-x-auto");
});

it("starts both previews at full size when this browser's storage is blocked", () => {
  const blocked = () => {
    throw new DOMException("Storage is blocked", "SecurityError");
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
  renderPanel();
  expect(isPressed("100%")).toBe(true);
  click("Fit");
  expect(isPressed("Fit")).toBe(true);
  click("Respondent preview");
  expect(isPressed("Desktop")).toBe(true);
  click("Phone");
  expect(isPressed("Phone")).toBe(true);
});

it("keeps each preview's view while the other is shown when this browser's storage is blocked", () => {
  const blocked = () => {
    throw new DOMException("Storage is blocked", "SecurityError");
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
  renderPanel();
  click("Fit");
  click("Respondent preview");
  click("Phone");
  click("Design preview");
  expect(isPressed("Fit")).toBe(true);
  click("Respondent preview");
  expect(isPressed("Phone")).toBe(true);
  expect(host.querySelector("iframe")!.style.width).toBe("308px");
});

it("runs the grid's own words for respondents in the respondent preview", () => {
  renderPanel();
  act(() =>
    editor.dispatch({ type: "updateSurvey", patch: { respondentTexts: { next: "Siguiente", placing: "Colocando:" } } }),
  );
  click("Respondent preview");
  // The preview runs the exported script, which carries the grid's texts.
  const page = host.querySelector("iframe")!.srcdoc;
  expect(page).toContain("Siguiente");
  expect(page).toContain("Colocando:");
});

it("starts at full size when the remembered view is not one it knows", () => {
  window.localStorage.setItem(DESIGN_VIEW_STORAGE_KEY, "50%");
  window.localStorage.setItem(RESPONDENT_VIEW_STORAGE_KEY, "tablet");
  renderPanel();
  expect(isPressed("100%")).toBe(true);
  click("Respondent preview");
  expect(isPressed("Desktop")).toBe(true);
});
