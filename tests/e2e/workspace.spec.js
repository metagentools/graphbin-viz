import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { test, expect } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(here, "fixtures", "interactive_graph.json"), "utf8");

// 1x1 transparent PNG, stands in for the static plots
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/**
 * Load the workspace against a fixed export.
 *
 * Pyodide is replaced with a stub that returns the fixture, so these tests
 * exercise the visualization and interaction logic deterministically and
 * without downloading a Python runtime. The GraphBin pipeline itself is
 * covered by the Python tests.
 */
async function openWorkspace(page, { model = FIXTURE } = {}) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) {
      errors.push(m.text());
    }
  });

  // the example inputs are never read by the stub
  await page.route("**/data/**", (r) => r.fulfill({ status: 200, body: "stub" }));

  await page.addInitScript(({ model, PNG }) => {
    window.loadPyodide = async () => {
      const png = Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0));
      const files = new Map([["/out/interactive_graph.json", model]]);
      return {
        loadPackage: async () => {},
        runPythonAsync: async () => {},
        FS: {
          mkdir() {},
          writeFile(path, data) { files.set(path, data); },
          stat: () => ({ size: 10 }),
          readdir: (dir) =>
            dir === "/out"
              ? ["initial_binning_result.png", "final_GraphBin_binning_result.png"]
              : [],
          readFile(path, opts) {
            if (opts && opts.encoding === "utf8") return files.get(path) ?? "";
            return png;
          },
        },
      };
    };
  }, { model, PNG });

  await page.goto("/");
  await page.click("#example-btn");
  await expect
    .poll(() => page.locator("#output").innerText(), { timeout: 60_000 })
    .toContain("Interactive graph loaded");
  await page.click("#tab-interactive");
  await page.waitForTimeout(400); // the workspace re-fits once visible
  return errors;
}

/**
 * Click a flow in the diagram.
 *
 * A perfectly horizontal link has a zero-height geometric box, which never
 * satisfies the visibility check, so the click is forced onto its centre --
 * the same point on the stroke a reader would aim at.
 */
async function clickFirstFlow(page) {
  await page.locator("#sankey-svg path").first().click({ force: true });
}

/** Click over the canvas until a contig is hit; returns its canvas position. */
async function findContigPoint(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById("graph-canvas");
    const rect = canvas.getBoundingClientRect();
    for (let y = 4; y < rect.height; y += 4) {
      for (let x = 4; x < rect.width; x += 4) {
        const ev = new MouseEvent("click", {
          clientX: rect.left + x,
          clientY: rect.top + y,
          bubbles: true,
        });
        Object.defineProperty(ev, "offsetX", { get: () => x });
        Object.defineProperty(ev, "offsetY", { get: () => y });
        canvas.dispatchEvent(ev);
        // the record is open only when the panel shows a contig heading --
        // the summary also lists contig ids, so text alone is not enough
        if (document.querySelector("#prov-panel .prov-id")) {
          return { x, y };
        }
      }
    }
    return null;
  });
}

