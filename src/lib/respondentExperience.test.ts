import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { gridPixelSize } from "./gridSize";
import { buildQualtricsQsf, buildQualtricsSnippet, QualtricsExportOptions } from "./qualtricsExport";
import { RESPONDENT_TEXT_KEYS, type RespondentTextKey } from "./respondentTexts";
import type { GridConfig } from "../grid-types";

/**
 * What respondents experience in Qualtrics: the frame that keeps the designed
 * grid size, the empty-cell check on Next, and what reaches embedded data.
 * Each test runs the exported script in jsdom against a stub of the Qualtrics
 * engine that records what the script does: by default the new survey-taking
 * experience, which records each field as "__js_" and its name.
 */

function makeConfig(overrides: Partial<GridConfig> = {}): GridConfig {
  return {
    id: "respondent-test",
    name: "Respondent test",
    layout: {
      questionText: "Who lives where?",
      rows: 3,
      cols: 3,
      includeCenterCell: true,
      centerCellLabel: "Your House",
      centerRow: null,
      centerCol: null,
      backgroundImageUrl: "",
      barriersCsv: "",
      barrierMeta: {},
      blockedCells: {},
    },
    tuning: {
      gridGap: 10,
      gridPadding: 0,
      labelFontSizeRem: 1,
      cellWidth: 100,
      cellHeight: 120,
      previewWidth: 550,
      previewHeight: 550,
    },
    survey: {
      categoriesCsv: "Family, Friends",
      allowInteraction: true,
      selectionMode: "paint",
      advancedCategories: false,
      categoryMeta: {},
    },
    ...overrides,
  };
}

function withSurvey(patch: Partial<GridConfig["survey"]>, base = makeConfig()): GridConfig {
  return { ...base, survey: { ...base.survey, ...patch } };
}

function experimental(
  patch: Partial<NonNullable<GridConfig["experimental"]>> = {},
  base = makeConfig(),
): GridConfig {
  return {
    ...base,
    experimental: {
      enabled: true,
      prefillMode: "fixed",
      // r2-c2 is the centre of a 3 × 3 grid and r9-c9 lies outside it.
      fixedAssignments: { "r1-c1": "Family", "r2-c2": "Friends", "r9-c9": "Family" },
      weightedEntries: [],
      responseLabelsCsv: "Agree, Disagree",
      responseLabelMeta: {},
      ...patch,
    },
  };
}

/** One Qualtrics page: what its grids record, and its own Next button. */
interface Page {
  /** Embedded data saved on this page, under the names Qualtrics records. */
  embedded: Record<string, string>;
  /** Embedded data recorded on earlier pages. */
  saved: Record<string, string>;
  nextClicks: number;
  nativeNextHidden: boolean;
  unloads: Array<() => void>;
  /** Calls to functions that only say they are deprecated. */
  deprecatedCalls: string[];
}

function newPage(saved: Record<string, string> = {}): Page {
  return { embedded: {}, saved, nextClicks: 0, nativeNextHidden: false, unloads: [], deprecatedCalls: [] };
}

/**
 * The kinds of Qualtrics page the script can meet:
 * - "new": the new survey-taking experience, the default for surveys created
 *   since June 2026. setEmbeddedData and getEmbeddedData are stubs that only
 *   say they are deprecated; setJSEmbeddedData and getJSEmbeddedData keep the
 *   field under "__js_" and its name.
 * - "older": the older layouts, where setJSEmbeddedData is setEmbeddedData
 *   with "__js_" in front of the name.
 * - "plain": a page with setEmbeddedData and getEmbeddedData only.
 * - "failing": every embedded-data call throws.
 */
type Engine = "new" | "older" | "plain" | "failing";

function embeddedDataFunctions(engine: Engine, page: Page): Record<string, unknown> {
  const read = (field: string) => page.embedded[field] ?? page.saved[field] ?? "";
  const write = (field: string, value: string) => {
    page.embedded[field] = value;
  };
  // Qualtrics' own stub is a console.error that names the function as deprecated.
  const deprecated = (name: string) => () => {
    page.deprecatedCalls.push(name + " deprecated, please use setJSEmbeddedData");
  };
  const fail = () => {
    throw new Error("Qualtrics could not save");
  };
  switch (engine) {
    case "new":
      return {
        setEmbeddedData: deprecated("setEmbeddedData"),
        getEmbeddedData: deprecated("getEmbeddedData"),
        setJSEmbeddedData: (key: string, value: string) => write(`__js_${key}`, value),
        getJSEmbeddedData: (key: string) => read(`__js_${key}`),
      };
    case "older":
      return {
        setEmbeddedData: write,
        getEmbeddedData: read,
        setJSEmbeddedData: (key: string, value: string) => write(`__js_${key}`, value),
        getJSEmbeddedData: (key: string) => read(`__js_${key}`),
      };
    case "plain":
      return { setEmbeddedData: write, getEmbeddedData: read };
    case "failing":
      return { setEmbeddedData: fail, getEmbeddedData: fail, setJSEmbeddedData: fail, getJSEmbeddedData: fail };
  }
}

interface Run {
  container: HTMLElement;
  page: Page;
  embedded: Record<string, string>;
  readonly nextClicks: number;
  readonly nativeNextHidden: boolean;
}

interface RunOptions {
  /** Put this grid on a page that already holds other grids. */
  page?: Page;
  questionId?: string;
  /** Where the question sits, for example a block hidden by display logic. */
  parent?: HTMLElement;
  fields?: QualtricsExportOptions;
  /** The new survey-taking experience unless a test says otherwise. */
  engine?: Engine;
}

function run(
  config: GridConfig,
  saved: Record<string, string> = {},
  questionHtml = "",
  options: RunOptions = {},
): Run {
  const page = options.page ?? newPage(saved);
  const container = document.createElement("div");
  const readyCallbacks: Array<() => void> = [];
  (globalThis as unknown as { Qualtrics: unknown }).Qualtrics = {
    SurveyEngine: {
      addOnload: () => {},
      addOnReady: (cb: () => void) => readyCallbacks.push(cb),
      addOnUnload: (cb: () => void) => page.unloads.push(cb),
      ...embeddedDataFunctions(options.engine ?? "new", page),
    },
  };
  container.innerHTML = questionHtml;
  (options.parent ?? document.body).appendChild(container);
  const question = {
    questionId: options.questionId,
    getQuestionTextContainer: () => container,
    clickNextButton: () => {
      page.nextClicks += 1;
    },
    hideNextButton: () => {
      page.nativeNextHidden = true;
    },
    showNextButton: () => {
      page.nativeNextHidden = false;
    },
  };
  new Function(buildQualtricsSnippet(config, options.fields))();
  readyCallbacks.forEach((cb) => cb.call(question));
  return {
    container,
    page,
    embedded: page.embedded,
    get nextClicks() {
      return page.nextClicks;
    },
    get nativeNextHidden() {
      return page.nativeNextHidden;
    },
  };
}

// Each test starts on an empty page: grids left over from another test would
// otherwise share its Next button.
beforeEach(() => {
  document.body.innerHTML = "";
  const w = window as unknown as Record<string, unknown>;
  delete w.griddyPageGrids;
  delete w.griddyFieldOwners;
  delete w.griddyHidNext;
  delete w.griddyNextOwner;
});

afterEach(() => {
  vi.useRealTimers();
});

/** The grid's own Next button, and whether it is shown. */
function gridNext(container: HTMLElement): { button: HTMLButtonElement; shown: boolean } {
  const next = button(container, "Next");
  return { button: next, shown: next.parentElement!.style.display !== "none" };
}

