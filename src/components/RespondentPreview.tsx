import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import PreviewViewChoice, { type PreviewViewOption } from "./PreviewViewChoice";
import { GRID_BORDERS, MAX_CELL_SIZE, MAX_GRID_SIZE, PHONE_WIDTH } from "../lib/gridSize";
import { type RespondentView, useClientWidth } from "../lib/previewView";

/** The preview page's 8 px padding, on both sides. */
const PAGE_PADDING = 16;
/** Room the preview page needs beside the grid: the grid's 1 px border and
 * the page's padding, on both sides. */
const PAGE_ROOM = GRID_BORDERS + PAGE_PADDING;
/** The preview frame's own 1 px borders. */
const FRAME_BORDERS = 2;
/** The page in the Phone view: the width Qualtrics' phone view leaves for
 * the grid, and the page's padding. The frame's borders go outside it, so
 * the question gets exactly that width even where a screen's scaling draws
 * a 1 px border thinner. */
const PHONE_PAGE_WIDTH = PHONE_WIDTH + PAGE_PADDING;
/** Only a guard against a page that keeps growing: taller than any page a
 * grid makes, 10 rows of 600 px cells 10 px apart with their border, plus
 * 2000 px for the question, the buttons and the reminder. */
const MAX_FRAME_HEIGHT = MAX_GRID_SIZE * MAX_CELL_SIZE + (MAX_GRID_SIZE - 1) * 10 + GRID_BORDERS + 2000;

const VIEW_OPTIONS: readonly PreviewViewOption<RespondentView>[] = [
  { value: "desktop", label: "Desktop", title: "Full size, as on a computer" },
  {
    value: "phone",
    label: "Phone",
    title: `Full size, as in Qualtrics' phone view: ${PHONE_WIDTH} px for the grid`,
  },
  { value: "fit", label: "Fit", title: "Zoomed out so the whole grid fits this panel" },
];

