import { describe, it, expect } from "vitest";
import { buildQualtricsSnippet } from "./qualtricsExport";
import type { GridConfig } from "../grid-types";

/**
 * What respondents experience in Qualtrics: the frame that keeps the designed
 * grid size, the empty-cell check on Next, and what reaches embedded data.
 * Each test runs the exported script in jsdom against a stub of the Qualtrics
 * engine that records what the script does.
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

interface Run {
  container: HTMLElement;
  embedded: Record<string, string>;
  nextClicks: number;
  nativeNextHidden: boolean;
}

function run(config: GridConfig): Run {
  const result: Run = {
    container: document.createElement("div"),
    embedded: {},
    nextClicks: 0,
    nativeNextHidden: false,
  };
  const readyCallbacks: Array<() => void> = [];
  (globalThis as unknown as { Qualtrics: unknown }).Qualtrics = {
    SurveyEngine: {
      addOnload: () => {},
      addOnReady: (cb: () => void) => readyCallbacks.push(cb),
      addOnUnload: () => {},
      setEmbeddedData: (field: string, value: string) => {
        result.embedded[field] = value;
      },
    },
  };
  document.body.appendChild(result.container);
  const question = {
    getQuestionTextContainer: () => result.container,
    clickNextButton: () => {
      result.nextClicks += 1;
    },
    hideNextButton: () => {
      result.nativeNextHidden = true;
    },
  };
  new Function(buildQualtricsSnippet(config))();
  readyCallbacks.forEach((cb) => cb.call(question));
  return result;
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

describe("the grid keeps its designed size", () => {
  it("puts the grid, at its designed width and height, in a frame that scrolls sideways", () => {
    const { container } = run(makeConfig());
    const scroller = container.querySelector<HTMLElement>("[data-griddy-scroller]");
    expect(scroller).not.toBeNull();
    const wrapper = scroller!.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe("550px");
    expect(wrapper.style.height).toBe("550px");
    expect(container.querySelectorAll("[data-griddy-edge]")).toHaveLength(2);
    expect(container.querySelector("[data-griddy-scroll-hint]")).not.toBeNull();
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

  it("lets respondents go straight on when the researcher allows empty cells", () => {
    const r = run(withSurvey({ skipBehavior: "allow" }));
    button(r.container, "Next").click();
    expect(r.nextClicks).toBe(1);
    expect(r.nativeNextHidden).toBe(false);
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

  it("does not check a grid that respondents only look at", () => {
    const r = run(withSurvey({ allowInteraction: false }));
    expect(r.nativeNextHidden).toBe(false);
    button(r.container, "Next").click();
    expect(r.nextClicks).toBe(1);
  });
});

describe("what is recorded", () => {
  it("records an empty answer as soon as the grid is shown", () => {
    expect(run(makeConfig()).embedded.GridAssignments).toBe("{}");
  });

  it("records the pre-fills a respondent was shown before any reaction", () => {
    const r = run(experimental());
    expect(JSON.parse(r.embedded.GridPrefills)).toEqual({ "r1-c1": "Family" });
    expect(r.embedded.GridResponses).toBe("{}");
  });

  it("never shuffles a pre-fill into the centre cell or outside the grid", () => {
    const r = run(experimental({ prefillMode: "shuffle" }));
    expect(Object.keys(JSON.parse(r.embedded.GridPrefills))).toEqual(["r1-c1"]);
  });
});

describe("reactions in an experiment", () => {
  it("accepts reactions only on pre-filled cells", () => {
    const r = run(experimental());
    const grid = cells(r.container);
    grid[1].click(); // r1-c2 has no pre-fill
    expect(JSON.parse(r.embedded.GridResponses)).toEqual({});
    grid[0].click(); // r1-c1 shows Family
    expect(JSON.parse(r.embedded.GridResponses)).toEqual({ "r1-c1": "Agree" });
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
    expect(JSON.parse(r.embedded.GridAssignments)).toEqual({ "r1-c1": "Family" });
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
    expect(JSON.parse(r.embedded.GridAssignments)).toEqual({});
    drop("Friends");
    expect(JSON.parse(r.embedded.GridAssignments)).toEqual({ "r1-c1": "Friends" });
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
    expect(JSON.parse(r.embedded.GridAssignments)).toEqual({ "r1-c1": "Friends" });
    expect(ghosts()).toHaveLength(0);
  });

  it("drops a reaction only on a pre-filled cell", () => {
    const r = run(experimental({}, withSurvey({ selectionMode: "dragdrop" })));
    fingerDrag(button(r.container, "Agree"), cells(r.container)[1]); // no pre-fill
    expect(JSON.parse(r.embedded.GridResponses)).toEqual({});
    fingerDrag(button(r.container, "Agree"), cells(r.container)[0]); // shows Family
    expect(JSON.parse(r.embedded.GridResponses)).toEqual({ "r1-c1": "Agree" });
  });

  it("leaves mouse drags to the browser's own drag and drop", () => {
    const r = run(withSurvey({ selectionMode: "dragdrop" }));
    fingerDrag(button(r.container, "Friends"), cells(r.container)[0], "mouse");
    expect(JSON.parse(r.embedded.GridAssignments)).toEqual({});
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