function cells(container: HTMLElement): HTMLElement[] {
  const grid = Array.from(container.querySelectorAll("div")).find(
    (d) => d.style.display === "grid",
  );
  if (!grid) throw new Error("grid not found");
  return Array.from(grid.children) as HTMLElement[];
}

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === text,
  );
  if (!found) throw new Error(`button "${text}" not found`);
  return found;
}

function reminder(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>("[data-griddy-reminder]");
  if (!el) throw new Error("reminder not found");
  return el;
}

/** A grid sized by its cells: 4 columns of 100 px, 10 px apart, make it
 * 430 px wide, more than a phone's 339 px. */
function wideGrid(): GridConfig {
  const base = makeConfig();
  return {
    ...base,
    layout: { ...base.layout, cols: 4 },
    tuning: { gridGap: 10, gridPadding: 0, labelFontSizeRem: 1, cellWidth: 100, cellHeight: 100, sizing: "cells" },
  };
}

function gridFrame(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>("[data-griddy-scroller]")!.firstElementChild as HTMLElement;
}

describe("the grid keeps its designed size", () => {
  it("puts the grid, at its designed width and height, in a frame that scrolls sideways", () => {
    // makeConfig is a survey saved before cell sizes: its grid filled 550 × 550 px.
    const { container } = run(makeConfig());
    const scroller = container.querySelector<HTMLElement>("[data-griddy-scroller]");
    expect(scroller).not.toBeNull();
    const wrapper = scroller!.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe("550px");
    expect(wrapper.style.height).toBe("550px");
    expect(container.querySelectorAll("[data-griddy-edge]")).toHaveLength(2);
    expect(container.querySelector("[data-griddy-scroll-hint]")).not.toBeNull();
  });

  it("makes the grid the size its cells, rows and columns add up to, as the editor says", () => {
    const config = wideGrid();
    const { container } = run(config);
    expect(gridPixelSize(config)).toEqual({ width: 430, height: 320 });
    expect(gridFrame(container).style.width).toBe("430px");
    expect(gridFrame(container).style.height).toBe("320px");
    // The cells share the frame out evenly, 10 px apart: 100 px each.
    const grid = container.querySelector<HTMLElement>("[data-griddy-grid]")!;
    expect(grid.style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(grid.style.gridTemplateRows).toBe("repeat(3, minmax(0, 1fr))");
    expect(grid.style.gap).toBe("10px");
    expect(grid.style.padding).toBe("0px");
  });
});

describe("scroll indicators", () => {
  function sized(container: HTMLElement, scrollWidth: number, clientWidth: number, scrollLeft = 0) {
    const scroller = container.querySelector<HTMLElement>("[data-griddy-scroller]")!;
    Object.defineProperty(scroller, "scrollWidth", { configurable: true, value: scrollWidth });
    Object.defineProperty(scroller, "clientWidth", { configurable: true, value: clientWidth });
    scroller.scrollLeft = scrollLeft;
    Object.defineProperty(scroller, "scrollLeft", { configurable: true, value: scrollLeft });
    scroller.dispatchEvent(new Event("scroll"));
    const hint = container.querySelector<HTMLElement>("[data-griddy-scroll-hint]")!;
    const left = container.querySelector<HTMLElement>('[data-griddy-edge="left"]')!;
    const right = container.querySelector<HTMLElement>('[data-griddy-edge="right"]')!;
    return { scroller, hint, left, right };
  }

  it("shows the hint and the right arrow when the grid is wider than the screen", () => {
    const { scroller, hint, left, right } = sized(run(makeConfig()).container, 552, 339);
    expect(scroller.style.overflowX).toBe("auto");
    expect(hint.style.display).toBe("block");
    expect(right.style.display).toBe("flex");
    expect(left.style.display).toBe("none");
  });

  it("swaps to the left arrow once the respondent has scrolled to the end", () => {
    const { left, right } = sized(run(makeConfig()).container, 552, 339, 213);
    expect(left.style.display).toBe("flex");
    expect(right.style.display).toBe("none");
  });

  it("shows no hint, arrows or scrollbar when the grid fits", () => {
    const { scroller, hint, left, right } = sized(run(makeConfig()).container, 552, 552);
    expect(scroller.style.overflowX).toBe("hidden");
    expect(hint.style.display).toBe("none");
    expect(left.style.display).toBe("none");
    expect(right.style.display).toBe("none");
  });
});

describe("empty cells when the respondent presses Next", () => {
  it("reminds by default, outlines the empty cells and continues only when asked", () => {
    const r = run(makeConfig());
    button(r.container, "Next").click();
    expect(r.nextClicks).toBe(0);
    expect(reminder(r.container).style.display).toBe("block");
    expect(reminder(r.container).textContent).toContain("8 cells are still empty");
    const outlined = cells(r.container).filter((c) => c.style.outline.includes("dashed"));
    expect(outlined).toHaveLength(8); // every cell except the centre
    button(r.container, "Continue anyway").click();
    expect(r.nextClicks).toBe(1);
  });

  it("updates the reminder as cells are filled and hides it when none are left", () => {
    const r = run(makeConfig());
    button(r.container, "Next").click();
    const grid = cells(r.container);
    grid[0].click();
    expect(reminder(r.container).textContent).toContain("7 cells are still empty");
    expect(grid[0].style.outline).toBe("");
    grid.forEach((c) => c.click()); // the centre ignores clicks; r1-c1 toggles off again
    grid[0].click();
    expect(reminder(r.container).style.display).toBe("none");
    button(r.container, "Next").click();
    expect(r.nextClicks).toBe(1);
  });

  it("leaves only Qualtrics' own Next when the researcher allows empty cells", () => {
    const r = run(withSurvey({ skipBehavior: "allow" }));
    expect(r.nativeNextHidden).toBe(false);
    expect(gridNext(r.container).shown).toBe(false);
  });

  it("requires every cell when the researcher says so", () => {
    const r = run(withSurvey({ skipBehavior: "force" }));
    button(r.container, "Next").click();
    expect(r.nextClicks).toBe(0);
    expect(button(r.container, "Continue anyway").style.display).toBe("none");
    expect(reminder(r.container).textContent).toContain("Please fill in every outlined cell");
    cells(r.container).forEach((c) => c.click());
    button(r.container, "Next").click();
    expect(r.nextClicks).toBe(1);
  });

  it("hides Qualtrics' own Next button while the check is on", () => {
    expect(run(makeConfig()).nativeNextHidden).toBe(true);
  });

  it("does not check or record a grid that respondents only look at", () => {
    const r = run(withSurvey({ allowInteraction: false }));
    expect(r.nativeNextHidden).toBe(false);
    expect(gridNext(r.container).shown).toBe(false);
    expect(r.embedded).toEqual({});
  });

  it("gives Qualtrics' Next back when the page is left", () => {
    const r = run(makeConfig());
    expect(r.nativeNextHidden).toBe(true);
    r.page.unloads.forEach((unload) => unload());
    expect(r.nativeNextHidden).toBe(false);
  });

  it("announces the reminder once per press of Next, apart from the visible box", async () => {
    const r = run(makeConfig());
    button(r.container, "Next").click();
    expect(reminder(r.container).getAttribute("role")).toBeNull();
    const announcer = r.container.querySelector<HTMLElement>("[data-griddy-announce]")!;
    expect(announcer.getAttribute("role")).toBe("alert");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(announcer.textContent).toBe("8 cells are still empty. Use Show me to find them, or Continue anyway.");
    cells(r.container)[0].click();
    expect(reminder(r.container).textContent).toContain("7 cells are still empty");
    expect(announcer.textContent).toContain("8 cells");
  });

  it("Show me brings the first empty cell out of view into view and focuses it", () => {
    const r = run(makeConfig());
    const box = (left: number) => () => ({ left, right: left + 100, top: 0, bottom: 120, width: 100, height: 120 }) as DOMRect;
    const scroller = r.container.querySelector<HTMLElement>("[data-griddy-scroller]")!;
    scroller.getBoundingClientRect = box(0);
    cells(r.container).forEach((cell, i) => {
      cell.getBoundingClientRect = box((i % 3) * 110);
    });
    // The frame shows only the first column; r1-c2 is the first empty cell out of view.
    scroller.getBoundingClientRect = () => ({ left: 0, right: 105, top: 0, bottom: 400, width: 105, height: 400 }) as DOMRect;
    button(r.container, "Next").click();
    button(r.container, "Show me").click();
    expect(document.activeElement).toBe(cells(r.container)[1]);
  });
});

describe("what is recorded", () => {
  it("records an empty answer as soon as the grid is shown", () => {
    expect(run(makeConfig()).embedded.__js_GridAssignments).toBe("{}");
  });

  it("records the pre-fills a respondent was shown before any reaction", () => {
    const r = run(experimental());
    expect(JSON.parse(r.embedded.__js_GridPrefills)).toEqual({ "r1-c1": "Family" });
    expect(r.embedded.__js_GridResponses).toBe("{}");
  });

  it("never shuffles a pre-fill into the centre cell or outside the grid", () => {
    const r = run(experimental({ prefillMode: "shuffle" }));
    expect(Object.keys(JSON.parse(r.embedded.__js_GridPrefills))).toEqual(["r1-c1"]);
  });
});

describe("reactions in an experiment", () => {
  it("accepts reactions only on pre-filled cells", () => {
    const r = run(experimental());
    const grid = cells(r.container);
    grid[1].click(); // r1-c2 has no pre-fill
    expect(JSON.parse(r.embedded.__js_GridResponses)).toEqual({});
    grid[0].click(); // r1-c1 shows Family
    expect(JSON.parse(r.embedded.__js_GridResponses)).toEqual({ "r1-c1": "Agree" });
  });

  it("offers the reaction dropdown only on pre-filled cells", () => {
    const grid = cells(run(experimental({}, withSurvey({ selectionMode: "dropdown" }))).container);
    expect(grid[0].querySelector("select")).not.toBeNull();
    expect(grid[1].querySelector("select")).toBeNull();
  });

  it("asks only about pre-filled cells that have no reaction", () => {
    const r = run(experimental());
    button(r.container, "Next").click();
    expect(reminder(r.container).textContent).toContain("1 pre-filled cell has no reaction yet");
  });
});

describe("dropdown cells", () => {
  it("show the chosen category's image above its name", () => {
    const base = withSurvey({
      selectionMode: "dropdown",
      categoryMeta: { Family: { color: "#f87171", imageUrl: "data:image/png;base64,AAAA" } },
    });
    const r = run(base);
    const first = cells(r.container)[0];
    const select = first.querySelector("select")!;
    select.value = "Family";
    select.dispatchEvent(new Event("change"));
    const img = cells(r.container)[0].querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.alt).toBe("Family");
    expect(JSON.parse(r.embedded.__js_GridAssignments)).toEqual({ "r1-c1": "Family" });
  });
});

