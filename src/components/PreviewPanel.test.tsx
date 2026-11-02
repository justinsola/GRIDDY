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
  act(() => root.render(<RespondentPreview snippet={snippet} gridWidth={550} />));
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

it("lets the export dialog give this grid's fields their own ending", () => {
  act(() => root.render(<EditorProvider><PreviewPanel /></EditorProvider>));
  act(() => Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Export to Qualtrics",
  )!.click());
  const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.textContent).toContain("GridAssignments");
  const input = dialog.querySelector<HTMLInputElement>('input[aria-label="Field name ending"]')!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(input, "Q2");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(dialog.textContent).toContain("GridAssignments_Q2");
  expect(dialog.querySelector("textarea")!.value).toContain('"GridAssignments_Q2"');
});

it("draws the design grid at its designed size until Fit is chosen, and remembers the choice", () => {
  renderPanel();
  expect(isPressed("100%")).toBe(true);
  expect(designGrid().style.width).toBe("550px");
  expect(designGrid().style.height).toBe("550px");
  expect(designGrid().style.boxSizing).toBe("content-box");
  expect(host.textContent).not.toContain("Scaled to fit");

  click("Fit");
  expect(isPressed("Fit")).toBe(true);
  expect(designGrid().style.width).toBe("100%");
  expect(designGrid().style.height).toBe("");
  expect(host.textContent).toContain("Scaled to fit this panel. Respondents see the grid at 550 × 550 px.");
  expect(window.localStorage.getItem(DESIGN_VIEW_STORAGE_KEY)).toBe("fit");

  act(() => root.unmount());
  root = createRoot(host);
  renderPanel();
  expect(isPressed("Fit")).toBe(true);
  expect(designGrid().style.width).toBe("100%");
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

it("says when the design grid is wider than the panel", () => {
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(456);
  renderPanel();
  expect(host.textContent).toContain("Wider than this panel. Scroll sideways, or choose Fit.");
  click("Fit");
  expect(host.textContent).not.toContain("Wider than this panel");
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
  // the 550 px grid with its borders and the page's padding.
  expect(frame().srcdoc).not.toContain("zoom");
  expect(frame().style.transform).toBe("");
  expect(frame().style.width).toBe("100%");
  expect(frame().style.minWidth).toBe("570px");

  click("Phone");
  expect(frame().style.width).toBe("377px");
  expect(frame().style.minWidth).toBe("");
  expect(frame().style.transform).toBe("");
  expect(host.textContent).toContain("Phone, 375 px wide");
  expect(window.localStorage.getItem(RESPONDENT_VIEW_STORAGE_KEY)).toBe("phone");

  act(() => root.unmount());
  root = createRoot(host);
  renderPanel();
  click("Respondent preview");
  expect(isPressed("Phone")).toBe(true);
  expect(frame().style.width).toBe("377px");
});

it("zooms the respondent preview out when Fit is chosen, and says by how much", () => {
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(456);
  renderPanel();
  click("Respondent preview");
  const frame = host.querySelector("iframe")!;
  expect(host.textContent).toContain("Wider than this panel. Scroll sideways, or choose Fit.");

  click("Fit");
  expect(frame.style.width).toBe("570px");
  expect(frame.style.transform).toBe("scale(0.8)");
  expect(host.textContent).toContain("Shown at 80% so the whole grid fits. Respondents see it at full size.");
  expect(host.textContent).not.toContain("Wider than this panel");
});

it("sizes the respondent frame to its page in every view", () => {
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(456);
  renderPanel();
  click("Respondent preview");
  const frame = host.querySelector("iframe")!;
  const reportHeight = (height: number) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "griddy-preview-height", height },
          source: frame.contentWindow,
        }),
      );
    });

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

it("starts at full size when the remembered view is not one it knows", () => {
  window.localStorage.setItem(DESIGN_VIEW_STORAGE_KEY, "50%");
  window.localStorage.setItem(RESPONDENT_VIEW_STORAGE_KEY, "tablet");
  renderPanel();
  expect(isPressed("100%")).toBe(true);
  click("Respondent preview");
  expect(isPressed("Desktop")).toBe(true);
});
