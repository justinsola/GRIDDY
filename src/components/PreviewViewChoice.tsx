export interface PreviewViewOption<T extends string> {
  value: T;
  label: string;
  /** What the view shows, as a tooltip. */
  title: string;
}

interface PreviewViewChoiceProps<T extends string> {
  /** Names the choice for screen readers, e.g. "Respondent preview size". */
  label: string;
  options: readonly PreviewViewOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** A small switch between ways of showing a preview, styled like the preview tabs. */
export default function PreviewViewChoice<T extends string>({
  label,
  options,
  value,
  onChange,
}: PreviewViewChoiceProps<T>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-600">View:</span>
      <div
        role="group"
        aria-label={label}
        className="inline-flex items-center gap-0.5 rounded-lg border border-hairline-warm bg-paper-window p-0.5 text-[11px]"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-2.5 py-1 font-bold transition-colors ${
              value === option.value ? "bg-paper-card text-ink shadow-sm" : "text-ink-muted hover:bg-paper-card/60"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
