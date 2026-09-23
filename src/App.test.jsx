import { render, screen, within } from "@testing-library/react";
import App from "./App.jsx";

test("renders main header and tabs", () => {
  render(<App />);

  expect(
    screen.getByRole("heading", { name: /GraphBin-Viz/i })
  ).toBeInTheDocument();

  // by accessible name, not textContent: a Fluent Tab carries a hidden
  // copy of its label to reserve the width the selected (bold) state needs
  expect(screen.getAllByRole("tab")).toHaveLength(2);
  expect(
    screen.getByRole("tab", { name: "Run log & exports" })
  ).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Workspace" })).toBeInTheDocument();
});

test("shows the graph, feature space and flow views together", () => {
  render(<App />);

  // the three linked views live in one panel rather than separate tabs
  expect(document.getElementById("graph-canvas")).toBeInTheDocument();
  expect(document.getElementById("feature-scatter")).toBeInTheDocument();
  expect(document.getElementById("sankey-svg")).toBeInTheDocument();
});

test("offers the inspector and curation panels", () => {
  render(<App />);

  expect(document.getElementById("prov-panel")).toBeInTheDocument();
  expect(document.getElementById("inspector-title")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Lock assignment/i })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Re-run refinement/i })
  ).toBeInTheDocument();
});

test("offers the encoding channels and propagation replay", () => {
  render(<App />);

  // queried by id: the help "?" control shares the visible label text
  expect(document.getElementById("color-mode")).toBeInTheDocument();
  expect(document.getElementById("size-mode")).toBeInTheDocument();
  expect(document.getElementById("replay-slider")).toBeInTheDocument();
});

test("accepts additional binning results for comparison", () => {
  render(<App />);
  const input = document.getElementById("extra-results");
  expect(input).toBeInTheDocument();
  expect(input).toHaveAttribute("multiple");
});

test("offers the filters and markers as a toggle row", () => {
  render(<App />);

  const toolbar = document.querySelector(".ws-toolbar");

  // queried by id: the filter and the marker for the same property share a
  // label, told apart by the SHOW / MARK group they sit in
  for (const id of [
    "toggle-only-disputed",
    "toggle-low-confidence",
    "toggle-hide-unbinned",
    "toggle-hide-isolated",
    "toggle-mark-changed",
    "toggle-mark-misbinned",
    "toggle-mark-ambiguous",
  ]) {
    const input = document.getElementById(id);
    expect(input, id).toBeInTheDocument();
    expect(toolbar.contains(input)).toBe(true);
  }

  // "changed by refinement" is offered as a marker, not as a second filter
  expect(document.getElementById("toggle-only-changed")).toBeNull();
});

test("puts the encoding controls in a toolbar above the graph", () => {
  render(<App />);

  const toolbar = document.querySelector(".ws-toolbar");
  expect(toolbar).toBeInTheDocument();
  for (const id of ["view-mode", "color-mode", "size-mode", "bin-filter", "node-size"]) {
    expect(toolbar.contains(document.getElementById(id))).toBe(true);
  }
});

test("keeps the legend with the graph and lets the lower views collapse", () => {
  render(<App />);

  const canvasWrap = document.querySelector(".interactive-canvas-wrap");
  expect(canvasWrap.contains(document.getElementById("bin-legend"))).toBe(true);
  expect(document.getElementById("toggle-bottom-row")).toBeInTheDocument();
});
