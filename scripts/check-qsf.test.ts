// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { GridConfig } from "../src/grid-types";
import { buildQualtricsQsf, type QualtricsQsfItem } from "../src/lib/qualtricsExport";

const script = fileURLToPath(new URL("./check-qsf.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "griddy-check-qsf-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** What check-qsf.mjs says about a .qsf file, and its exit code. */
function check(name: string, qsf: string): { output: string; status: number | null } {
  const file = join(dir, `${name}.qsf`);
  writeFileSync(file, qsf);
  const run = spawnSync(process.execPath, [script, file], { encoding: "utf8" });
  return { output: run.stdout, status: run.status };
}

/** A 3 × 3 grid answered by painting two labels. */
function grid(name: string): GridConfig {
  return {
    id: name,
    name,
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
  };
}

/** The file as an older GRIDDY made it: each script saves its fields with
 * setEmbeddedData under their plain names, which the Survey Flow declares. */
function fromOlderGriddy(qsf: string): string {
  const doc = JSON.parse(qsf);
  for (const el of doc.SurveyElements) {
    if (el.Element === "SQ") {
      const js: string = el.Payload.QuestionJS;
      el.Payload.QuestionJS = js.split('saveField("').join('Qualtrics.SurveyEngine.setEmbeddedData("');
    }
    if (el.Element === "FL") {
      for (const step of el.Payload.Flow) {
        for (const field of step.EmbeddedData ?? []) {
          field.Field = field.Field.replace(/^__js_/, "");
          field.Description = field.Field;
        }
      }
    }
  }
  return JSON.stringify(doc);
}

const twoGrids = (fields: Array<Partial<QualtricsQsfItem>> = [{}, {}]) =>
  buildQualtricsQsf(fields.map((f, i) => ({ title: `Grid ${i + 1}`, config: grid(`grid-${i + 1}`), ...f })));
const ownFields = [{ embeddedDataField: "GridAssignments_A" }, { embeddedDataField: "GridAssignments_B" }];

describe("check-qsf.mjs", () => {
  it("passes grids that save fields of their own under the __js_ names", () => {
    const { output, status } = check("fresh", twoGrids(ownFields));
    expect(output).toContain(
      "every field the scripts save is declared under its __js_ name: __js_GridAssignments_A, __js_GridAssignments_B",
    );
    expect(output).toContain("ok    no field is saved by more than one question");
    expect(output).toContain(" 0 failed");
    expect(status).toBe(0);
  });

  it("reports a field two grids save", () => {
    const { output, status } = check("fresh-shared", twoGrids());
    expect(output).toContain(
      "FAIL  fields saved by several questions (later grids overwrite earlier answers): __js_GridAssignments",
    );
    expect(status).toBe(1);
  });

  it("reports a field two grids from an older GRIDDY save, and nothing about __js_ names", () => {
    const { output, status } = check("older-shared", fromOlderGriddy(twoGrids()));
    expect(output).toContain("made by an older GRIDDY, which saves GridAssignments with setEmbeddedData");
    expect(output).toContain(
      "FAIL  fields saved by several questions (later grids overwrite earlier answers): GridAssignments",
    );
    expect(output).not.toContain("no field is saved by more than one question");
    expect(output).not.toContain("__js_ name");
    expect(status).toBe(1);
  });

  it("checks the fields of grids from an older GRIDDY that save fields of their own", () => {
    const { output } = check("older-separate", fromOlderGriddy(twoGrids(ownFields)));
    expect(output).toContain("ok    no field is saved by more than one question");
    expect(output).not.toContain("__js_ name");
    expect(output).not.toContain("declared but never saved");
  });
});
