import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditorProvider, useEditor } from "../EditorContext";
import { MISSING_TITLE_MESSAGE } from "../lib/saveEditorSurvey";
import { STORAGE_FULL_MESSAGE } from "../lib/surveysApi";
import SaveButton from "./SaveButton";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const host = document.createElement("div");
document.body.appendChild(host);
let root = createRoot(host);
let editor: ReturnType<typeof useEditor>;

function EditorSpy() {
  editor = useEditor();
  return null;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  act(() => root.render(<EditorProvider><EditorSpy /><SaveButton /></EditorProvider>));
});

afterEach(() => {
  act(() => root.unmount());
  root = createRoot(host);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const button = () => host.querySelector("button")!;
const message = () => host.querySelector('[role="alert"]')?.textContent ?? null;
const clickSave = () => act(async () => button().click());
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const nameSurvey = (name: string) =>
  act(() => editor.dispatch({ type: "setConfig", config: { ...editor.state.config, name } }));
const fillStorage = () =>
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("quota", "QuotaExceededError");
  });

it("keeps a failed save on screen after the title reminder's time is up", async () => {
  await clickSave();
  expect(message()).toBe(MISSING_TITLE_MESSAGE);
  wait(1000);
  nameSurvey("Map");
  fillStorage();
  await clickSave();
  expect(message()).toBe(STORAGE_FULL_MESSAGE);
  wait(5000);
  expect(message()).toBe(STORAGE_FULL_MESSAGE);
});

it("keeps a failed save on screen after Saved!'s time is up", async () => {
  nameSurvey("Map");
  await clickSave();
  expect(button().textContent).toBe("Saved!");
  wait(1000);
  fillStorage();
  await clickSave();
  expect(message()).toBe(STORAGE_FULL_MESSAGE);
  wait(5000);
  expect(message()).toBe(STORAGE_FULL_MESSAGE);
});

it("still hides the title reminder and Saved!, and leaves no timer running", async () => {
  await clickSave();
  wait(3000);
  expect(message()).toBeNull();
  nameSurvey("Map");
  await clickSave();
  expect(button().textContent).toBe("Saved!");
  wait(2000);
  expect(button().textContent).toBe("Save");
  await clickSave();
  // jsdom sends the storage event on a 0 ms timer; let it go so that only
  // the button's own timer is left.
  wait(0);
  expect(vi.getTimerCount()).toBe(1);
  act(() => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
});
