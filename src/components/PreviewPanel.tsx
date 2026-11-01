import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RespondentPreview from "./RespondentPreview";
import { useEditor } from "../EditorContext";
import { LayerMode, WeightEntry } from "../grid-types";
import {
  buildQualtricsSnippet,
  buildQualtricsQsfForConfig,
} from "../lib/qualtricsExport";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


function renderAssignedContent(
  category: string,
  imageUrl: string,
  color: string,
  layerMode: LayerMode = "replace",
  textPosition: "top" | "bottom" = "bottom",
) {
  if (imageUrl && layerMode === "front") {
    return (
      <>
        <img
          src={imageUrl}
          alt={category}
          className="absolute inset-0 h-full w-full object-contain"
        />
        <span
          className={`absolute left-0 right-0 truncate px-0.5 text-center text-[8px] font-medium leading-tight ${
            textPosition === "top" ? "top-0 pt-0.5" : "bottom-0 pb-0.5"
          }`}
          style={{ backgroundColor: hexToRgba(color, 0.75), color: "#0f172a" }}
        >
          {category}
        </span>
      </>
    );
  }

  if (imageUrl && layerMode === "behind") {
    return (
      <>
        <img
          src={imageUrl}
          alt={category}
          className="absolute inset-0 h-full w-full object-contain opacity-20"
        />
        <div className="relative z-10 flex flex-1 items-center justify-center p-1 text-center text-[10px] leading-tight">
          {category}
        </div>
      </>
    );
  }

  return (
    <>
      {imageUrl && textPosition === "top" && (
        <div className="w-full flex-shrink-0 truncate px-0.5 pt-0.5 text-center text-[9px] leading-tight">
          {category}
        </div>
      )}
      {imageUrl && (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-0.5">
          <img
            src={imageUrl}
            alt={category}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}
      {(!imageUrl || textPosition === "bottom") && (
        <div
          className={`w-full flex-shrink-0 text-center leading-tight ${
            imageUrl
              ? "truncate px-0.5 pb-0.5 text-[9px]"
              : "flex flex-1 items-center justify-center p-1 text-[10px]"
          }`}
        >
          {category}
        </div>
      )}
    </>
  );
}

// --- Experimental utility functions ---

interface CellInfo {
  row: number;
  col: number;
  isCenter: boolean;
  key: string;        // ephemeral key: "row-col"
  exportKey: string;  // persistent key: "rRow-cCol"
}

function computeWeightedSample(
  weightedEntries: WeightEntry[],
  cells: CellInfo[],
  blockedCells: Record<string, string> = {},
): Record<string, string> {
  const result: Record<string, string> = {};
  const totalWeight = weightedEntries.reduce((s, e) => s + e.weight, 0);
  if (totalWeight === 0 || weightedEntries.length === 0) return result;

  // Build CDF
  let cum = 0;
  const cdf = weightedEntries.map((e) => {
    cum += e.weight / totalWeight;
    return { category: e.category, cumulative: cum };
  });

  for (const cell of cells) {
    if (cell.isCenter || blockedCells[cell.exportKey]) continue;
    const rand = Math.random();
    const picked = cdf.find((entry) => rand <= entry.cumulative);
    if (picked) result[cell.exportKey] = picked.category;
  }
  return result;
}

// --- Main component ---

export const PreviewPanel: React.FC = () => {
  const {
    state: { config },
    dispatch,
  } = useEditor();

  const { layout, tuning, survey } = config;
  const experimental = config.experimental!;
  const expEnabled = experimental.enabled;

  const categories = useMemo(
    () =>
      survey.categoriesCsv
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    [survey.categoriesCsv],
  );

  const barriers = useMemo(
    () =>
      layout.barriersCsv
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean),
    [layout.barriersCsv],
  );

  const [copied, setCopied] = useState(false);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);

  // Escape closes the export dialog, like clicking outside it.
  useEffect(() => {
    if (!isCodeModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsCodeModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCodeModalOpen]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [blockEditMode, setBlockEditMode] = useState(false);
  const [activeBarrier, setActiveBarrier] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);

  // Experimental mode state
  const [previewTab, setPreviewTab] = useState<"design" | "respondent">("design");
  const [weightedPreview, setWeightedPreview] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!categories.length) {
      setActiveCategory(null);
      return;
    }
    if (!activeCategory || !categories.includes(activeCategory)) {
      setActiveCategory(categories[0] ?? null);
    }
  }, [categories, activeCategory]);

  useEffect(() => {
    if (!barriers.length) {
      setActiveBarrier(null);
      return;
    }
    if (!activeBarrier || !barriers.includes(activeBarrier)) {
      setActiveBarrier(barriers[0] ?? null);
    }
  }, [barriers, activeBarrier]);

  // Leave block-edit mode when it no longer applies (no barriers, or viewing
  // the respondent preview where researchers can't edit the layout).
  useEffect(() => {
    if (blockEditMode && (barriers.length === 0 || previewTab === "respondent")) {
      setBlockEditMode(false);
    }
  }, [blockEditMode, barriers.length, previewTab]);

  useEffect(() => {
    setAssignments({});
    setDraggedCategory(null);
    setDragOverCell(null);
    setWeightedPreview({});
    setBlockEditMode(false);
  }, [config.id, survey.selectionMode, survey.categoriesCsv]);

  const totalCells = layout.rows * layout.cols;
  const cells: CellInfo[] = useMemo(
    () =>
      Array.from({ length: totalCells }, (_, index) => {
        const row = Math.floor(index / layout.cols) + 1;
        const col = (index % layout.cols) + 1;
        const centerRow = layout.centerRow ?? Math.ceil(layout.rows / 2);
        const centerCol = layout.centerCol ?? Math.ceil(layout.cols / 2);
        const isCenter =
          layout.includeCenterCell && row === centerRow && col === centerCol;
        return {
          row,
          col,
          isCenter,
          key: `${row}-${col}`,
          exportKey: `r${row}-c${col}`,
        };
      }),
    [totalCells, layout],
  );

  const lockedCellKeys = useMemo(
    () =>
      new Set(
        cells
          .filter((cell) => cell.isCenter || layout.blockedCells[cell.exportKey])
          .map((cell) => cell.key),
      ),
    [cells, layout.blockedCells],
  );

  // Generate weighted preview whenever entries or cells change
  useEffect(() => {
    if (expEnabled && experimental.prefillMode === "weighted") {
      setWeightedPreview(
        computeWeightedSample(experimental.weightedEntries, cells, layout.blockedCells),
      );
    }
  }, [expEnabled, experimental.prefillMode, experimental.weightedEntries, cells, layout.blockedCells]);

  const displayAssignments = !expEnabled
    ? assignments
    : experimental.prefillMode === "weighted"
      ? weightedPreview
      : experimental.fixedAssignments;

  const applyAssignment = useCallback(
    (exportKey: string, ephemeralKey: string, category: string | null) => {
      if (
        expEnabled &&
        experimental.prefillMode !== "weighted"
      ) {
        // Persist to config
        const next = { ...experimental.fixedAssignments };
        if (!category) {
          delete next[exportKey];
        } else {
          next[exportKey] = category;
        }
        dispatch({ type: "updateExperimental", patch: { fixedAssignments: next } });
      } else {
        setAssignments((prev) => {
          const next = { ...prev };
          if (!category) {
            delete next[ephemeralKey];
          } else {
            next[ephemeralKey] = category;
          }
          return next;
        });
      }
    },
    [expEnabled, experimental.prefillMode, experimental.fixedAssignments, dispatch],
  );

  // Researcher block-layout editing: press and drag to paint (or erase)
  // barriers across many cells at once. A drag started on an already-blocked
  // cell erases; otherwise it paints the active barrier. A working copy of the
  // blocked map is kept in a ref so rapid drag updates never read stale state.
  const isPaintingRef = useRef(false);
  const paintEraseRef = useRef(false);
  const blockedDraftRef = useRef<Record<string, string>>({});

  const applyBlockPaint = useCallback(
    (cell: CellInfo) => {
      if (cell.isCenter || !activeBarrier) return;
      const draft = blockedDraftRef.current;
      const key = cell.exportKey;
      let changed = false;
      if (paintEraseRef.current) {
        if (draft[key]) {
          delete draft[key];
          changed = true;
        }
      } else if (draft[key] !== activeBarrier) {
        draft[key] = activeBarrier;
        changed = true;
      }
      if (changed) {
        dispatch({ type: "updateLayout", patch: { blockedCells: { ...draft } } });
      }
    },
    [activeBarrier, dispatch],
  );

  const startBlockPaint = useCallback(
    (cell: CellInfo) => {
      if (!blockEditMode || cell.isCenter || !activeBarrier) return;
      isPaintingRef.current = true;
      // Erase when the drag begins on a cell already holding the active barrier.
      paintEraseRef.current = layout.blockedCells[cell.exportKey] === activeBarrier;
      blockedDraftRef.current = { ...layout.blockedCells };
      applyBlockPaint(cell);
    },
    [blockEditMode, activeBarrier, layout.blockedCells, applyBlockPaint],
  );

  const continueBlockPaint = useCallback(
    (cell: CellInfo) => {
      if (!isPaintingRef.current || !blockEditMode) return;
      applyBlockPaint(cell);
    },
    [blockEditMode, applyBlockPaint],
  );

  // A drag can end anywhere (including off the grid), so stop on any mouse-up.
  useEffect(() => {
    const stop = () => {
      isPaintingRef.current = false;
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  const handlePaintCellClick = (cell: CellInfo) => {
    // Block-layout editing is handled by the drag-paint mouse handlers.
    if (blockEditMode) return;
    if (
      (!expEnabled && (!survey.allowInteraction || survey.selectionMode !== "paint")) ||
      !activeCategory ||
      lockedCellKeys.has(cell.key)
    ) {
      return;
    }
    if (expEnabled && experimental.prefillMode !== "weighted") {
      // Experimental setup: toggle in fixedAssignments
      const current = experimental.fixedAssignments[cell.exportKey];
      applyAssignment(
        cell.exportKey,
        cell.key,
        current === activeCategory ? null : activeCategory,
      );
    } else if (!expEnabled) {
      setAssignments((prev) => {
        const current = prev[cell.key];
        const next = { ...prev };
        if (current === activeCategory) {
          delete next[cell.key];
        } else {
          next[cell.key] = activeCategory;
        }
        return next;
      });
    }
  };

  const regenerateWeighted = () => {
    setWeightedPreview(
      computeWeightedSample(experimental.weightedEntries, cells, layout.blockedCells),
    );
  };

  // Empty every cell in the currently editable layer of the preview.
  const handleClearCells = () => {
    if (!expEnabled) {
      setAssignments({});
      return;
    }
    if (experimental.prefillMode === "weighted") {
      setWeightedPreview({});
    } else {
      dispatch({ type: "updateExperimental", patch: { fixedAssignments: {} } });
    }
  };

  const qualtricsSnippet = useMemo(() => buildQualtricsSnippet(config), [config]);
  const qualtricsQsf = useMemo(
    () => buildQualtricsQsfForConfig(config),
    [config],
  );
  const exportFields = useMemo(
    () =>
      expEnabled
        ? ["GridPrefills", "GridResponses"]
        : ["GridAssignments"],
    [expEnabled],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(qualtricsSnippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownloadQsf = () => {
    const safeName =
      (config.name || "griddy-survey")
        .trim()
        .replace(/[^A-Za-z0-9_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "") || "griddy-survey";
    const blob = new Blob([qualtricsQsf], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.qsf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const showPaintToolbar = categories.length > 0 && (
    expEnabled ? experimental.prefillMode !== "weighted"
      : survey.allowInteraction && survey.selectionMode === "paint"
  );
  const showDragDropToolbar = !expEnabled && survey.allowInteraction && categories.length > 0 && survey.selectionMode === "dragdrop";
  const showDropdownHint = !expEnabled && survey.allowInteraction && categories.length > 0 && survey.selectionMode === "dropdown";
  const showBlockTool = barriers.length > 0;

  return (
    <>
      <section
        aria-label="Grid preview"
        className="flex flex-col gap-3 rounded-xl border border-hairline-warm bg-paper-card p-5 md:sticky md:top-6"
      >
        <header className="flex items-center justify-between gap-2">
          <h2 className="font-serif text-base font-semibold text-ink">Live preview</h2>
          <span className="font-serif text-[12.5px] italic text-ink-muted">
            {layout.rows} × {layout.cols}
          </span>
        </header>

        <div role="group" aria-label="Preview mode" className="inline-flex items-center gap-1 self-start rounded-lg border border-hairline-warm bg-paper-window p-0.5 text-xs">
          {(["design", "respondent"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={previewTab === tab}
              onClick={() => {
                setBlockEditMode(false);
                setPreviewTab(tab);
              }}
              className={`rounded-[7px] px-3.5 py-1.5 font-bold transition-colors ${
                previewTab === tab ? "bg-paper-card text-ink shadow-sm" : "text-ink-muted hover:bg-paper-card/60"
              }`}
            >
              {tab === "design" ? "Design preview" : "Respondent preview"}
            </button>
          ))}
        </div>

        {previewTab === "respondent" ? (
          <RespondentPreview snippet={qualtricsSnippet} />
        ) : (
          <>
        {/* Weighted-mode hint (no button here — Regenerate lives in the bottom bar) */}
        {expEnabled &&
            experimental.prefillMode === "weighted" && (
            <p className="text-xs text-ink-muted">
              Sample preview — each respondent gets an independent draw.
            </p>
          )}

        {/* Paint toolbar */}
        {showPaintToolbar && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600">
              Placing:
            </span>
            <div className="flex flex-wrap gap-1">
              {categories.map((item) => {
                const color = survey.categoryMeta[item]?.color ?? "#60a5fa";
                const isActive = activeCategory === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      // Picking a category means placing it, so leave block-cells mode.
                      setActiveCategory(item);
                      setBlockEditMode(false);
                    }}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
                      isActive
                        ? "shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                    style={
                      isActive
                        ? {
                            borderColor: color,
                            backgroundColor: hexToRgba(color, 0.1),
                            color: "#0f172a",
                          }
                        : {}
                    }
                  >
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Block-cells tool — researcher paints structural barriers/walls */}
        {showBlockTool && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBlockEditMode((v) => !v)}
              className={`rounded-md border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
                blockEditMode
                  ? "border-accent bg-accent text-white shadow-sm"
                  : "border-accent/40 bg-accent-tint text-accent hover:border-accent hover:bg-accent-tint/70"
              }`}
            >
              {blockEditMode ? "Done blocking" : "Block cells"}
            </button>
            {blockEditMode && (
              <>
                <span className="text-xs font-medium text-slate-600">Barrier:</span>
                <div className="flex flex-wrap gap-1">
                  {barriers.map((item) => {
                    const color = layout.barrierMeta?.[item]?.color ?? "#94a3b8";
                    const isActive = activeBarrier === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setActiveBarrier(item)}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
                          isActive
                            ? "shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                        style={
                          isActive
                            ? {
                                borderColor: color,
                                backgroundColor: hexToRgba(color, 0.1),
                                color: "#0f172a",
                              }
                            : {}
                        }
                      >
                        <span
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        {item}
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs text-slate-500">
                  Click cells to block or unblock them.
                </span>
              </>
            )}
          </div>
        )}

        {/* Drag-drop toolbar */}
        {showDragDropToolbar && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-600">
              Drag a label onto a cell:
            </span>
            <div className="flex flex-wrap gap-2">
              {categories.map((item) => {
                const color = survey.categoryMeta[item]?.color ?? "#60a5fa";
                return (
                  <button
                    key={item}
                    type="button"
                    draggable
                    onDragStart={() =>
                      setDraggedCategory(item)
                    }
                    onDragEnd={() => {
                      setDraggedCategory(null);
                      setDragOverCell(null);
                    }}
                    className="rounded-full border px-3 py-1 text-xs font-medium text-slate-700"
                    style={{
                      borderColor: color,
                      backgroundColor: hexToRgba(color, 0.12),
                    }}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Dropdown hint */}
        {showDropdownHint && (
          <p className="text-xs text-slate-500">
            Each cell gets its own dropdown so respondents have to make a deliberate choice.
          </p>
        )}

        {/* Clear all — available for every input method */}
        {(showPaintToolbar || showDragDropToolbar || showDropdownHint) && (
          <div>
            <button
              type="button"
              onClick={handleClearCells}
              title="Empty all cells"
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-400 hover:text-slate-800"
            >
              Clear Cells
            </button>
          </div>
        )}

        <p className="font-serif text-[17px] text-ink">{layout.questionText}</p>

        <div
          className="relative min-h-0 w-full flex-1 overflow-hidden rounded-lg border border-hairline-warm bg-paper-window"
          style={{
            width: "100%",
            aspectRatio: `${tuning.previewWidth} / ${tuning.previewHeight}`,
            backgroundImage: layout.backgroundImageUrl
              ? `url('${layout.backgroundImageUrl}')`
              : undefined,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            backgroundSize: "contain",
          }}
        >
          <div
            className="grid h-full w-full"
            style={{
              gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
              gap: tuning.gridGap,
              padding: tuning.gridPadding,
            }}
          >
            {cells.map((cell) => {
              // Blocked cells (barriers/walls) render as a static, non-interactive
              // fill in every mode. Cells that share an EDGE with another blocked
              // cell of the same type merge into one continuous shape (diagonal /
              // corner-only neighbors do NOT connect). We square the shared corners
              // and bridge the grid gap with box-shadow — shadows paint outside the
              // box and aren't clipped, so this renders identically in Qualtrics.
              const barrierName = layout.blockedCells[cell.exportKey];
              if (barrierName) {
                const bMeta = layout.barrierMeta?.[barrierName];
                const bColor = bMeta?.color ?? "#94a3b8";
                const bImage = bMeta?.imageUrl ?? "";
                const gap = tuning.gridGap;
                const radius = 8; // matches rounded-lg
                const at = (r: number, c: number) =>
                  layout.blockedCells[`r${r}-c${c}`] === barrierName;
                const cUp = at(cell.row - 1, cell.col);
                const cDown = at(cell.row + 1, cell.col);
                const cLeft = at(cell.row, cell.col - 1);
                const cRight = at(cell.row, cell.col + 1);
                const cUpLeft = at(cell.row - 1, cell.col - 1);
                const cUpRight = at(cell.row - 1, cell.col + 1);
                const cDownLeft = at(cell.row + 1, cell.col - 1);
                const cDownRight = at(cell.row + 1, cell.col + 1);
                // Bridge the grid gap with plain background-colored filler
                // elements sized in fixed pixels (no percentages/shadows/margins,
                // which don't survive Qualtrics' embedded rendering). Each shared
                // edge is bridged once (right/down); each inner corner is filled
                // only when both its bracketing edges AND the diagonal cell all
                // connect — i.e. a true solid block, so the gap doesn't punch a
                // hole through its middle. An L-turn (diagonal cell unblocked)
                // leaves its corner open instead of poking out toward it.
                const filler: React.CSSProperties = {
                  position: "absolute",
                  backgroundColor: bColor,
                };
                // When the barrier has an image, carry it onto the gap-bridging
                // fillers too (positioned to echo the edge/corner they extend),
                // so joined cells read as one textured shape instead of solid
                // color strips stitching the tiles together.
                const bridge = (position: string): React.CSSProperties =>
                  bImage
                    ? {
                        ...filler,
                        backgroundImage: `url('${bImage}')`,
                        backgroundSize: "cover",
                        backgroundPosition: position,
                        backgroundRepeat: "no-repeat",
                      }
                    : filler;
                return (
                  <div
                    key={cell.key}
                    onMouseDown={
                      blockEditMode
                        ? (e) => {
                            e.preventDefault();
                            startBlockPaint(cell);
                          }
                        : undefined
                    }
                    onMouseEnter={
                      blockEditMode ? () => continueBlockPaint(cell) : undefined
                    }
                    className={`relative min-h-0 min-w-0${
                      blockEditMode ? " cursor-pointer" : ""
                    }`}
                    style={{
                      backgroundColor: bColor,
                      borderTopLeftRadius: cUp || cLeft ? 0 : radius,
                      borderTopRightRadius: cUp || cRight ? 0 : radius,
                      borderBottomLeftRadius: cDown || cLeft ? 0 : radius,
                      borderBottomRightRadius: cDown || cRight ? 0 : radius,
                      zIndex: 1,
                    }}
                  >
                    {/* Edge bridges */}
                    {cRight && <div style={{ ...bridge("right center"), top: 0, bottom: 0, right: -gap, width: gap }} />}
                    {cDown && <div style={{ ...bridge("center bottom"), left: 0, right: 0, bottom: -gap, height: gap }} />}
                    {/* Inner-corner fills (only for a true solid-block corner) */}
                    {cRight && cDown && cDownRight && <div style={{ ...bridge("right bottom"), right: -gap, width: gap, bottom: -gap, height: gap }} />}
                    {cLeft && cDown && cDownLeft && <div style={{ ...bridge("left bottom"), left: -gap, width: gap, bottom: -gap, height: gap }} />}
                    {cRight && cUp && cUpRight && <div style={{ ...bridge("right top"), right: -gap, width: gap, top: -gap, height: gap }} />}
                    {cLeft && cUp && cUpLeft && <div style={{ ...bridge("left top"), left: -gap, width: gap, top: -gap, height: gap }} />}
                    {bImage && (
                      <img
                        src={bImage}
                        alt={barrierName}
                        className="absolute inset-0 h-full w-full object-cover"
                        style={{ borderRadius: "inherit", zIndex: 1 }}
                      />
                    )}
                  </div>
                );
              }

              // For experimental mode use exportKey for lookup, else use key
              const lookupKey = expEnabled ? cell.exportKey : cell.key;
              const assignedCat = displayAssignments[lookupKey];
              const catMeta = assignedCat ? survey.categoryMeta[assignedCat] : null;
              const catColor = catMeta?.color ?? "#60a5fa";
              const catImage = catMeta?.imageUrl ?? "";
              const catLayerMode: LayerMode = catMeta?.layerMode ?? "replace";
              const isDropTarget =
                !expEnabled &&
                survey.selectionMode === "dragdrop" &&
                dragOverCell === cell.key;

              // Standard cell rendering (also used for experimental setup tab)
              return (
                <div
                  key={cell.key}
                  onClick={() => handlePaintCellClick(cell)}
                  onMouseDown={
                    blockEditMode
                      ? (e) => {
                          e.preventDefault();
                          startBlockPaint(cell);
                        }
                      : undefined
                  }
                  onMouseEnter={
                    blockEditMode ? () => continueBlockPaint(cell) : undefined
                  }
                  onDragOver={(e) => {
                    if (expEnabled || !survey.allowInteraction || survey.selectionMode !== "dragdrop") {
                      return;
                    }
                    e.preventDefault();
                    setDragOverCell(cell.key);
                  }}
                  onDragLeave={() => {
                    if (
                      survey.selectionMode === "dragdrop" &&
                      dragOverCell === cell.key
                    ) {
                      setDragOverCell(null);
                    }
                  }}
                  onDrop={(e) => {
                    if (
                      expEnabled ||
                      !survey.allowInteraction ||
                      survey.selectionMode !== "dragdrop" ||
                      cell.isCenter
                    ) {
                      return;
                    }
                    e.preventDefault();
                    const droppedCategory =
                      draggedCategory ?? e.dataTransfer.getData("text/plain");
                    if (!droppedCategory) {
                      setDragOverCell(null);
                      return;
                    }
                    applyAssignment(
                      cell.exportKey,
                      cell.key,
                      droppedCategory === "__CLEAR__" ? null : droppedCategory,
                    );
                    setDragOverCell(null);
                    setDraggedCategory(null);
                  }}
                  className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border font-medium ${
                    ((blockEditMode && !cell.isCenter) ||
                      (!expEnabled && survey.allowInteraction && survey.selectionMode === "paint") ||
                      (expEnabled &&
                        experimental.prefillMode !== "weighted")) &&
                    !cell.isCenter
                      ? "cursor-pointer transition-colors"
                      : ""
                  }${assignedCat && catLayerMode !== "replace" ? " relative" : ""}`}
                  style={
                    assignedCat
                      ? catLayerMode === "front"
                        ? {
                            backgroundColor: "transparent",
                            borderColor: hexToRgba(catColor, 0.5),
                            color: "#2a241c",
                          }
                        : {
                            backgroundColor: hexToRgba(catColor, 0.2),
                            borderColor: catColor,
                            color: "#2a241c",
                          }
                      : isDropTarget
                        ? {
                            backgroundColor: "#e2dccf",
                            borderColor: "#2a241c",
                            color: "#2a241c",
                          }
                        : cell.isCenter
                          ? {
                              backgroundColor: "#f7ece9",
                              borderStyle: "dashed",
                              borderColor: "#c08a92",
                              color: "#8a2e3b",
                            }
                          : {
                              backgroundColor: "#fbf8f1",
                              borderStyle: "dashed",
                              borderColor: "#d8cdb8",
                              color: "#2a241c",
                            }
                  }
                >
                  {/* r·c coordinate tag */}
                  <span
                    className="absolute left-1.5 top-1 font-mono text-[8.5px] leading-none"
                    style={{ color: cell.isCenter ? "#c79aa0" : "#9a8f78" }}
                  >
                    {`r${cell.row}·c${cell.col}`}
                  </span>

                  {!expEnabled &&
                  survey.allowInteraction &&
                  survey.selectionMode === "dropdown" &&
                  !cell.isCenter ? (
                    <div className="flex h-full min-h-0 flex-col gap-1 p-1 pt-3">
                      {assignedCat && (
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                          {renderAssignedContent(
                            assignedCat,
                            catImage,
                            catColor,
                            catLayerMode,
                            "bottom",
                          )}
                        </div>
                      )}
                      <select
                        aria-label={`Choose label for row ${cell.row} column ${cell.col}`}
                        value={assignedCat ?? ""}
                        onChange={(e) =>
                          applyAssignment(cell.exportKey, cell.key, e.target.value || null)
                        }
                        className="w-full min-w-0 flex-shrink-0 rounded border border-hairline bg-white px-1.5 py-1 text-[10px] text-ink outline-none"
                      >
                        <option value="">Choose label</option>
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : assignedCat ? (
                    <>
                      {renderAssignedContent(
                        assignedCat,
                        catImage,
                        catColor,
                        catLayerMode,
                        expEnabled ? "top" : "bottom",
                      )}
                      {!expEnabled &&
                        survey.allowInteraction &&
                        survey.selectionMode === "dragdrop" &&
                        !cell.isCenter && (
                          <button
                            type="button"
                            aria-label={`Clear row ${cell.row} column ${cell.col}`}
                            title="Clear cell"
                            onClick={(e) => {
                              e.stopPropagation();
                              applyAssignment(cell.exportKey, cell.key, null);
                            }}
                            className="absolute right-1 top-1 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-black/40 text-[9px] leading-none text-white hover:bg-black/60"
                          >
                            ×
                          </button>
                        )}
                    </>
                  ) : cell.isCenter ? (
                    <div className="flex flex-1 items-center justify-center p-1 pt-3">
                      <span className="w-full break-words text-center font-serif text-[10px] font-semibold leading-tight text-accent">
                        {layout.centerCellLabel || "Your House"}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend chips */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {categories.map((item) => {
              const color = survey.categoryMeta[item]?.color ?? "#60a5fa";
              return (
                <span key={item} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                  {item}
                </span>
              );
            })}
          </div>
        )}

          </>
        )}

        {/* Bottom action bar */}
        <div className="flex items-center gap-2.5 border-t border-hairline-warm pt-4">
          <button
            type="button"
            data-tour="export-button"
            onClick={() => setIsCodeModalOpen(true)}
            className="flex-1 rounded-xl bg-accent py-3 text-center text-[14.5px] font-bold text-white hover:bg-accent/90"
          >
            Export to Qualtrics
          </button>
          {previewTab === "design" && expEnabled && experimental.prefillMode === "weighted" && (
            <button
              type="button"
              onClick={regenerateWeighted}
              className="rounded-xl border border-hairline px-4 py-3 text-[13.5px] font-bold text-ink-muted hover:border-accent/40 hover:text-ink"
            >
              Regenerate
            </button>
          )}
        </div>
      </section>

      {isCodeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Qualtrics JavaScript"
          onClick={() => setIsCodeModalOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-2xl font-semibold text-slate-900">
                  Export to Qualtrics
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadQsf}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  Download .qsf
                </button>
                <button
                  type="button"
                  onClick={() => setIsCodeModalOpen(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  Close
                </button>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              <div className="mx-auto flex max-w-3xl flex-col gap-4">
                <section className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
                  <div>
                    <h4 className="text-base font-semibold text-center">
                      Import the .qsf into Qualtrics
                    </h4>
                    <p className="mt-1 text-emerald-800">
                      The downloaded file builds the entire survey for you
                    </p>
                  </div>
                  <ol className="flex list-decimal flex-col gap-2 pl-5 marker:font-semibold">
                    <li>
                      Click <strong>Download .qsf</strong> (top right of this
                      window).
                    </li>
                    <li>
                      In Qualtrics, go to <strong>Projects</strong> &rarr;{" "}
                      <strong>Create project</strong> &rarr;{" "}
                      <strong>Survey</strong>.
                    </li>
                    <li>
                      Choose <strong>“Import a QSF file”</strong>, select the
                      downloaded{" "}
                      <code className="rounded bg-emerald-100 px-1 font-mono">
                        .qsf
                      </code>
                      , and create the project.
                    </li>
                    <li>
                      <strong>Publish</strong>. Then the grid renders and
                      saves responses automatically.
                    </li>
                  </ol>
                  <div className="rounded-md border border-emerald-200 bg-white/60 p-3">
                    <p className="font-medium">Results land in these fields:</p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {expEnabled ? (
                        <>
                          <li>
                            <code className="rounded bg-emerald-100 px-1 font-mono font-bold">
                              GridPrefills
                            </code>{" "}
                            — what was shown, e.g.{" "}
                            <code className="rounded bg-emerald-100 px-1 font-mono">{`{"r1-c1":"Family"}`}</code>
                          </li>
                          <li>
                            <code className="rounded bg-emerald-100 px-1 font-mono font-bold">
                              GridResponses
                            </code>{" "}
                            — what the respondent selected, e.g.{" "}
                            <code className="rounded bg-emerald-100 px-1 font-mono">{`{"r1-c1":"Good"}`}</code>
                          </li>
                        </>
                      ) : (
                        <li>
                          <code className="rounded bg-emerald-100 px-1 font-mono font-bold">
                            GridAssignments
                          </code>{" "}
                          — e.g.{" "}
                          <code className="rounded bg-emerald-100 px-1 font-mono">{`{"r1-c1":"Family"}`}</code>
                        </li>
                      )}
                    </ul>
                    <p className="mt-1.5 text-emerald-700">
                      Find them under <strong>Data &amp; Analysis</strong> after
                      collecting responses.
                    </p>
                  </div>
                </section>

                <details className="rounded-xl border border-slate-200 bg-white">
                  <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-slate-800">
                    <span className="font-mono text-base">{`</>`}</span>
                    <span>Advanced: view raw JavaScript (manual paste)</span>
                  </summary>
                  <div className="border-t border-slate-200 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <p className="text-xs text-slate-500">
                        Only needed to paste into an existing survey. Add an
                        Embedded Data element to your Survey Flow with{" "}
                        {exportFields.map((f, i) => (
                          <span key={f}>
                            {i > 0 && " and "}
                            <code className="rounded bg-slate-100 px-1 font-mono">
                              {f}
                            </code>
                          </span>
                        ))}
                        , add a Text/Graphic question, and paste this into its{" "}
                        <strong>JavaScript</strong> editor.
                      </p>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="flex-shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                      >
                        {copied ? "Copied!" : "Copy code"}
                      </button>
                    </div>
                    <textarea
                      className="h-[45vh] w-full resize-none rounded-xl border border-slate-200 bg-slate-950/90 p-3 font-mono text-[11px] text-slate-50 shadow-inner"
                      readOnly
                      value={qualtricsSnippet}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PreviewPanel;
