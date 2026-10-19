import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EditorProvider } from "../EditorContext";
import PreviewPanel from "./PreviewPanel";
import RespondentPreview from "./RespondentPreview";

const host = document.createElement("div");
document.body.appendChild(host);
let root = createRoot(host);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => {
  act(() => root.unmount());
  root = createRoot(host);
});

it("switches from coordinate-based design to the exported respondent renderer and back", () => {
  act(() => root.render(<EditorProvider><PreviewPanel /></EditorProvider>));
  expect(host.textContent).toContain("r1·c1");
  const respondentButton = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Respondent preview",
  )!;
  act(() => respondentButton.click());
  expect(respondentButton.getAttribute("aria-pressed")).toBe("true");
  expect(host.textContent).not.toContain("r1·c1");
  const frame = host.querySelector("iframe")!;
  expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
  expect(frame.srcdoc).toContain("Qualtrics.SurveyEngine.addOnReady");
  expect(host.textContent).not.toContain("Block cells");
  act(() => Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Design preview",
  )!.click());
  expect(host.querySelector("iframe")).toBeNull();
  expect(host.textContent).toContain("r1·c1");
});

it("keeps script-like survey text from escaping the preview bootstrap", () => {
  const snippet = 'var label = "</script><script>unexpected()</script>";';
  act(() => root.render(<RespondentPreview snippet={snippet} />));
  const html = host.querySelector("iframe")!.srcdoc;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  expect(parsed.querySelectorAll("script")).toHaveLength(1);
  expect(() => new Function(parsed.querySelector("script")!.textContent!)).not.toThrow();
});