describe("layer mode for category images", () => {
  function painted(layerMode: "front" | "behind" | "replace"): HTMLElement {
    const r = run(
      withSurvey({
        categoryMeta: {
          Family: { color: "#f87171", imageUrl: "data:image/png;base64,AAAA", layerMode },
        },
      }),
    );
    cells(r.container)[0].click(); // paints Family, the active category
    return cells(r.container)[0];
  }

  it("lays the image over the whole cell for Front", () => {
    const cell = painted("front");
    const img = cell.querySelector("img")!;
    expect(img.style.position).toBe("absolute");
    expect(img.style.opacity).toBe("");
    expect(cell.style.backgroundColor).toBe("transparent");
  });

  it("shows a faint image under the name for Behind", () => {
    const img = painted("behind").querySelector("img")!;
    expect(img.style.position).toBe("absolute");
    expect(img.style.opacity).toBe("0.2");
  });

  it("keeps the image above the name for Replace", () => {
    const img = painted("replace").querySelector("img")!;
    expect(img.style.position).toBe("");
  });

  it("applies the layer mode to pre-filled cells in an experiment", () => {
    const base = withSurvey({
      categoryMeta: {
        Family: { color: "#f87171", imageUrl: "data:image/png;base64,AAAA", layerMode: "behind" },
      },
    });
    const img = cells(run(experimental({}, base)).container)[0].querySelector("img")!;
    expect(img.style.opacity).toBe("0.2");
  });
});

describe("drag and drop", () => {
  it("ignores dropped text that is not one of the grid's labels", () => {
    const r = run(withSurvey({ selectionMode: "dragdrop" }));
    const first = cells(r.container)[0];
    const drop = (text: string) =>
      first.ondrop?.call(first, {
        preventDefault: () => {},
        dataTransfer: { getData: () => text },
      } as unknown as DragEvent);
    drop("Not a label");
    expect(JSON.parse(r.embedded.__js_GridAssignments)).toEqual({});
    drop("Friends");
    expect(JSON.parse(r.embedded.__js_GridAssignments)).toEqual({ "r1-c1": "Friends" });
  });
});

describe("drag and drop on touch screens", () => {
  function fingerDrag(chip: HTMLElement, target: HTMLElement, pointerType = "touch") {
    const original = document.elementFromPoint;
    document.elementFromPoint = () => target;
    const fire = (type: string) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 120, clientY: 300 });
      Object.defineProperty(event, "pointerType", { value: pointerType });
      Object.defineProperty(event, "pointerId", { value: 1 });
      chip.dispatchEvent(event);
    };
    try {
      fire("pointerdown");
      fire("pointermove");
      fire("pointerup");
    } finally {
      document.elementFromPoint = original;
    }
  }

  const ghosts = () =>
    Array.from(document.body.children).filter(
      (el) => (el as HTMLElement).style.position === "fixed",
    );

  it("drops a label on the cell where the finger lifts", () => {
    const r = run(withSurvey({ selectionMode: "dragdrop" }));
    fingerDrag(button(r.container, "Friends"), cells(r.container)[0]);
    expect(JSON.parse(r.embedded.__js_GridAssignments)).toEqual({ "r1-c1": "Friends" });
    expect(ghosts()).toHaveLength(0);
  });

  it("drops a reaction only on a pre-filled cell", () => {
    const r = run(experimental({}, withSurvey({ selectionMode: "dragdrop" })));
    fingerDrag(button(r.container, "Agree"), cells(r.container)[1]); // no pre-fill
    expect(JSON.parse(r.embedded.__js_GridResponses)).toEqual({});
    fingerDrag(button(r.container, "Agree"), cells(r.container)[0]); // shows Family
    expect(JSON.parse(r.embedded.__js_GridResponses)).toEqual({ "r1-c1": "Agree" });
  });

  it("leaves mouse drags to the browser's own drag and drop", () => {
    const r = run(withSurvey({ selectionMode: "dragdrop" }));
    fingerDrag(button(r.container, "Friends"), cells(r.container)[0], "mouse");
    expect(JSON.parse(r.embedded.__js_GridAssignments)).toEqual({});
  });
});

