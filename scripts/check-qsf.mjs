#!/usr/bin/env node
/**
 * check-qsf.mjs: sanity-check a GRIDDY-exported .qsf before importing it into
 * Qualtrics, and compare it with the design that was built in the editor.
 *
 *   node scripts/check-qsf.mjs path/to/export.qsf
 *   node scripts/check-qsf.mjs export.qsf --rows 3 --cols 3 \
 *       --categories "Family, Friends, Coworkers, Neighbors" --mode paint
 *
 * Options (all optional; each one adds a check against question --q, default 1):
 *   --q N                1-based question to compare the expectations with
 *   --questions N        expected number of grid questions in the file
 *   --name "Title"       expected survey name
 *   --question-text "…"  expected question text
 *   --rows N / --cols N  expected grid size
 *   --categories "A, B"  expected category labels, in order
 *   --mode paint|dropdown|dragdrop
 *   --experimental yes|no
 *   --fields "A, B"      expected embedded-data fields declared in the Survey Flow
 *
 * Exit code 0 = every check passed (warnings allowed), 1 = at least one failure,
 * 2 = usage error. No dependencies; Node 22 or newer.
 */
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const file = argv.find((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1].startsWith("--")));
if (!file) {
  console.error("usage: node scripts/check-qsf.mjs <export.qsf> [options]  (see the header of this file)");
  process.exit(2);
}
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};

const results = [];
const pass = (msg) => results.push(["PASS", msg]);
const fail = (msg) => results.push(["FAIL", msg]);
const warn = (msg) => results.push(["WARN", msg]);
const info = (msg) => results.push(["INFO", msg]);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const csv = (s) => String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function report() {
  const counts = { PASS: 0, FAIL: 0, WARN: 0, INFO: 0 };
  const mark = { PASS: "ok  ", FAIL: "FAIL", WARN: "warn", INFO: "    " };
  for (const [kind, msg] of results) {
    counts[kind]++;
    console.log(`${mark[kind]}  ${msg}`);
  }
  console.log(`\n${counts.PASS} passed, ${counts.FAIL} failed, ${counts.WARN} warnings  (${file})`);
  process.exit(counts.FAIL > 0 ? 1 : 0);
}

/** Return the JSON object/array literal that starts at src[start] ("{" or "["). */
function extractLiteral(src, start) {
  const open = src[start];
  if (open !== "{" && open !== "[") throw new Error(`expected { or [ at ${start}`);
  let depth = 0;
  let inString = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unterminated literal");
}

function configFromScript(js) {
  const single = js.indexOf("var cfg = ");
  if (single >= 0) {
    const lit = extractLiteral(js, js.indexOf("{", single));
    return { kind: "single", configs: [JSON.parse(lit)] };
  }
  const multi = js.indexOf("var steps = ");
  if (multi >= 0) {
    const lit = extractLiteral(js, js.indexOf("[", multi));
    return { kind: "steps", configs: JSON.parse(lit) };
  }
  throw new Error("no `var cfg = {...}` or `var steps = [...]` found");
}

// ---------------------------------------------------------------- 1. parse
let raw;
try {
  raw = readFileSync(file, "utf8");
} catch (e) {
  fail(`cannot read ${file}: ${e.message}`);
  report();
}
let qsf;
try {
  qsf = JSON.parse(raw);
  pass(`parses as JSON (${kb(raw.length)})`);
} catch (e) {
  fail(`not valid JSON: ${e.message}`);
  report();
}

// --------------------------------------------------------- 2. survey entry
const entry = qsf.SurveyEntry ?? {};
const entryKeys = ["SurveyID", "SurveyName", "SurveyBrandID", "SurveyLanguage", "SurveyStatus", "SurveyActiveResponseSet"];
const missing = entryKeys.filter((k) => typeof entry[k] !== "string" || entry[k].length === 0);
if (missing.length === 0) pass(`SurveyEntry complete: "${entry.SurveyName}" (${entry.SurveyID}, brand ${entry.SurveyBrandID})`);
else fail(`SurveyEntry missing or empty: ${missing.join(", ")}`);
if (flag("name") !== undefined) {
  if (entry.SurveyName === flag("name")) pass(`survey name is "${flag("name")}"`);
  else fail(`survey name is "${entry.SurveyName}", expected "${flag("name")}"`);
}

// --------------------------------------------------------- 3. element set
const elements = Array.isArray(qsf.SurveyElements) ? qsf.SurveyElements : [];
const byType = {};
for (const el of elements) (byType[el.Element] ??= []).push(el);
const singletons = ["BL", "FL", "SO", "PL", "PROJ", "QC", "QG", "QGO", "RS", "SCO", "STAT"];
const badSingletons = singletons.filter((t) => (byType[t] ?? []).length !== 1);
if (badSingletons.length === 0) pass(`all ${singletons.length} structural elements present exactly once`);
else fail(`structural elements missing or duplicated: ${badSingletons.join(", ")}`);

