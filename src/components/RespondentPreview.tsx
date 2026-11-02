import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import PreviewViewChoice, { type PreviewViewOption } from "./PreviewViewChoice";
import {
  RESPONDENT_VIEWS,
  RESPONDENT_VIEW_STORAGE_KEY,
  type RespondentView,
  useClientWidth,
  usePreviewView,
} from "../lib/previewView";

/** The screen width the Phone view shows, in CSS pixels. */
const PHONE_WIDTH = 375;
/** Room the preview page needs beside the grid: the grid frame's 1 px
 * borders and the page's 8 px padding, on both sides. */
const PAGE_ROOM = 2 + 16;
/** The preview frame's own 1 px borders. */
const FRAME_BORDERS = 2;

const VIEW_OPTIONS: readonly PreviewViewOption<RespondentView>[] = [
  { value: "desktop", label: "Desktop", title: "Full size, as on a computer" },
  { value: "phone", label: "Phone", title: `Full size, on a phone screen ${PHONE_WIDTH} px wide` },
  { value: "fit", label: "Fit", title: "Zoomed out so the whole grid fits this panel" },
];

function previewDocument(snippet: string): string {
  // Keep user-authored text inside a JS string, including literal </script>.
  const source = JSON.stringify(snippet).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body { margin: 0; padding: 8px; background: white; } #finished { font: 14px sans-serif; color: #2a241c; }</style>
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
  /** The grid's designed width in pixels (tuning.previewWidth). */
  gridWidth: number;
}

/** Run the same renderer we export, isolated from the editor and its storage. */
export default function RespondentPreview({ snippet, gridWidth }: RespondentPreviewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(550);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = usePreviewView(RESPONDENT_VIEW_STORAGE_KEY, RESPONDENT_VIEWS);
  const [stageRef, stageWidth] = useClientWidth<HTMLDivElement>();
  const documentHtml = useMemo(() => previewDocument(snippet), [snippet]);

  // The width the page needs to show the grid at full size. Switching views
  // only resizes the frame, so answers given in it stay.
  const fullWidth = gridWidth + PAGE_ROOM + FRAME_BORDERS;
  const tooNarrow = stageWidth > 0 && stageWidth < fullWidth;
  const zoom = view === "fit" && tooNarrow ? stageWidth / fullWidth : 1;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type !== "griddy-preview-height") return;
      const nextHeight = event.data.height;
      if (typeof nextHeight === "number" && Number.isFinite(nextHeight)) {
        setHeight(Math.max(200, Math.min(5000, nextHeight + 16)));
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
  // the panel is narrower. Phone is a phone-wide frame, so the exported grid
  // scrolls inside its own frame, with its hint and arrows, as it does for
  // respondents. Fit scales the whole frame down, keeping the layout's
  // proportions.
  const frameStyle: CSSProperties =
    view === "phone"
      ? { height, width: PHONE_WIDTH + FRAME_BORDERS }
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
        onChange={setView}
      />
      {note && <p className="text-xs text-ink-muted">{note}</p>}
      {view === "phone" && (
        <p className="-mb-1.5 text-center text-xs font-medium text-ink-muted">
          Phone, {PHONE_WIDTH} px wide
        </p>
      )}
      <div
        ref={stageRef}
        className={zoom < 1 ? "overflow-hidden" : "overflow-x-auto"}
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