describe("keyboard and screen readers", () => {
  const press = (el: HTMLElement, key = "Enter") =>
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

  it("makes answerable cells focusable buttons that say what they hold", () => {
    const grid = cells(run(makeConfig()).container);
    expect(grid[0].tabIndex).toBe(0);
    expect(grid[0].getAttribute("role")).toBe("button");
    expect(grid[0].getAttribute("aria-label")).toBe("Row 1, column 1: empty");
    expect(grid[4].getAttribute("role")).toBeNull(); // the centre cell
  });

  it("places the active label with Enter and updates the description", () => {
    const r = run(makeConfig());
    const first = cells(r.container)[0];
    press(first);
    expect(JSON.parse(r.embedded.__js_GridAssignments)).toEqual({ "r1-c1": "Family" });
    expect(first.getAttribute("aria-label")).toBe("Row 1, column 1: Family");
  });

  // Enter or Space on a button, and a screen reader activating it, arrive as
  // a click with no pointer; a mouse click carries a click count.
  const assistiveClick = (el: HTMLElement) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  const mouseClick = (el: HTMLElement) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));

  it("lets drag-and-drop be done from the keyboard: pick up a chip, then place it", () => {
    const r = run(withSurvey({ selectionMode: "dragdrop" }));
    const chip = button(r.container, "Friends");
    assistiveClick(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    press(cells(r.container)[2]);
    expect(JSON.parse(r.embedded.__js_GridAssignments)).toEqual({ "r1-c3": "Friends" });
  });

  it("lets a screen reader pick up and place a label with clicks alone", () => {
    const r = run(withSurvey({ selectionMode: "dragdrop" }));
    assistiveClick(button(r.container, "Family"));
    assistiveClick(cells(r.container)[1]);
    expect(JSON.parse(r.embedded.__js_GridAssignments)).toEqual({ "r1-c2": "Family" });
  });

  it("leaves mouse clicks alone, so drag and drop stays a drag", () => {
    const r = run(withSurvey({ selectionMode: "dragdrop" }));
    const chip = button(r.container, "Family");
    mouseClick(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    assistiveClick(chip);
    mouseClick(cells(r.container)[1]);
    expect(JSON.parse(r.embedded.__js_GridAssignments)).toEqual({});
  });

  it("leaves Enter on a cell's clear button to that button", () => {
    const r = run(withSurvey({ selectionMode: "dragdrop" }));
    assistiveClick(button(r.container, "Friends"));
    press(cells(r.container)[0]);
    assistiveClick(button(r.container, "Family"));
    const clear = cells(r.container)[0].querySelector<HTMLButtonElement>('button[title="Clear cell"]')!;
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    clear.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(JSON.parse(r.embedded.__js_GridAssignments)).toEqual({ "r1-c1": "Friends" });
    clear.click();
    expect(JSON.parse(r.embedded.__js_GridAssignments)).toEqual({});
  });

  it("names every dropdown", () => {
    const grid = cells(run(withSurvey({ selectionMode: "dropdown" })).container);
    expect(grid[0].querySelector("select")!.getAttribute("aria-label")).toBe("Label for row 1, column 1");
  });

  it("only makes pre-filled cells answerable in an experiment", () => {
    const grid = cells(run(experimental()).container);
    expect(grid[0].getAttribute("aria-label")).toBe("Row 1, column 1: Family, no reaction yet");
    expect(grid[1].getAttribute("role")).toBeNull();
  });
});

describe("fonts and long labels", () => {
  it("makes buttons and selects use the grid's font and lets long words wrap", () => {
    const r = run(makeConfig());
    const styles = document.getElementById("griddy-styles");
    expect(styles?.textContent).toContain("font-family: inherit");
    expect(styles?.textContent).toContain("overflow-wrap: anywhere");
    expect(r.container.hasAttribute("data-griddy-root")).toBe(true);
    expect(r.container.querySelector("[data-griddy-grid]")).not.toBeNull();
  });
});

describe("what the export carries", () => {
  it("leaves a switched-off experiment, and its reaction images, out of the script", () => {
    const base = experimental({
      enabled: false,
      responseLabelMeta: { Agree: { color: "#22c55e", imageUrl: "data:image/png;base64,REACTIONIMAGE" } },
    });
    const snippet = buildQualtricsSnippet(base);
    expect(snippet).not.toContain("REACTIONIMAGE");
    expect(snippet).toContain('"experimental": null');
  });

  it("does not join a barrier to blocked cells left outside a shrunken grid", () => {
    const base = makeConfig();
    const withBarrier = (blockedCells: Record<string, string>): GridConfig => ({
      ...base,
      layout: { ...base.layout, barriersCsv: "Wall", barrierMeta: { Wall: { color: "#334155", imageUrl: "" } }, blockedCells },
    });
    const fillerCount = (config: GridConfig) =>
      Array.from(cells(run(config).container)[2].children).filter(
        (c) => (c as HTMLElement).style.position === "absolute",
      ).length;
    expect(fillerCount(withBarrier({ "r1-c3": "Wall", "r1-c4": "Wall" }))).toBe(
      fillerCount(withBarrier({ "r1-c3": "Wall" })),
    );
  });
});

describe("image URLs", () => {
  it("keeps a background image whose URL contains an apostrophe", () => {
    const base = makeConfig();
    const r = run({
      ...base,
      layout: { ...base.layout, backgroundImageUrl: "https://example.com/o'brien.png" },
    });
    const wrapper = r.container.querySelector("[data-griddy-scroller]")!
      .firstElementChild as HTMLElement;
    expect(wrapper.style.backgroundImage).toContain("o'brien.png");
  });
});

describe("going back to the grid, or resuming later", () => {
  it("shows the answers already recorded instead of an empty grid", () => {
    const r = run(makeConfig(), { __js_GridAssignments: '{"r1-c1":"Friends","r9-c9":"Friends","r1-c2":"Strangers"}' });
    expect(cells(r.container)[0].textContent).toContain("Friends");
    // Only real cells and real categories come back; nothing is lost on display.
    expect(JSON.parse(r.embedded.__js_GridAssignments)).toEqual({ "r1-c1": "Friends" });
  });

  it("does not show or overwrite answers another question saved under the same field", () => {
    const page = newPage();
    const first = run(makeConfig(), {}, "", { page, questionId: "QID1" });
    cells(first.container)[0].click();
    expect(JSON.parse(page.embedded.__js_GridAssignments)).toEqual({ "r1-c1": "Family" });
    first.container.remove();
    // A copy of the grid on the next page, under another question.
    const copy = run(makeConfig(), {}, "", { page, questionId: "QID2" });
    expect(cells(copy.container)[0].textContent).not.toContain("Family");
    expect(JSON.parse(page.embedded.__js_GridAssignments)).toEqual({ "r1-c1": "Family" });
    // Leaving the copy untouched keeps the first question's answers.
    button(copy.container, "Next").click();
    button(copy.container, "Continue anyway").click();
    expect(page.nextClicks).toBe(1);
    expect(JSON.parse(page.embedded.__js_GridAssignments)).toEqual({ "r1-c1": "Family" });
    copy.container.remove();
    // Going back to the first question shows its answers again.
    const back = run(makeConfig(), {}, "", { page, questionId: "QID1" });
    expect(cells(back.container)[0].textContent).toContain("Family");
  });

  it("draws fresh pre-fills when the saved ones do not fit this grid", () => {
    const r = run(experimental(), { __js_GridPrefills: '{"r1-c1":"Strangers"}' });
    expect(JSON.parse(r.embedded.__js_GridPrefills)).toEqual({ "r1-c1": "Family" });
  });

  it("shows the same pre-fills and reactions rather than drawing new ones", () => {
    const r = run(experimental({ prefillMode: "shuffle" }), {
      __js_GridPrefills: '{"r1-c3":"Friends"}',
      __js_GridResponses: '{"r1-c3":"Disagree"}',
    });
    expect(JSON.parse(r.embedded.__js_GridPrefills)).toEqual({ "r1-c3": "Friends" });
    expect(JSON.parse(r.embedded.__js_GridResponses)).toEqual({ "r1-c3": "Disagree" });
  });
});

