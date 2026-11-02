import { describe, expect, it } from "vitest";
import {
  cleanRespondentTexts,
  DEFAULT_RESPONDENT_TEXTS,
  missingPlaceholders,
  RESPONDENT_TEXT_INFO,
  RESPONDENT_TEXT_KEYS,
  respondentTextKeysFor,
  unknownPlaceholders,
  type RespondentTextSetup,
} from "./respondentTexts";

const setup = (patch: Partial<RespondentTextSetup> = {}): RespondentTextSetup => ({
  selectionMode: "paint",
  experiment: false,
  skipBehavior: "remind",
  ...patch,
});

describe("GRIDDY's English texts", () => {
  it("keep every placeholder they need and use only ones the script fills in", () => {
    for (const key of RESPONDENT_TEXT_KEYS) {
      expect(missingPlaceholders(key, DEFAULT_RESPONDENT_TEXTS[key]), key).toEqual([]);
      expect(unknownPlaceholders(key, DEFAULT_RESPONDENT_TEXTS[key]), key).toEqual([]);
    }
  });

  it("come in pairs, one for 1 and one for more, wherever a count appears", () => {
    for (const key of RESPONDENT_TEXT_KEYS.filter((k) => k.endsWith("One"))) {
      const other = key.replace(/One$/, "Other") as keyof typeof RESPONDENT_TEXT_INFO;
      expect(RESPONDENT_TEXT_INFO[other], key).toBeDefined();
      expect(RESPONDENT_TEXT_INFO[other].usedBy(setup()), key).toBe(RESPONDENT_TEXT_INFO[key].usedBy(setup()));
    }
  });
});

describe("which texts a grid uses", () => {
  it("follows the answer mode, the experiment and the empty-cell setting", () => {
    expect(respondentTextKeysFor(setup())).toEqual(
      expect.arrayContaining(["placing", "next", "continueAnyway", "emptyOther", "remindFillOther", "cellLabel"]),
    );
    expect(respondentTextKeysFor(setup())).not.toContain("requireFill");
    expect(respondentTextKeysFor(setup({ skipBehavior: "force" }))).not.toContain("continueAnyway");
    expect(respondentTextKeysFor(setup({ skipBehavior: "allow" }))).toEqual([
      "placing",
      "scrollHint",
      "cellEmpty",
      "cellLabel",
      "scrollLeft",
      "scrollRight",
    ]);
    const reactions = respondentTextKeysFor(setup({ experiment: true, selectionMode: "dropdown" }));
    expect(reactions).toEqual(expect.arrayContaining(["chooseReaction", "reactionDropdownName", "unreactedOther"]));
    expect(reactions).not.toContain("chooseLabel");
    expect(reactions).not.toContain("cellNoReaction");
  });
});

describe("placeholder checks", () => {
  it("name the placeholders a text has lost, and the ones it cannot use", () => {
    expect(missingPlaceholders("cellLabel", "Fila {row}: {label}")).toEqual(["col"]);
    expect(missingPlaceholders("emptyOne", "Queda una celda vacía.")).toEqual([]);
    expect(unknownPlaceholders("emptyOther", "{n} celdas, {off} fuera, {n}")).toEqual(["off"]);
    expect(unknownPlaceholders("emptySomeOffscreenOther", "{n} celdas, {off} fuera")).toEqual([]);
  });
});

describe("cleanRespondentTexts", () => {
  it("returns the same wording when there is nothing to drop", () => {
    const texts = { next: "Siguiente" };
    expect(cleanRespondentTexts(texts)).toBe(texts);
    expect(cleanRespondentTexts(undefined)).toBeUndefined();
  });
});
