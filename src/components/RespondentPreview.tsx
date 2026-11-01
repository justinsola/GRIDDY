import { useEffect, useMemo, useRef, useState } from "react";

/** Run the same renderer we export, isolated from the editor and its storage. */
export default function RespondentPreview({ snippet }: { snippet: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(550);
  const [attempt, setAttempt] = useState(0);
  const documentHtml = useMemo(() => {
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
// Fit the exported grid's fixed dimensions into the editor's narrower panel.
// Scale the entire preview, preserving its exported layout and proportions.
function fitPreview() {
  document.body.style.zoom = "1";
  document.body.style.width = "auto";
  // Measure the grid at its designed size. In Qualtrics it scrolls sideways
  // on narrow screens; this editor preview zooms out to show all of it.
  var q = document.getElementById("question");
  var natural = q.scrollWidth;
  var scrollers = q.querySelectorAll("[data-griddy-scroller]");
  for (var i = 0; i < scrollers.length; i++) natural = Math.max(natural, scrollers[i].scrollWidth + 2);
  var width = Math.max(natural, window.innerWidth - 16);
  document.body.style.width = width + "px";
  document.body.style.zoom = Math.min(1, window.innerWidth / (width + 16));
}
fitPreview();
window.addEventListener("resize", fitPreview);
new ResizeObserver(function () {
  parent.postMessage({ type: "griddy-preview-height", height: document.body.getBoundingClientRect().height }, "*");
}).observe(document.body);
</script></body></html>`;
  }, [snippet]);

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

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-muted">
        Try the grid as a respondent. Answers here are not saved. Your Qualtrics theme may affect the surrounding page.
      </p>
      <iframe
        key={attempt}
        ref={frameRef}
        title="Respondent survey preview"
        sandbox="allow-scripts"
        srcDoc={documentHtml}
        className="w-full rounded-lg border border-hairline-warm bg-white"
        style={{ height }}
      />
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
