import { RefObject, useEffect, useId, useRef } from "react";
import { SaveConflict, saveConflictMessage } from "../lib/saveEditorSurvey";

interface SaveChoiceDialogProps {
  conflict: SaveConflict;
  /** The button that opened the dialog. Focus goes back to it on close,
   * unless saving removed it. */
  returnFocusTo: RefObject<HTMLElement>;
  onSaveAsNew: () => void;
  onReplace: () => void;
  onCancel: () => void;
}

const SECONDARY_BUTTON =
  "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";

/** Asks whether saving should replace the saved survey, or keep it and save
 * the editor's survey as a new one. Looks like the export dialog. */
export default function SaveChoiceDialog({
  conflict,
  returnFocusTo,
  onSaveAsNew,
  onReplace,
  onCancel,
}: SaveChoiceDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const saveAsNewRef = useRef<HTMLButtonElement>(null);

  // Start on the choice that keeps both versions, and give focus back to
  // the button that opened the dialog when it closes, if it is still there.
  useEffect(() => {
    const opener = returnFocusTo.current;
    saveAsNewRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [returnFocusTo]);

  // Escape cancels, like clicking outside. Tab stays on the dialog's buttons.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      } else if (event.key === "Tab") {
        const buttons = Array.from(dialogRef.current?.querySelectorAll("button") ?? []);
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.shiftKey
          ? (at <= 0 ? buttons.length : at) - 1
          : (at + 1) % buttons.length;
        event.preventDefault();
        buttons[next]?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="text-lg font-semibold text-slate-900">
          Save survey
        </h3>
        <p id={messageId} className="mt-2 text-sm text-slate-700">
          {saveConflictMessage(conflict)}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            ref={saveAsNewRef}
            type="button"
            onClick={onSaveAsNew}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            Save as new survey
          </button>
          <button
            type="button"
            onClick={onReplace}
            aria-label={`Replace "${conflict.storedName}"`}
            className={SECONDARY_BUTTON}
          >
            Replace
          </button>
          <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