describe("saving in each kind of Qualtrics page", () => {
  it("records answers under the __js_ names in the new survey-taking experience", () => {
    const r = run(makeConfig());
    cells(r.container)[0].click();
    expect(Object.keys(r.embedded)).toEqual(["__js_GridAssignments"]);
    expect(JSON.parse(r.embedded.__js_GridAssignments)).toEqual({ "r1-c1": "Family" });
    // Qualtrics' deprecated stubs are left alone, so nothing is logged.
    expect(r.page.deprecatedCalls).toEqual([]);
  });

  it("shows the answers again on Back, read with getJSEmbeddedData, and Next moves on", () => {
    const first = run(makeConfig());
    cells(first.container)[0].click();
    button(first.container, "Next").click();
    button(first.container, "Continue anyway").click();
    expect(first.nextClicks).toBe(1);
    first.container.remove();
    const back = run(makeConfig(), { ...first.embedded });
    expect(cells(back.container)[0].textContent).toContain("Family");
    expect(back.page.deprecatedCalls).toEqual([]);
  });

  it("records the plain name as well in the older layouts", () => {
    const r = run(makeConfig(), {}, "", { engine: "older" });
    cells(r.container)[0].click();
    expect(Object.keys(r.embedded).sort()).toEqual(["GridAssignments", "__js_GridAssignments"]);
    expect(r.embedded.GridAssignments).toBe(r.embedded.__js_GridAssignments);
  });

  it("brings back answers an older GRIDDY script saved under the plain name", () => {
    const r = run(makeConfig(), { GridAssignments: '{"r1-c1":"Friends"}' }, "", { engine: "older" });
    expect(cells(r.container)[0].textContent).toContain("Friends");
    expect(JSON.parse(r.embedded.__js_GridAssignments)).toEqual({ "r1-c1": "Friends" });
  });

  it("saves and reads the plain name where Qualtrics has no setJSEmbeddedData", () => {
    const r = run(experimental(), { GridResponses: '{"r1-c1":"Disagree"}', GridPrefills: '{"r1-c1":"Family"}' }, "", {
      engine: "plain",
    });
    expect(Object.keys(r.embedded).sort()).toEqual(["GridPrefills", "GridResponses"]);
    expect(JSON.parse(r.embedded.GridResponses)).toEqual({ "r1-c1": "Disagree" });
    cells(r.container)[0].click();
    expect(JSON.parse(r.embedded.GridResponses)).toEqual({ "r1-c1": "Agree" });
  });

  it("keeps the grid, its reminder and Next working when saving fails", () => {
    const r = run(makeConfig(), {}, "", { engine: "failing" });
    cells(r.container)[0].click();
    expect(cells(r.container)[0].textContent).toContain("Family");
    button(r.container, "Next").click();
    expect(reminder(r.container).textContent).toContain("7 cells are still empty");
    cells(r.container)[1].click();
    expect(reminder(r.container).textContent).toContain("6 cells are still empty");
    button(r.container, "Continue anyway").click();
    expect(r.nextClicks).toBe(1);
    expect(r.embedded).toEqual({});
  });

  it("lets an experiment be answered and moves on when saving fails", () => {
    const r = run(experimental(), {}, "", { engine: "failing" });
    cells(r.container)[0].click();
    expect(cells(r.container)[0].textContent).toContain("Agree");
    button(r.container, "Next").click();
    expect(r.nextClicks).toBe(1);
  });

  it("moves on even when another grid on the page cannot save", () => {
    const r = run(makeConfig());
    cells(r.container).forEach((cell) => cell.click());
    // A grid from an older GRIDDY script on the same page, whose save throws.
    const other = document.createElement("div");
    document.body.appendChild(other);
    (window as unknown as { griddyPageGrids: unknown[] }).griddyPageGrids.push({
      root: other,
      question: {},
      controls: document.createElement("div"),
      reminder: document.createElement("div"),
      isShown: () => true,
      persist: () => {
        throw new Error("Qualtrics could not save");
      },
      showReminder: () => {},
      checks: () => false,
      blocks: () => false,
    });
    button(r.container, "Next").click();
    expect(r.nextClicks).toBe(1);
  });
});

describe("question wording", () => {
  const withQuestion = (questionText: string): GridConfig => {
    const base = makeConfig();
    return { ...base, layout: { ...base.layout, questionText } };
  };

  it("keeps the wording written in Qualtrics when GRIDDY's question is blank", () => {
    const r = run(withQuestion(""), {}, "<b>Where do your relatives live?</b>");
    expect(r.container.innerHTML).toContain("<b>Where do your relatives live?</b>");
  });

  it("treats a question of only spaces, non-breaking spaces or line breaks as blank", () => {
    for (const questionText of ["   ", "\u00a0\u00a0", "\n", " \u00a0\r\n\t "]) {
      document.body.innerHTML = "";
      const r = run(withQuestion(questionText), {}, "<b>Where do your relatives live?</b>");
      expect(r.container.innerHTML).toContain("<b>Where do your relatives live?</b>");
    }
  });

  it("shows GRIDDY's question, spaces and all, when it has visible text", () => {
    const r = run(withQuestion("  Who lives where?  "), {}, "<b>Where do your relatives live?</b>");
    expect(r.container.innerHTML).not.toContain("Where do your relatives live?");
    const question = r.container.querySelector("p")!;
    expect(question.textContent).toBe("  Who lives where?  ");
  });

  it("escapes the question in the .qsf and leaves it blank when GRIDDY's is blank", () => {
    const qsf = (questionText: string) =>
      JSON.parse(buildQualtricsQsf([{ title: "Study A", config: withQuestion(questionText) }]))
        .SurveyElements.find((e: { Element: string }) => e.Element === "SQ").Payload;
    expect(qsf("Rate A < B & C").QuestionText).toBe("Rate A &lt; B &amp; C");
    expect(qsf("").QuestionText).toBe("");
    expect(qsf("").QuestionDescription).toBe("Study A");
    expect(qsf(" \u00a0\n ").QuestionText).toBe("");
    expect(qsf(" \u00a0\n ").QuestionDescription).toBe("Study A");
  });
});

