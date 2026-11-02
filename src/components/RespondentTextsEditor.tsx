import React, { useId, useRef } from "react";
import { useEditor } from "../EditorContext";
import {
  cleanRespondentTexts,
  DEFAULT_RESPONDENT_TEXTS,
  hasOwnWording,
  missingPlaceholders,
  RESPONDENT_TEXT_INFO,
  respondentTextKeysFor,
  respondentTextSetup,
  unknownPlaceholders,
  type Placeholder,
  type RespondentTextGroup,
  type RespondentTextKey,
  type RespondentTexts,
} from "../lib/respondentTexts";

/** The groups the editor lists texts in. A group's description can depend
 * on the texts it lists. */
const GROUPS: ReadonlyArray<{
  group: RespondentTextGroup;
  title: string;
  desc?: (keys: RespondentTextKey[]) => string;
}> = [
  { group: "screen", title: "ON SCREEN" },
  {
    group: "reminder",
    title: "REMINDER",
    desc: () => "Shown when Next finds cells left to answer: how many, where they are, and what to do.",
  },
  {
    group: "screenReader",
    title: "HEARD WITH A SCREEN READER",
    // Only a grid with a reminder has a spoken one.
    desc: (keys) =>
      keys.some((key) => key.startsWith("spoken"))
        ? "Not shown on screen. The spoken reminder starts with the same “How many” sentence."
        : "Not shown on screen.",
  },
];

/** "a", "a and b", "a, b and c". */
function listOf(items: string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const TextField: React.FC<{
  textKey: RespondentTextKey;
  value: string;
  onChange: (value: string) => void;
}> = ({ textKey, value, onChange }) => {
  const id = useId();
  // The box, input or textarea, that Reset gives focus to.
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const info = RESPONDENT_TEXT_INFO[textKey];
  const english = DEFAULT_RESPONDENT_TEXTS[textKey];
  const own = hasOwnWording(value);
  const fills = Object.entries(info.fills ?? {}) as Array<[Placeholder, string]>;
  // A text without a placeholder it needs still exports; the note only says
  // what respondents would miss.
  const missing = own ? missingPlaceholders(textKey, value) : [];
  const unknown = own ? unknownPlaceholders(textKey, value) : [];
  const describedBy = [
    fills.length > 0 ? `${id}-fills` : "",
    missing.length > 0 ? `${id}-missing` : "",
    unknown.length > 0 ? `${id}-unknown` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const inputCls =
    "w-full rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-[12.5px] text-ink focus:border-accent focus:outline-none";
  const field = {
    id,
    ref: fieldRef,
    value,
    placeholder: english,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    "aria-describedby": describedBy || undefined,
    className: inputCls,
  };

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[11.5px] font-semibold text-ink">
          {info.label}
        </label>
        {own && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              // The button goes away with the wording, so focus moves to
              // the box instead of the page.
              fieldRef.current?.focus();
            }}
            aria-label={`Reset ${info.label} to English`}
            title="Use GRIDDY's English again"
            className="flex-shrink-0 text-[11px] font-bold text-accent hover:underline"
          >
            Reset
          </button>
        )}
      </div>
      {english.length > 40 ? (
        <textarea {...field} rows={2} className={`${inputCls} resize-none`} />
      ) : (
        <input {...field} type="text" />
      )}
      {own && <p className="mt-0.5 text-[11px] text-ink-faint">English: {english}</p>}
      {fills.length > 0 && (
        <p id={`${id}-fills`} className="mt-0.5 text-[11px] text-ink-faint">
          {fills.map(([name, meaning], i) => (
            <span key={name}>
              {i > 0 && " · "}
              <code className="font-mono text-ink-muted">{`{${name}}`}</code> {meaning}
            </span>
          ))}
        </p>
      )}
      {missing.length > 0 && (
        <p id={`${id}-missing`} role="status" className="mt-0.5 text-[11px] font-semibold text-amber-700">
          Missing {listOf(missing.map((name) => `{${name}} (${info.fills?.[name] ?? ""})`))}.
        </p>
      )}
      {unknown.length > 0 && (
        <p id={`${id}-unknown`} role="status" className="mt-0.5 text-[11px] font-semibold text-amber-700">
          {listOf(unknown.map((name) => `{${name}}`))}{" "}
          {unknown.length === 1
            ? "is not filled in here, so respondents see it as typed."
            : "are not filled in here, so respondents see them as typed."}
        </p>
      )}
    </div>
  );
};

/**
 * "Words shown to respondents": this grid's own wording for the texts GRIDDY
 * adds around it, listing only those the grid's answer mode, labels,
 * experiment and empty-cell setting use. A box left empty keeps GRIDDY's
 * English.
 */
export default function RespondentTextsEditor() {
  const {
    state: { config },
    dispatch,
  } = useEditor();
  const own: RespondentTexts = config.survey.respondentTexts ?? {};
  const keys = respondentTextKeysFor(respondentTextSetup(config));
  const changed = keys.filter((key) => hasOwnWording(own[key])).length;
  const hasCounts = keys.some((key) => key.endsWith("One"));

  const setText = (key: RespondentTextKey, value: string) => {
    // Only texts with wording, in the editor's order, so clearing a text and
    // typing it again leaves the survey as it was.
    dispatch({
      type: "updateSurvey",
      patch: { respondentTexts: cleanRespondentTexts({ ...own, [key]: value }) },
    });
  };

  return (
    <details className="mt-4 rounded-xl border border-hairline bg-white">
      <summary className="cursor-pointer px-3.5 py-2.5 text-ink-faint">
        <span className="text-[10px] font-bold tracking-widest">WORDS SHOWN TO RESPONDENTS</span>{" "}
        <span className="text-[11.5px] text-ink-muted">
          {changed > 0 ? `· ${changed} changed` : "· English"}
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-hairline px-3.5 pb-3.5 pt-3">
        <div className="flex flex-col gap-1.5 text-[11.5px] leading-snug text-ink-muted">
          <p>
            GRIDDY adds these words around the grid, in English. Qualtrics&apos;
            Translate tool does not reach them, so to run the survey in another
            language, write them here. An empty box uses the English shown in
            it. Respondent preview shows the result.
          </p>
          {hasCounts && (
            <p>
              Counts have one text for 1 and one for 2 or more. For a language
              with more plural forms, such as Polish or Arabic, word both so
              they fit any number, for example “Empty cells: {"{n}"}.”
            </p>
          )}
        </div>
        {GROUPS.map(({ group, title, desc }) => {
          const groupKeys = keys.filter((key) => RESPONDENT_TEXT_INFO[key].group === group);
          if (groupKeys.length === 0) return null;
          return (
            <fieldset key={group}>
              <legend className="text-[10px] font-bold tracking-widest text-ink-faint">{title}</legend>
              {desc && <p className="mt-0.5 text-[11.5px] leading-snug text-ink-muted">{desc(groupKeys)}</p>}
              <div className="mt-2.5 flex flex-col gap-3">
                {groupKeys.map((key) => (
                  <TextField
                    key={key}
                    textKey={key}
                    value={own[key] ?? ""}
                    onChange={(value) => setText(key, value)}
                  />
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    </details>
  );
}