const questions = byType.SQ ?? [];
if (questions.length > 0) pass(`${questions.length} question element(s) (SQ)`);
else fail("no question elements (SQ) in the file");
const qc = byType.QC?.[0]?.SecondaryAttribute;
if (String(qc) === String(questions.length)) pass(`question count element says ${qc}`);
else fail(`question count element says ${qc}, but there are ${questions.length} questions`);
if (flag("questions") !== undefined) {
  if (questions.length === Number(flag("questions"))) pass(`expected ${flag("questions")} question(s)`);
  else fail(`expected ${flag("questions")} question(s), found ${questions.length}`);
}

const surveyIds = new Set(elements.map((el) => el.SurveyID));
if (surveyIds.size === 1 && surveyIds.has(entry.SurveyID)) pass("every element carries the survey's ID");
else fail(`elements carry ${surveyIds.size} different SurveyID values`);

// ------------------------------------------------------ 4. blocks and flow
const blocks = Array.isArray(byType.BL?.[0]?.Payload) ? byType.BL[0].Payload : Object.values(byType.BL?.[0]?.Payload ?? {});
const questionIds = questions.map((q) => q.PrimaryAttribute);
const blockQuestionIds = blocks.flatMap((b) => (b.BlockElements ?? []).filter((e) => e.Type === "Question").map((e) => e.QuestionID));
if (same([...blockQuestionIds].sort(), [...questionIds].sort())) pass(`${blocks.length} block(s) reference exactly the ${questions.length} question(s)`);
else fail(`block question IDs ${JSON.stringify(blockQuestionIds)} do not match questions ${JSON.stringify(questionIds)}`);
const defaults = blocks.filter((b) => b.Type === "Default").length;
if (defaults === 1) pass("exactly one Default block");
else fail(`${defaults} blocks of Type "Default" (Qualtrics wants exactly one)`);

const flow = byType.FL?.[0]?.Payload?.Flow ?? [];
const flowBlockIds = flow.filter((f) => f.Type === "Block").map((f) => f.ID);
if (same(flowBlockIds, blocks.map((b) => b.ID))) pass("Survey Flow walks every block, in block order");
else fail(`Survey Flow blocks ${JSON.stringify(flowBlockIds)} differ from defined blocks ${JSON.stringify(blocks.map((b) => b.ID))}`);
const declaredFields = flow.filter((f) => f.Type === "EmbeddedData").flatMap((f) => (f.EmbeddedData ?? []).map((e) => e.Field));
if (declaredFields.length > 0) pass(`embedded-data fields declared in the Survey Flow: ${declaredFields.join(", ")}`);
else fail("no embedded-data fields declared in the Survey Flow (answers would not be saved)");
if (flow.length > 0 && flow[0].Type !== "EmbeddedData") warn("the embedded-data element is not first in the Survey Flow");
if (flag("fields") !== undefined) {
  if (same([...declaredFields].sort(), csv(flag("fields")).sort())) pass(`declared fields match expectation`);
  else fail(`declared fields ${JSON.stringify(declaredFields)} differ from expected ${JSON.stringify(csv(flag("fields")))}`);
}

