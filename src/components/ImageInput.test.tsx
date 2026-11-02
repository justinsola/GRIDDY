import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import ImageInput from "./ImageInput";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const host = document.createElement("div");
document.body.appendChild(host);
let root = createRoot(host);

afterEach(() => {
  act(() => root.unmount());
  root = createRoot(host);
});

const addressBox = () => host.querySelector<HTMLInputElement>('input[type="url"]')!;
const buttonByText = (text: string) =>
  Array.from(host.querySelectorAll("button")).find((button) => button.textContent === text)!;
/** The text an element's aria-describedby points to. */
const description = (element: Element) =>
  document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent;

it("names the address box, and lets the hint describe both ways of choosing a picture", () => {
  act(() => root.render(<ImageInput value="" onChange={() => {}} hint="Use a transparent PNG." />));
  expect(addressBox().getAttribute("aria-label")).toBe("Image URL");
  expect(description(addressBox())).toBe("Use a transparent PNG.");
  expect(description(buttonByText("Upload image"))).toBe("Use a transparent PNG.");
});

it("points to no hint when there is none", () => {
  act(() => root.render(<ImageInput value="https://example.com/map.png" onChange={() => {}} />));
  expect(addressBox().getAttribute("aria-label")).toBe("Image URL");
  expect(addressBox().hasAttribute("aria-describedby")).toBe(false);
  expect(buttonByText("Replace image").hasAttribute("aria-describedby")).toBe(false);
});

it("names the address box after the picture it is for", () => {
  act(() => root.render(<ImageInput value="" onChange={() => {}} label="Background image URL" />));
  expect(addressBox().getAttribute("aria-label")).toBe("Background image URL");
});
