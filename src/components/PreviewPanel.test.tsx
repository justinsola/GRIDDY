import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EditorProvider } from "../EditorContext";
import ConfigPanel from "./ConfigPanel";
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

it("closes the export dialog with Escape", () => {
  act(() => root.render(<EditorProvider><PreviewPanel /></EditorProvider>));
  const exportButton = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Export to Qualtrics",
  )!;
  act(() => exportButton.click());
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});

it("leaves block-cells mode when the researcher picks a category to place", () => {
  act(() => root.render(<EditorProvider><ConfigPanel /><PreviewPanel /></EditorProvider>));
  const buttonByText = (text: string) =>
    Array.from(host.querySelectorAll("button")).find((button) => button.textContent === text)!;
  act(() => buttonByText("+ Add barrier").click());
  act(() => buttonByText("Block cells").click());
  expect(buttonByText("Done blocking")).toBeDefined();
  const familyChips = Array.from(host.querySelectorAll("button")).filter(
    (button) => button.textContent?.trim() === "Family",
  );
  act(() => familyChips[familyChips.length - 1].click());
  expect(Array.from(host.querySelectorAll("button")).some((b) => b.textContent === "Done blocking")).toBe(false);
  expect(buttonByText("Block cells")).toBeDefined();
});