describe("centre cell, background and readability", () => {
  it("keeps the centre cell when a barrier was left on it", () => {
    const base = makeConfig();
    const grid = cells(
      run({
        ...base,
        layout: { ...base.layout, barriersCsv: "Wall", barrierMeta: { Wall: { color: "#334155", imageUrl: "" } }, blockedCells: { "r2-c2": "Wall" } },
      }).container,
    );
    expect(grid[4].textContent).toContain("Your House");
  });

  it("lets a background image show through empty cells", () => {
    const base = makeConfig();
    const grid = cells(run({ ...base, layout: { ...base.layout, backgroundImageUrl: "https://example.com/map.png" } }).container);
    expect(grid[0].style.backgroundColor).toBe("rgba(251, 248, 241, 0.55)");
  });

  it("writes placed reactions in dark text", () => {
    const r = run(experimental());
    cells(r.container)[0].click();
    const reaction = Array.from(cells(r.container)[0].querySelectorAll("div"))
      .filter((d) => d.textContent === "Agree")
      .pop()!;
    expect(reaction.style.color).toBe("rgb(42, 36, 28)");
  });

  it("keeps keyboard focus on a dropdown after a choice", () => {
    const r = run(withSurvey({ selectionMode: "dropdown" }));
    const select = cells(r.container)[0].querySelector("select")!;
    select.focus();
    select.value = "Friends";
    select.dispatchEvent(new Event("change"));
    expect(document.activeElement).toBe(cells(r.container)[0].querySelector("select"));
  });
});

describe("display logic and several grids on one page", () => {
  type Callback = () => void;
  let observers: Callback[] = [];
  class FakeResizeObserver {
    constructor(callback: Callback) {
      observers.push(callback);
    }
    observe() {}
    disconnect() {}
  }
  beforeEach(() => {
    observers = [];
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
  });
  afterEach(() => {
    delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
  });
  const layoutChanged = () => observers.forEach((callback) => callback());

  it("leaves Qualtrics' Next alone and records nothing while display logic hides the grid", () => {
    const block = document.createElement("div");
    block.style.display = "none";
    document.body.appendChild(block);
    const r = run(makeConfig(), {}, "", { parent: block });
    expect(r.nativeNextHidden).toBe(false);
    expect(r.embedded).toEqual({});

    block.style.display = "block";
    layoutChanged();
    expect(r.nativeNextHidden).toBe(true);
    expect(r.embedded.__js_GridAssignments).toBe("{}");

    block.style.display = "none";
    layoutChanged();
    expect(r.nativeNextHidden).toBe(false);
  });

  it("shows one Next, under the last grid, and it checks every grid on the page", () => {
    const page = newPage();
    const first = run(withSurvey({ skipBehavior: "force" }), {}, "", { page, questionId: "QID1" });
    const second = run(makeConfig(), {}, "", {
      page,
      questionId: "QID2",
      fields: { embeddedDataField: "GridAssignments_B" },
    });
    expect(gridNext(first.container).shown).toBe(false);
    expect(gridNext(second.container).shown).toBe(true);

    cells(second.container).forEach((cell) => cell.click());
    gridNext(second.container).button.click();
    expect(page.nextClicks).toBe(0);
    expect(reminder(first.container).style.display).toBe("block");

    cells(first.container).forEach((cell) => cell.click());
    gridNext(second.container).button.click();
    expect(page.nextClicks).toBe(1);
    expect(Object.keys(JSON.parse(page.embedded.__js_GridAssignments))).toHaveLength(8);
    expect(Object.keys(JSON.parse(page.embedded.__js_GridAssignments_B))).toHaveLength(8);
  });
});

describe("right-to-left surveys", () => {
  it("keeps column 1 on the left so the scroll arrows work", () => {
    const r = run(makeConfig());
    expect(r.container.querySelector<HTMLElement>("[data-griddy-frame]")!.style.direction).toBe("ltr");
  });
});

describe("finger drags near the edge", () => {
  it("keeps scrolling the grid while the finger rests at the edge", () => {
    vi.useFakeTimers();
    const r = run(withSurvey({ selectionMode: "dragdrop" }));
    const scroller = r.container.querySelector<HTMLElement>("[data-griddy-scroller]")!;
    let left = 0;
    Object.defineProperty(scroller, "scrollLeft", {
      configurable: true,
      get: () => left,
      set: (value: number) => {
        left = value;
      },
    });
    scroller.getBoundingClientRect = () => ({ left: 0, right: 300, top: 0, bottom: 600, width: 300, height: 600 }) as DOMRect;
    const original = document.elementFromPoint;
    document.elementFromPoint = () => cells(r.container)[0];
    const chip = button(r.container, "Friends");
    const fire = (type: string, x: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 300 });
      Object.defineProperty(event, "pointerType", { value: "touch" });
      Object.defineProperty(event, "pointerId", { value: 1 });
      chip.dispatchEvent(event);
    };
    try {
      fire("pointerdown", 150);
      fire("pointermove", 295); // into the right edge band, then the finger rests
      const afterMove = left;
      vi.advanceTimersByTime(160);
      expect(left).toBeGreaterThan(afterMove + 50);
      fire("pointerup", 295);
      const afterDrop = left;
      vi.advanceTimersByTime(160);
      expect(left).toBe(afterDrop);
    } finally {
      document.elementFromPoint = original;
    }
  });
});

