import { render, screen, within } from "@testing-library/react";
import App from "./App.jsx";

test("renders main header and tabs", () => {
  render(<App />);

  expect(
    screen.getByRole("heading", { name: /GraphBin-Viz/i })
  ).toBeInTheDocument();

  const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
  expect(tabs).toEqual(["Run log & exports", "Workspace"]);
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

test("offers the filters as a chip row", () => {
  render(<App />);

  // scoped to the toolbar: the flow view has its own similarly named controls
  const toolbar = within(document.querySelector(".ws-toolbar"));

  for (const name of [
    /^Changed$/i,
    /^Disputed$/i,
    /^Low confidence$/i,
    /^Hide unbinned$/i,
    /^Hide isolated$/i,
    /^Changed between results$/i,
    /^Likely misbinned$/i,
    /^Ambiguous$/i,
  ]) {
    expect(toolbar.getByLabelText(name)).toBeInTheDocument();
  }
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