// --------------------------------------------------------- 5. each question
const usedFields = [];
const summaries = [];
questions.forEach((q, index) => {
  const n = index + 1;
  const p = q.Payload ?? {};
  const label = `Q${n} ${JSON.stringify(String(p.QuestionText ?? "").slice(0, 50))}`;
  if (p.QuestionType === "DB" && p.Selector === "TB") pass(`${label}: Text/Graphic question (DB/TB)`);
  else fail(`${label}: QuestionType/Selector is ${p.QuestionType}/${p.Selector}, expected DB/TB`);
  if (p.QuestionID !== q.PrimaryAttribute) fail(`${label}: Payload.QuestionID ${p.QuestionID} differs from element ID ${q.PrimaryAttribute}`);

  const js = typeof p.QuestionJS === "string" ? p.QuestionJS : "";
  if (js.length === 0) {
    fail(`${label}: no JavaScript attached`);
    return;
  }
  info(`${label}: JavaScript ${kb(js.length)}`);
  if (js.length > 1024 * 1024) warn(`${label}: JavaScript is over 1 MB; Qualtrics may refuse or truncate very large question scripts`);

  if (js.startsWith("/*") && js.includes("MIT License") && js.includes("Copyright (c) 2026 Justin Lucas Sola")) pass(`${label}: starts with the MIT notice`);
  else fail(`${label}: MIT notice missing from the top of the script`);
  if (js.includes("Qualtrics.SurveyEngine.addOnReady")) pass(`${label}: registers an addOnReady handler`);
  else fail(`${label}: no Qualtrics.SurveyEngine.addOnReady call`);
  try {
    new Function(js); // parse only
    pass(`${label}: JavaScript parses`);
  } catch (e) {
    fail(`${label}: JavaScript does not parse: ${e.message}`);
  }

  let parsed;
  try {
    parsed = configFromScript(js);
  } catch (e) {
    fail(`${label}: cannot read the embedded grid config: ${e.message}`);
    return;
  }

  // Which embedded-data fields will this script actually write? The single-grid
  // script keeps both branches of persistAll() (experimental and standard), so
  // read the field names from the branch the config enables. Multi-step scripts
  // write each step's own embeddedDataField.
  const literals = (s) => [...s.matchAll(/setEmbeddedData\((\"(?:[^"\\]|\\.)*\")/g)].map((m) => JSON.parse(m[1]));
  if (parsed.kind === "single") {
    const start = js.indexOf("function persistAll()");
    const fn = start >= 0 ? js.slice(start, js.indexOf("\n\t}", start) + 3) : "";
    const [experimentalBranch, standardBranch = ""] = fn.split("} else {");
    const live = parsed.configs[0]?.experimental?.enabled ? literals(experimentalBranch) : literals(standardBranch);
    if (live.length === 0) fail(`${label}: could not find the setEmbeddedData call that saves the answers`);
    for (const field of live) usedFields.push({ q: n, field });
  } else {
    for (const step of parsed.configs) if (step.embeddedDataField) usedFields.push({ q: n, field: step.embeddedDataField });
  }
  parsed.configs.forEach((cfg, stepIndex) => {
    const layout = cfg.layout ?? {};
    const survey = cfg.survey ?? {};
    const exp = cfg.experimental ?? null;
    const cats = csv(survey.categoriesCsv);
    const blocked = Object.keys(layout.blockedCells ?? {}).length;
    const stepLabel = parsed.kind === "steps" ? `${label} step ${stepIndex + 1}` : label;
    const dataUrls = [layout.backgroundImageUrl, ...Object.values(survey.categoryMeta ?? {}).map((m) => m?.imageUrl), ...Object.values(layout.barrierMeta ?? {}).map((m) => m?.imageUrl), ...Object.values(exp?.responseLabelMeta ?? {}).map((m) => m?.imageUrl)].filter((u) => typeof u === "string" && u.startsWith("data:"));
    const summary = [
      `${layout.rows}x${layout.cols}`,
      layout.includeCenterCell ? `centre "${layout.centerCellLabel}"` : "no centre cell",
      `categories [${cats.join(", ")}]`,
      `${survey.selectionMode}${survey.allowInteraction ? "" : " (interaction off)"}`,
      exp?.enabled ? `experimental ${exp.prefillMode}, labels [${csv(exp.responseLabelsCsv).join(", ")}]` : "standard",
      blocked ? `${blocked} blocked cell(s)` : "no barriers",
      dataUrls.length ? `${dataUrls.length} embedded image(s), ${kb(dataUrls.reduce((s, u) => s + u.length, 0))}` : "no embedded images",
    ].join("; ");
    info(`${stepLabel}: ${summary}`);
    summaries.push({ q: n, layout, survey, exp, cats });
  });
});

// ------------------------------------------- 6. fields used versus declared
const used = [...new Set(usedFields.map((u) => u.field))];
const undeclared = used.filter((f) => !declaredFields.includes(f));
if (undeclared.length === 0) pass(`every field the scripts write is declared: ${used.join(", ") || "(none)"}`);
else fail(`scripts write undeclared fields (answers would be lost): ${undeclared.join(", ")}`);
const unused = declaredFields.filter((f) => !used.includes(f));
if (unused.length > 0 && questions.every((q) => !String(q.Payload?.QuestionJS).includes("var steps = "))) warn(`declared but never written: ${unused.join(", ")}`);
const fieldOwners = {};
for (const { q, field } of usedFields) (fieldOwners[field] ??= new Set()).add(q);
const shared = Object.entries(fieldOwners).filter(([, qs]) => qs.size > 1).map(([f]) => f);
if (shared.length === 0) pass("no field is written by more than one question");
else fail(`fields written by several questions (later grids overwrite earlier answers): ${shared.join(", ")}`);

// --------------------------------------------- 7. expectations for one grid
const target = summaries.find((s) => s.q === Number(flag("q") ?? 1));
const expect = (name, actual, wanted, pretty = (v) => JSON.stringify(v)) => {
  if (wanted === undefined) return;
  if (!target) return fail(`cannot check --${name}: question ${flag("q") ?? 1} has no readable config`);
  if (same(actual, wanted)) pass(`Q${target.q} ${name} is ${pretty(actual)}`);
  else fail(`Q${target.q} ${name} is ${pretty(actual)}, expected ${pretty(wanted)}`);
};
expect("rows", target?.layout.rows, flag("rows") === undefined ? undefined : Number(flag("rows")));
expect("cols", target?.layout.cols, flag("cols") === undefined ? undefined : Number(flag("cols")));
expect("categories", target?.cats, flag("categories") === undefined ? undefined : csv(flag("categories")), (v) => `[${(v ?? []).join(", ")}]`);
expect("mode", target?.survey.selectionMode, flag("mode"));
expect("experimental", target ? (target.exp?.enabled ? "yes" : "no") : undefined, flag("experimental"));
expect("question-text", target?.layout.questionText, flag("question-text"));

report();