describe("words shown to respondents", () => {
  // Every text GRIDDY adds around the grid, in Spanish.
  const SPANISH: Record<RespondentTextKey, string> = {
    placing: "Colocando:",
    reacting: "Reaccionando:",
    dragLabel: "Arrastra una etiqueta a una celda, o elige una etiqueta y luego una celda:",
    dragReaction: "Arrastra una reacción a una celda, o elige una reacción y luego una celda:",
    clearCellChip: "Vaciar celda",
    clearReactionChip: "Quitar reacción",
    clearButtonTitle: "Vaciar esta celda",
    chooseLabel: "Elige una etiqueta",
    chooseReaction: "— reacciona —",
    scrollHint: "↔ Parte de la cuadrícula no se ve. Desplázate de lado para verla entera.",
    showMe: "Muéstrame",
    continueAnyway: "Continuar de todos modos",
    next: "Siguiente",
    emptyOne: "Queda {n} celda vacía.",
    emptyOther: "Quedan {n} celdas vacías.",
    emptyOffscreenOne: "Queda {n} celda vacía, fuera de la pantalla.",
    emptyOffscreenOther: "Quedan {n} celdas vacías, todas fuera de la pantalla.",
    emptySomeOffscreenOne: "Quedan {n} celdas vacías, una de ellas fuera de la pantalla.",
    emptySomeOffscreenOther: "Quedan {n} celdas vacías, {off} de ellas fuera de la pantalla.",
    unreactedOne: "{n} celda prellenada aún no tiene reacción.",
    unreactedOther: "{n} celdas prellenadas aún no tienen reacción.",
    unreactedOffscreenOne: "{n} celda prellenada aún no tiene reacción y está fuera de la pantalla.",
    unreactedOffscreenOther: "{n} celdas prellenadas aún no tienen reacción, todas fuera de la pantalla.",
    unreactedSomeOffscreenOne: "{n} celdas prellenadas aún no tienen reacción, una fuera de la pantalla.",
    unreactedSomeOffscreenOther: "{n} celdas prellenadas aún no tienen reacción, {off} fuera de la pantalla.",
    outlinedOne: "Está marcada en naranja.",
    outlinedOther: "Están marcadas en naranja.",
    remindFillOne: "Puedes llenarla ahora o continuar de todos modos.",
    remindFillOther: "Puedes llenarlas ahora o continuar de todos modos.",
    remindReactOne: "Puedes reaccionar a ella ahora o continuar de todos modos.",
    remindReactOther: "Puedes reaccionar a ellas ahora o continuar de todos modos.",
    requireFill: "Llena todas las celdas marcadas antes de continuar.",
    requireReact: "Reacciona a todas las celdas marcadas antes de continuar.",
    spokenRemindOne: "Usa Muéstrame para encontrarla, o Continuar de todos modos.",
    spokenRemindOther: "Usa Muéstrame para encontrarlas, o Continuar de todos modos.",
    spokenRequireFill: "Llena todas las celdas antes de continuar.",
    spokenRequireReact: "Reacciona a todas las celdas prellenadas antes de continuar.",
    cellEmpty: "Fila {row}, columna {col}: vacía",
    cellLabel: "Fila {row}, columna {col}: {label}",
    cellNoReaction: "Fila {row}, columna {col}: {label}, sin reacción",
    cellReaction: "Fila {row}, columna {col}: {label}, reacción {reaction}",
    dropdownName: "Etiqueta de la fila {row}, columna {col}",
    reactionDropdownName: "Reacción a {label} en la fila {row}, columna {col}",
    chipHelp: "{label}. Elígela para tomarla y luego elige una celda para colocarla.",
    scrollLeft: "Desplazar la cuadrícula a la izquierda",
    scrollRight: "Desplazar la cuadrícula a la derecha",
    scrollLeftEmptyOne: "Desplazar la cuadrícula a la izquierda ({n} celda vacía allí)",
    scrollLeftEmptyOther: "Desplazar la cuadrícula a la izquierda ({n} celdas vacías allí)",
    scrollRightEmptyOne: "Desplazar la cuadrícula a la derecha ({n} celda vacía allí)",
    scrollRightEmptyOther: "Desplazar la cuadrícula a la derecha ({n} celdas vacías allí)",
  };

  // A Spanish text with its placeholders filled in. The last test checks
  // that every text was looked for.
  const seen = new Set<RespondentTextKey>();
  function es(key: RespondentTextKey, values: Record<string, string | number> = {}): string {
    seen.add(key);
    return Object.entries(values).reduce(
      (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
      SPANISH[key],
    );
  }
  const sentences = (...parts: string[]) => parts.join(" ");
  const inSpanish = (config: GridConfig) => withSurvey({ respondentTexts: SPANISH }, config);
  // Three pre-filled cells across the first row.
  const threePrefills = (base = makeConfig()) =>
    experimental({ fixedAssignments: { "r1-c1": "Family", "r1-c2": "Friends", "r1-c3": "Family" } }, base);

  const reminderText = (container: HTMLElement) => reminder(container).firstElementChild!.textContent;
  const spoken = (container: HTMLElement) =>
    container.querySelector<HTMLElement>("[data-griddy-announce]")!.textContent;
  const arrow = (container: HTMLElement, side: "left" | "right") =>
    container.querySelector(`[data-griddy-edge="${side}"] button`)!.getAttribute("aria-label");
  const span = (container: HTMLElement, text: string) =>
    Array.from(container.querySelectorAll("span")).find((s) => s.textContent === text);
  const pickUp = (chip: HTMLElement) => chip.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  const press = (cell: HTMLElement) =>
    cell.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

  /** Lays the 3 × 3 grid out 110 px a column, with the frame showing the
   * columns from `first` to `last` and the others off-screen. */
  function showColumns(container: HTMLElement, first: number, last: number) {
    cells(container).forEach((cell, i) => {
      const left = (i % 3) * 110;
      cell.getBoundingClientRect = () => ({ left, right: left + 100, top: 0, bottom: 120, width: 100, height: 120 }) as DOMRect;
    });
    const left = (first - 1) * 110;
    const right = (last - 1) * 110 + 105;
    container.querySelector<HTMLElement>("[data-griddy-scroller]")!.getBoundingClientRect = () =>
      ({ left, right, top: 0, bottom: 400, width: right - left, height: 400 }) as DOMRect;
  }

  it("shows them on screen and in what screen readers hear, for one cell and for several", () => {
    vi.useFakeTimers();
    const r = run(inSpanish(makeConfig()));
    const c = r.container;
    expect(span(c, es("placing"))).toBeDefined();
    expect(c.querySelector("[data-griddy-scroll-hint]")!.textContent).toBe(es("scrollHint"));
    expect(arrow(c, "left")).toBe(es("scrollLeft"));
    expect(arrow(c, "right")).toBe(es("scrollRight"));
    const grid = cells(c);
    expect(grid[0].getAttribute("aria-label")).toBe(es("cellEmpty", { row: 1, col: 1 }));
    grid[0].click();
    expect(grid[0].getAttribute("aria-label")).toBe(es("cellLabel", { row: 1, col: 1, label: "Family" }));

    button(c, es("next")).click();
    expect(r.nextClicks).toBe(0);
    expect(reminderText(c)).toBe(sentences(es("emptyOther", { n: 7 }), es("outlinedOther"), es("remindFillOther")));
    vi.advanceTimersByTime(60);
    expect(spoken(c)).toBe(sentences(es("emptyOther", { n: 7 }), es("spokenRemindOther")));

    grid.forEach((cell) => cell.click()); // empties r1-c1 again and fills the others
    expect(reminderText(c)).toBe(sentences(es("emptyOne", { n: 1 }), es("outlinedOne"), es("remindFillOne")));
    button(c, es("next")).click();
    vi.advanceTimersByTime(60);
    expect(spoken(c)).toBe(sentences(es("emptyOne", { n: 1 }), es("spokenRemindOne")));
    expect(button(c, es("showMe"))).toBeDefined();
    button(c, es("continueAnyway")).click();
    expect(r.nextClicks).toBe(1);
  });

  it("says how many empty cells are off-screen, and the arrows count them", () => {
    const c = run(inSpanish(makeConfig())).container;
    showColumns(c, 1, 1);
    button(c, es("next")).click();
    // Columns 2 and 3 are off to the right: 5 of the 8 empty cells.
    expect(reminderText(c)).toBe(
      sentences(es("emptySomeOffscreenOther", { n: 8, off: 5 }), es("outlinedOther"), es("remindFillOther")),
    );
    expect(arrow(c, "right")).toBe(es("scrollRightEmptyOther", { n: 5 }));
    const grid = cells(c);
    [1, 2, 5, 7].forEach((i) => grid[i].click());
    expect(reminderText(c)).toBe(
      sentences(es("emptySomeOffscreenOne", { n: 4, off: 1 }), es("outlinedOther"), es("remindFillOther")),
    );
    expect(arrow(c, "right")).toBe(es("scrollRightEmptyOne", { n: 1 }));
    [0, 3, 6].forEach((i) => grid[i].click());
    expect(reminderText(c)).toBe(sentences(es("emptyOffscreenOne", { n: 1 }), es("outlinedOne"), es("remindFillOne")));
  });

  it("says when every empty cell is off-screen, and counts them past the left arrow", () => {
    const c = run(inSpanish(makeConfig())).container;
    showColumns(c, 3, 3);
    const grid = cells(c);
    [2, 5, 8].forEach((i) => grid[i].click()); // column 3, the one in view
    button(c, es("next")).click();
    expect(reminderText(c)).toBe(
      sentences(es("emptyOffscreenOther", { n: 5 }), es("outlinedOther"), es("remindFillOther")),
    );
    expect(arrow(c, "left")).toBe(es("scrollLeftEmptyOther", { n: 5 }));
    [0, 1, 3, 6].forEach((i) => grid[i].click());
    expect(arrow(c, "left")).toBe(es("scrollLeftEmptyOne", { n: 1 }));
  });

  it("asks for every cell when cells are required", () => {
    vi.useFakeTimers();
    const c = run(inSpanish(withSurvey({ skipBehavior: "force" }))).container;
    button(c, es("next")).click();
    expect(reminderText(c)).toBe(sentences(es("emptyOther", { n: 8 }), es("outlinedOther"), es("requireFill")));
    vi.advanceTimersByTime(60);
    expect(spoken(c)).toBe(sentences(es("emptyOther", { n: 8 }), es("spokenRequireFill")));
    expect(button(c, es("continueAnyway")).style.display).toBe("none");
  });

  it("words the drag tray, its chips and a filled cell's clear button", () => {
    const c = run(inSpanish(withSurvey({ selectionMode: "dragdrop" }))).container;
    expect(span(c, es("dragLabel"))).toBeDefined();
    const clearChip = button(c, es("clearCellChip"));
    expect(clearChip.getAttribute("aria-label")).toBe(es("chipHelp", { label: SPANISH.clearCellChip }));
    const family = button(c, "Family");
    expect(family.getAttribute("aria-label")).toBe(es("chipHelp", { label: "Family" }));
    pickUp(family);
    press(cells(c)[0]);
    expect(cells(c)[0].getAttribute("aria-label")).toBe(es("cellLabel", { row: 1, col: 1, label: "Family" }));
    expect(cells(c)[0].querySelector("button")!.title).toBe(es("clearButtonTitle"));
  });

  it("words each dropdown and its empty choice", () => {
    const select = cells(run(inSpanish(withSurvey({ selectionMode: "dropdown" }))).container)[0].querySelector("select")!;
    expect(select.getAttribute("aria-label")).toBe(es("dropdownName", { row: 1, col: 1 }));
    expect(select.options[0].textContent).toBe(es("chooseLabel"));
  });

  it("words an experiment's toolbar, cells and reminder", () => {
    vi.useFakeTimers();
    const c = run(inSpanish(threePrefills())).container;
    expect(span(c, es("reacting"))).toBeDefined();
    const grid = cells(c);
    expect(grid[0].getAttribute("aria-label")).toBe(es("cellNoReaction", { row: 1, col: 1, label: "Family" }));
    grid[0].click();
    expect(grid[0].getAttribute("aria-label")).toBe(
      es("cellReaction", { row: 1, col: 1, label: "Family", reaction: "Agree" }),
    );
    button(c, es("next")).click();
    expect(reminderText(c)).toBe(sentences(es("unreactedOther", { n: 2 }), es("outlinedOther"), es("remindReactOther")));
    vi.advanceTimersByTime(60);
    expect(spoken(c)).toBe(sentences(es("unreactedOther", { n: 2 }), es("spokenRemindOther")));
    grid[1].click();
    expect(reminderText(c)).toBe(sentences(es("unreactedOne", { n: 1 }), es("outlinedOne"), es("remindReactOne")));
  });

  it("says how many pre-filled cells without a reaction are off-screen", () => {
    const c = run(inSpanish(threePrefills())).container;
    showColumns(c, 1, 1);
    button(c, es("next")).click();
    expect(reminderText(c)).toBe(
      sentences(es("unreactedSomeOffscreenOther", { n: 3, off: 2 }), es("outlinedOther"), es("remindReactOther")),
    );
    const grid = cells(c);
    grid[2].click();
    expect(reminderText(c)).toBe(
      sentences(es("unreactedSomeOffscreenOne", { n: 2, off: 1 }), es("outlinedOther"), es("remindReactOther")),
    );
    grid[0].click();
    expect(reminderText(c)).toBe(
      sentences(es("unreactedOffscreenOne", { n: 1 }), es("outlinedOne"), es("remindReactOne")),
    );
  });

  it("says when every pre-filled cell without a reaction is off-screen", () => {
    const c = run(inSpanish(threePrefills())).container;
    showColumns(c, 1, 1);
    cells(c)[0].click();
    button(c, es("next")).click();
    expect(reminderText(c)).toBe(
      sentences(es("unreactedOffscreenOther", { n: 2 }), es("outlinedOther"), es("remindReactOther")),
    );
  });

  it("asks for a reaction to every pre-filled cell when reactions are required", () => {
    vi.useFakeTimers();
    const c = run(inSpanish(threePrefills(withSurvey({ skipBehavior: "force" })))).container;
    button(c, es("next")).click();
    expect(reminderText(c)).toBe(sentences(es("unreactedOther", { n: 3 }), es("outlinedOther"), es("requireReact")));
    vi.advanceTimersByTime(60);
    expect(spoken(c)).toBe(sentences(es("unreactedOther", { n: 3 }), es("spokenRequireReact")));
  });

  it("words an experiment's drag tray and the clear button on a reaction", () => {
    const c = run(inSpanish(threePrefills(withSurvey({ selectionMode: "dragdrop" })))).container;
    expect(span(c, es("dragReaction"))).toBeDefined();
    expect(button(c, es("clearReactionChip")).getAttribute("aria-label")).toBe(
      es("chipHelp", { label: SPANISH.clearReactionChip }),
    );
    pickUp(button(c, "Agree"));
    press(cells(c)[0]);
    expect(cells(c)[0].querySelector("button")!.title).toBe(es("clearButtonTitle"));
  });

  it("words an experiment's dropdowns", () => {
    const grid = cells(run(inSpanish(threePrefills(withSurvey({ selectionMode: "dropdown" })))).container);
    const select = grid[0].querySelector("select")!;
    expect(select.getAttribute("aria-label")).toBe(es("reactionDropdownName", { label: "Family", row: 1, col: 1 }));
    expect(select.options[0].textContent).toBe(es("chooseReaction"));
  });

  it("has looked for every text", () => {
    expect([...seen].sort()).toEqual([...RESPONDENT_TEXT_KEYS].sort());
  });

  it("keeps GRIDDY's English for texts left out or left empty", () => {
    vi.useFakeTimers();
    const c = run(withSurvey({ respondentTexts: { next: "Siguiente", placing: "  ", showMe: "" } })).container;
    expect(span(c, "Placing:")).toBeDefined();
    button(c, "Siguiente").click();
    expect(reminderText(c)).toBe(
      "8 cells are still empty. They are outlined in orange. You can fill them in now or continue anyway.",
    );
    expect(button(c, "Show me")).toBeDefined();
    vi.advanceTimersByTime(60);
    expect(spoken(c)).toBe("8 cells are still empty. Use Show me to find them, or Continue anyway.");
  });

  it("joins sentences without a space after a Chinese or Japanese full stop", () => {
    const c = run(
      withSurvey({
        respondentTexts: {
          emptyOther: "还有 {n} 个格子是空的。",
          outlinedOther: "它们用橙色标出。",
          remindFillOther: "你可以现在填写，也可以继续。",
          next: "下一步",
        },
      }),
    ).container;
    button(c, "下一步").click();
    expect(reminderText(c)).toBe("还有 8 个格子是空的。它们用橙色标出。你可以现在填写，也可以继续。");
  });

  it("shows a label that looks like a placeholder as it is", () => {
    const c = run(withSurvey({ categoriesCsv: "{col}, Friends" })).container;
    cells(c)[0].click();
    expect(cells(c)[0].getAttribute("aria-label")).toBe("Row 1, column 1: {col}");
  });

  it("lets GRIDDY's texts take the direction of their own words, in right-to-left surveys too", () => {
    const c = run(withSurvey({ respondentTexts: { placing: "مكان:" } })).container;
    expect(span(c, "مكان:")!.getAttribute("dir")).toBe("auto");
    expect(c.querySelector("[data-griddy-scroll-hint]")!.getAttribute("dir")).toBe("auto");
    button(c, "Next").click();
    expect(reminder(c).firstElementChild!.getAttribute("dir")).toBe("auto");
  });
});