test("shows the graph, feature space and flow view at once", async ({ page }) => {
  const errors = await openWorkspace(page);

  await expect(page.locator("#graph-canvas")).toBeVisible();
  await expect(page.locator("#feature-scatter")).toBeVisible();
  await expect(page.locator("#sankey-svg")).toBeVisible();

  expect(await page.locator("#feature-scatter circle").count()).toBeGreaterThan(5);
  expect(await page.locator("#sankey-svg path").count()).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test("compares every binning result, not just two", async ({ page }) => {
  const errors = await openWorkspace(page);

  expect(await page.locator("#view-mode option").allTextContents()).toEqual([
    "Initial",
    "GraphBin",
    "OtherBinner",
  ]);
  expect(
    await page.locator("#sankey-title-row .sankey-title").allTextContents()
  ).toEqual(["Initial", "GraphBin", "OtherBinner"]);

  await page.selectOption("#view-mode", { label: "OtherBinner" });
  await expect(page.locator("#graph-view-title")).toContainText("OtherBinner");

  expect(errors).toEqual([]);
});

test("explains how a contig's bin was decided", async ({ page }) => {
  const errors = await openWorkspace(page);

  // at rest the inspector summarises the run rather than sitting empty
  await expect(page.locator("#inspector-title")).toHaveText("Refinement summary");
  await expect(page.locator("#prov-panel")).toContainText("Needs attention");

  const point = await findContigPoint(page);
  expect(point, "a contig is hit-testable on the canvas").not.toBeNull();

  const panel = page.locator("#prov-panel");
  await expect(panel).toContainText("Confidence");
  await expect(panel).toContainText("Hops to seed");
  await expect(panel).toContainText("Assignment across results");
  expect(await panel.innerText()).toMatch(
    /Kept from initial binning|Inferred by propagation|Label removed|No label available/
  );
  await expect(page.locator("#inspector-title")).toHaveText("Why this assignment?");

  // and back again
  await page.click("#inspector-back");
  await expect(page.locator("#inspector-title")).toHaveText("Refinement summary");

  expect(errors).toEqual([]);
});

test("a selection made in one view reaches the others", async ({ page }) => {
  const errors = await openWorkspace(page);

  await expect(page.locator("#selection-summary")).toHaveText("");

  await clickFirstFlow(page);
  await expect(page.locator("#selection-summary")).toContainText("contigs selected");

  await page.click("#clear-selection");
  await expect(page.locator("#selection-summary")).toHaveText("");

  expect(errors).toEqual([]);
});

test("encoding channels and propagation replay redraw cleanly", async ({ page }) => {
  const errors = await openWorkspace(page);

  for (const mode of ["confidence", "disagreement", "stage", "cov", "gc", "len", "bin"]) {
    await page.selectOption("#color-mode", mode);
    await expect(page.locator("#bin-legend")).not.toBeEmpty();
  }
  for (const mode of ["len", "cov", "degree", "uniform"]) {
    await page.selectOption("#size-mode", mode);
  }

  await page.selectOption("#view-mode", { label: "GraphBin" });
  const slider = page.locator("#replay-slider");
  await expect(slider).toBeEnabled();
  const max = await slider.getAttribute("max");
  expect(Number(max)).toBeGreaterThan(0);

  await slider.fill("1");
  await expect(page.locator("#replay-value")).toContainText("iter 1");
  await slider.fill(max);
  await expect(page.locator("#replay-value")).toContainText("final");

  const toggle = (id) => page.locator(`label.chip:has(#${id}) span`).click();
  await toggle("toggle-low-confidence");
  await expect(page.locator("#toggle-low-confidence")).toBeChecked();
  await toggle("toggle-low-confidence");
  await toggle("toggle-only-disputed");
  await expect(page.locator("#toggle-only-disputed")).toBeChecked();
  await toggle("toggle-only-disputed");

  expect(errors).toEqual([]);
});

test("assignments can be locked and the curated binning exported", async ({ page }) => {
  const errors = await openWorkspace(page);

  await expect(page.locator("#override-summary")).toContainText(
    "No locked assignments"
  );

  await clickFirstFlow(page);
  expect(
    (await page.locator("#override-bin option").allTextContents()).length
  ).toBeGreaterThan(1);
  await page.selectOption("#override-bin", { index: 1 });
  await page.click("#apply-override");
  await expect(page.locator("#override-summary")).toContainText("locked");

  const download = page.waitForEvent("download");
  await page.click("#export-curated");
  expect((await download).suggestedFilename()).toBe(
    "graphbin_viz_curated_binning.csv"
  );

  await page.click("#clear-overrides");
  await expect(page.locator("#override-summary")).toContainText(
    "No locked assignments"
  );

  expect(errors).toEqual([]);
});

test("the summary offers a way into the contested contigs", async ({ page }) => {
  const errors = await openWorkspace(page);

  // the decision-stage breakdown selects the contigs it describes
  await page.locator("#prov-panel .sum-row").first().click();
  await expect(page.locator("#selection-summary")).toContainText("contigs selected");
  await page.click("#clear-selection");

  // so does a confidence bucket
  await page.locator("#prov-panel .sum-hist-row:not([disabled])").first().click();
  await expect(page.locator("#selection-summary")).toContainText("contigs selected");
  await page.click("#clear-selection");

  // and a row in "needs attention" opens that contig's record
  const rows = page.locator("#prov-panel .sum-attention-row");
  if (await rows.count()) {
    await rows.first().click();
    await expect(page.locator("#inspector-title")).toHaveText("Why this assignment?");
    await expect(page.locator("#prov-panel")).toContainText("NODE_");
  }

  expect(errors).toEqual([]);
});

test("the lower views can be collapsed to give the graph the full panel", async ({ page }) => {
  const errors = await openWorkspace(page);

  await expect(page.locator("#ws-bottom")).toBeVisible();
  await page.click("#toggle-bottom-row");
  await expect(page.locator("#ws-bottom")).toBeHidden();
  await expect(page.locator("#toggle-bottom-row")).toHaveText("Show lower views");

  await page.click("#toggle-bottom-row");
  await expect(page.locator("#ws-bottom")).toBeVisible();

  expect(errors).toEqual([]);
});

test("reset view centres the graph on the canvas", async ({ page }) => {
  const errors = await openWorkspace(page);

  await page.click("#reset-view");
  await page.waitForTimeout(700); // the fit animates

  // Measure where the drawing actually sits: the canvas is cleared to
  // transparent, so any pixel with alpha is ink.
  const box = await page.evaluate(() => {
    const canvas = document.getElementById("graph-canvas");
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const { data } = ctx.getImageData(0, 0, width, height);

    let minX = width, maxX = -1, minY = height, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { width, height, minX, maxX, minY, maxY };
  });

  expect(box.maxX, "something was drawn").toBeGreaterThan(0);

  const leftGap = box.minX;
  const rightGap = box.width - box.maxX;
  const topGap = box.minY;
  const bottomGap = box.height - box.maxY;

  // the leftover space belongs on both sides, not all on one
  expect(Math.abs(leftGap - rightGap)).toBeLessThan(box.width * 0.08);
  expect(Math.abs(topGap - bottomGap)).toBeLessThan(box.height * 0.08);

  expect(errors).toEqual([]);
});

test("replay hides the result markers and honours the speed control", async ({ page }) => {
  const errors = await openWorkspace(page);

  // the finished result is marked up; playback should not be
  await page.selectOption("#view-mode", { label: "GraphBin" });
  await page.selectOption("#replay-speed", "1600");

  const slider = page.locator("#replay-slider");
  await slider.fill("1");
  await expect(page.locator("#replay-hint")).toContainText("result markers are hidden");

  await slider.fill(await slider.getAttribute("max"));
  await expect(page.locator("#replay-hint")).toContainText(
    "Step through how labels spread"
  );

  // playing at the slowest speed advances at most one step in half a second
  await slider.fill("0");
  await page.click("#replay-play");
  await expect(page.locator("#replay-play")).toHaveText("Pause");
  await page.waitForTimeout(500);
  const value = await page.locator("#replay-value").innerText();
  expect(["iter 0", "iter 1"]).toContain(value);
  await page.click("#replay-play");
  await expect(page.locator("#replay-play")).toHaveText("Play");

  expect(errors).toEqual([]);
});

test("confidence is a colour channel rather than a second marker", async ({ page }) => {
  const errors = await openWorkspace(page);

  // no separate halo encoding competing with the bin colours
  expect(await page.locator("#bin-legend .legend-halo").count()).toBe(0);

  await page.selectOption("#color-mode", "confidence");
  await expect(page.locator("#bin-legend")).toContainText("low confidence");
  await expect(page.locator("#bin-legend")).toContainText("high confidence");

  expect(errors).toEqual([]);
});

test("range tracks fill their whole width at the ends", async ({ page }) => {
  const errors = await openWorkspace(page);

  const fill = (id) =>
    page.locator(`#${id}`).evaluate((el) => el.style.getPropertyValue("--fill"));

  await page.selectOption("#view-mode", { label: "GraphBin" });
  const slider = page.locator("#replay-slider");
  const max = await slider.getAttribute("max");

  // at the maximum the track reads as complete, not a thumb-width short
  await slider.fill(max);
  expect(await fill("replay-slider")).toBe("100%");

  // and as empty at the minimum
  await slider.fill("0");
  expect(await fill("replay-slider")).toBe("0%");

  // the node size slider is painted the same way
  await page.locator("#node-size").fill("16");
  expect(await fill("node-size")).toBe("100%");
  await page.locator("#node-size").fill("2");
  expect(await fill("node-size")).toBe("0%");

  expect(errors).toEqual([]);
});

test("marker overlays are off until switched on from the toolbar", async ({ page }) => {
  const errors = await openWorkspace(page);

  const toggle = (id) => page.locator(`label.chip:has(#${id}) span`).click();

  // nothing is marked on arrival, and the legend describes only what is drawn
  for (const id of [
    "toggle-mark-changed",
    "toggle-mark-misbinned",
    "toggle-mark-ambiguous",
  ]) {
    await expect(page.locator(`#${id}`)).not.toBeChecked();
  }
  await expect(page.locator("#bin-legend")).not.toContainText(
    "Changed between results"
  );

  await toggle("toggle-mark-changed");
  await expect(page.locator("#toggle-mark-changed")).toBeChecked();
  await expect(page.locator("#bin-legend")).toContainText("Changed between results");

  await toggle("toggle-mark-misbinned");
  await expect(page.locator("#bin-legend")).toContainText("Likely misbinned");

  await toggle("toggle-mark-changed");
  await expect(page.locator("#toggle-mark-changed")).not.toBeChecked();
  await expect(page.locator("#bin-legend")).not.toContainText(
    "Changed between results"
  );
  // the other marker is untouched
  await expect(page.locator("#bin-legend")).toContainText("Likely misbinned");

  expect(errors).toEqual([]);
});

test("replay is available only on the result propagation produced", async ({ page }) => {
  const errors = await openWorkspace(page);

  // the initial binning was never propagated, so there is nothing to replay
  await expect(page.locator("#replay-slider")).toBeDisabled();
  await expect(page.locator("#replay-play")).toBeDisabled();
  await expect(page.locator("#replay-speed")).toBeDisabled();
  await expect(page.locator(".replay-bar")).toHaveClass(/is-disabled/);
  await expect(page.locator("#replay-hint")).toContainText("GraphBin");

  await page.selectOption("#view-mode", { label: "GraphBin" });
  await expect(page.locator("#replay-slider")).toBeEnabled();
  await expect(page.locator("#replay-play")).toBeEnabled();
  await expect(page.locator(".replay-bar")).not.toHaveClass(/is-disabled/);

  // scrubbing and then leaving the result restores the finished state
  await page.locator("#replay-slider").fill("1");
  await expect(page.locator("#replay-value")).toContainText("iter 1");
  await page.selectOption("#view-mode", { label: "Initial" });
  await expect(page.locator("#replay-value")).toHaveText("final");
  await expect(page.locator("#replay-slider")).toBeDisabled();

  expect(errors).toEqual([]);
});