function previewDocument(snippet: string): string {
  // Keep user-authored text inside a JS string, including literal </script>.
  const source = JSON.stringify(snippet).replace(/</g, "\\u003c");
  // The page never shows a scrollbar of its own: one shown for a moment,
  // before the editor makes the frame as tall as the page, would narrow the
  // page and make a grid that fits overflow.
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html { scrollbar-width: none; } html::-webkit-scrollbar { display: none; } body { margin: 0; padding: 8px; background: white; } #finished { font: 14px sans-serif; color: #2a241c; }</style>
</head><body><div id="question"></div><p id="finished" role="status" hidden></p>
<script>
var question = {
  getQuestionTextContainer: function () { return document.getElementById("question"); },
  hideNextButton: function () {},
  showNextButton: function () {},
  clickNextButton: function () {
    var status = document.getElementById("finished");
    status.hidden = false;
    status.textContent = "Preview complete. In Qualtrics, Next continues the survey.";
  }
};
window.Qualtrics = { SurveyEngine: {
  addOnload: function (callback) { callback.call(question); },
  addOnReady: function (callback) { callback.call(question); },
  addOnUnload: function () {},
  setEmbeddedData: function () {}
} };
var renderer = document.createElement("script");
renderer.textContent = ${source};
document.body.appendChild(renderer);
// The page is drawn at full size, as respondents see it. The editor sizes
// this frame to the page and, for Fit, scales the whole frame down.
new ResizeObserver(function () {
  parent.postMessage({ type: "griddy-preview-height", height: document.body.getBoundingClientRect().height }, "*");
}).observe(document.body);
</script></body></html>`;
}

interface RespondentPreviewProps {
  snippet: string;
  /** The grid's designed width in pixels (gridPixelSize). */
  gridWidth: number;
  /** How the page is shown. The editor keeps the choice, so it lasts while
   * the design preview is shown, even when this browser cannot store it. */
  view: RespondentView;
  onViewChange: (view: RespondentView) => void;
}

/** Run the same renderer we export, isolated from the editor and its storage. */
export default function RespondentPreview({ snippet, gridWidth, view, onViewChange }: RespondentPreviewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(550);
  const [attempt, setAttempt] = useState(0);
  const [stageRef, stageWidth, stage] = useClientWidth<HTMLDivElement>();
  const documentHtml = useMemo(() => previewDocument(snippet), [snippet]);

  // The width the page needs to show the grid at full size. Switching views
  // only resizes the frame, so answers given in it stay.
  const fullWidth = gridWidth + PAGE_ROOM + FRAME_BORDERS;
  const tooNarrow = stageWidth > 0 && stageWidth < fullWidth;
  const zoom = view === "fit" && tooNarrow ? stageWidth / fullWidth : 1;

  // Fit shows the whole page from its top left corner, on a stage that
  // clips rather than scrolls (Tailwind writes overflow-clip after
  // overflow-hidden). A browser without overflow: clip falls back to
  // hidden, which would keep an offset left by scrolling Desktop sideways
  // or by a reminder, and crop the page where it cannot be scrolled back.
  useLayoutEffect(() => {
    if (zoom >= 1 || !stage) return;
    stage.scrollLeft = 0;
    stage.scrollTop = 0;
  }, [zoom, stage]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type !== "griddy-preview-height") return;
      const nextHeight = event.data.height;
      if (typeof nextHeight === "number" && Number.isFinite(nextHeight)) {
        setHeight(Math.max(200, Math.min(MAX_FRAME_HEIGHT, nextHeight + 16)));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  let note: string | null = null;
  if (view === "fit") {
    note =
      zoom < 1
        ? `Shown at ${Math.round(zoom * 100)}% so the whole grid fits. Respondents see it at full size.`
        : "The whole grid fits at full size.";
  } else if (view === "desktop" && tooNarrow) {
    note = "Wider than this panel. Scroll sideways, or choose Fit.";
  }

  // Desktop is at least as wide as the grid needs, and scrolls sideways when
  // the panel is narrower. Phone leaves the question the width Qualtrics'
  // phone view does, so a wider grid scrolls inside its own frame, with its
  // hint and arrows, as it does for respondents. Fit scales the whole frame
  // down, keeping the layout's proportions.
  const frameStyle: CSSProperties =
    view === "phone"
      ? { height, width: PHONE_PAGE_WIDTH, boxSizing: "content-box" }
      : zoom < 1
        ? { height, width: fullWidth, transform: `scale(${zoom})`, transformOrigin: "0 0" }
        : { height, width: "100%", minWidth: fullWidth };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-muted">
        Try the grid as a respondent. Answers here are not saved. Your Qualtrics theme may affect the surrounding page.
      </p>
      <PreviewViewChoice
        label="Respondent preview size"
        options={VIEW_OPTIONS}
        value={view}
        onChange={onViewChange}
      />
      {note && <p className="text-xs text-ink-muted">{note}</p>}
      {view === "phone" && (
        <p className="-mb-1.5 text-center text-xs font-medium text-ink-muted">
          Phone, as Qualtrics' phone view: {PHONE_WIDTH} px for the grid
        </p>
      )}
      <div
        ref={stageRef}
        className={zoom < 1 ? "overflow-hidden overflow-clip" : "overflow-x-auto"}
        style={zoom < 1 ? { height: Math.ceil(height * zoom) } : undefined}
      >
        <iframe
          key={attempt}
          ref={frameRef}
          title="Respondent survey preview"
          sandbox="allow-scripts"
          srcDoc={documentHtml}
          className={`block rounded-lg border border-hairline-warm bg-white${view === "phone" ? " mx-auto" : ""}`}
          style={frameStyle}
        />
      </div>
      <button
        type="button"
        onClick={() => setAttempt((value) => value + 1)}
        className="self-start text-xs font-semibold text-ink-muted hover:text-ink"
      >
        Restart respondent preview
      </button>
    </div>
  );
}
