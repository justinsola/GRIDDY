import { useEffect, useRef, useState } from "react";
import { useEditor } from "../EditorContext";
import { MISSING_TITLE_MESSAGE, saveEditorSurvey } from "../lib/saveEditorSurvey";

export default function SaveButton() {
  const { state, dispatch } = useEditor();
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<"saved" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  // The timer that will hide the current message. Each click clears it, so a
  // timer left from an earlier message cannot hide a newer one.
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  const handleClick = async () => {
    window.clearTimeout(hideTimer.current);
    setSaving(true);
    setFlash(null);
    try {
      await saveEditorSurvey(state.config, () => dispatch({ type: "markSaved" }));
      setFlash("saved");
      hideTimer.current = window.setTimeout(() => setFlash(null), 2000);
    } catch (e) {
      const message = (e as Error).message;
      setErrorMsg(message);
      setFlash("error");
      // A missing title is a passing reminder. Keep a failed save on screen
      // until the next attempt; it means the survey is not stored.
      if (message === MISSING_TITLE_MESSAGE) {
        hideTimer.current = window.setTimeout(() => setFlash(null), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={saving}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
          flash === "saved"
            ? "bg-green-100 text-green-700"
            : flash === "error"
            ? "bg-red-100 text-red-700"
            : "bg-slate-900 text-white hover:bg-slate-700"
        }`}
      >
        {saving ? "Saving…" : flash === "saved" ? "Saved!" : "Save"}
      </button>
      {flash === "error" && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-600">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
