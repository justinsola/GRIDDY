import { useCallback, useLayoutEffect, useState } from "react";

/**
 * How the editor's two previews show the grid. Both start at the grid's real
 * size, as respondents see it; the other views are choices the researcher
 * makes, and this browser remembers them.
 */
export const DESIGN_VIEWS = ["full", "fit"] as const;
export type DesignView = (typeof DESIGN_VIEWS)[number];

export const RESPONDENT_VIEWS = ["desktop", "phone", "fit"] as const;
export type RespondentView = (typeof RESPONDENT_VIEWS)[number];

export const DESIGN_VIEW_STORAGE_KEY = "griddy.designPreviewView.v1";
export const RESPONDENT_VIEW_STORAGE_KEY = "griddy.respondentPreviewView.v1";

/** The view this browser chose last, or the first one (full size). */
function readPreviewView<T extends string>(key: string, views: readonly T[]): T {
  try {
    const stored = window.localStorage.getItem(key);
    return views.find((view) => view === stored) ?? views[0];
  } catch {
    // Storage can be blocked, for example in some private windows.
    return views[0];
  }
}

/** A preview's view, remembered in this browser when its storage allows. */
export function usePreviewView<T extends string>(
  key: string,
  views: readonly T[],
): [T, (view: T) => void] {
  const [view, setView] = useState(() => readPreviewView(key, views));
  const chooseView = useCallback(
    (next: T) => {
      setView(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Without storage the choice lasts until the page is reloaded.
      }
    },
    [key],
  );
  return [view, chooseView];
}

/**
 * The width an element gives its content, kept up to date as the window or
 * the panel changes. Pass the returned function as the element's ref; the
 * element itself comes third. The width is 0 until the element has been
 * laid out.
 */
export function useClientWidth<T extends HTMLElement>(): [(element: T | null) => void, number, T | null] {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!element) {
      setWidth(0);
      return;
    }
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [element]);
  return [setElement, width, element];
}
