import { describe, expect, it } from "vitest";
import { findFieldCollision } from "./combineFields";
import type { QualtricsQsfItem } from "./qualtricsExport";
import type { GridConfig } from "../grid-types";

const config = { layout: {}, tuning: {}, survey: {} } as unknown as GridConfig;
const item = (field: string): QualtricsQsfItem => ({ title: field, config, embeddedDataField: field });

describe("findFieldCollision", () => {
  it("accepts questions whose fields differ", () => {
    expect(findFieldCollision([item("A"), item("B")], ["One", "Two"])).toBeNull();
  });

  it("catches two questions with the same name writing to the same field", () => {
    const message = findFieldCollision([item("GridAssignments_Map"), item("GridAssignments_Map")], ["Map", "Map"]);
    expect(message).toContain("Questions 1 (\"Map\") and 2 (\"Map\")");
    // The field as Qualtrics records it, the name the page shows.
    expect(message).toContain('both write to the field "__js_GridAssignments_Map"');
  });
});
