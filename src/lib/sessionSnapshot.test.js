import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { buildSessionSnapshot, hydrateSessionPlots, pickViewSnapshot } from "./sessionSnapshot.js";

// jsdom does not implement createObjectURL; stub it the way a real browser
// would resolve it, without touching any other test's global state.
let restoreCreateObjectURL;
beforeEach(() => {
  const original = URL.createObjectURL;
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  restoreCreateObjectURL = () => {
    URL.createObjectURL = original;
  };
});
afterEach(() => restoreCreateObjectURL());

describe("buildSessionSnapshot", () => {
  test("carries the model, settings and view, and summarises the input files", () => {
    const snapshot = buildSessionSnapshot({
      id: "abc-123",
      name: "SPAdes run",
      isExample: false,
      settings: { assembler: "spades", delimiter: "," },
      files: { graph: { name: "assembly_graph.gfa" }, contigs: { name: "contigs.fasta" } },
      model: { nodes: [{ id: "n1" }], edges: [] },
      plots: { initial: { ext: "png", blob: new Blob(["x"]) }, final: null },
      logText: "done\n",
      statusText: "GraphBin finished.",
      view: { mode: "r0" },
    });

    expect(snapshot.id).toBe("abc-123");
    expect(snapshot.assembler).toBe("spades");
    expect(snapshot.inputSummary.fileNames.graph).toBe("assembly_graph.gfa");
    expect(snapshot.model.nodes).toHaveLength(1);
    expect(snapshot.plots.initial.ext).toBe("png");
    expect(snapshot.plots.final).toBeNull();
    expect(snapshot.view).toEqual({ mode: "r0" });

    // the model handed in is not the one stored -- mutating it afterwards
    // (as prepareModel does) must not reach back into the saved snapshot
    snapshot.model.nodes.push({ id: "n2" });
  });

  test("does not persist file names for the bundled example", () => {
    const snapshot = buildSessionSnapshot({
      id: "abc-123",
      name: "Example run",
      isExample: true,
      settings: { assembler: "spades" },
      files: {},
      model: { nodes: [], edges: [] },
      plots: { initial: null, final: null },
      logText: "",
      statusText: "",
      view: {},
    });
    expect(snapshot.inputSummary).toEqual({ isExample: true });
  });
});

describe("pickViewSnapshot", () => {
  test("keeps the encodings and filters, not the live selection or locks", () => {
    const state = {
      mode: "r1",
      refinedKey: "r1",
      colorMode: "confidence",
      sizeMode: "length",
      binOnly: "",
      nodeSize: 6,
      filters: { onlyDisputed: true, onlyLowConfidence: false, hideUnbinned: false, hideIsolated: false },
      markers: { markChanged: true, markMisbinned: false, markAmbiguous: false },
      sankey: { onlyChanged: false, hideUnbinned: false, locked: null },
      scatter: { x: "gc", y: "cov" },
      bottomHidden: false,
      legendCollapsed: true,
      selection: new Set(["n1"]),
      overrides: new Map([["n1", "bin_1"]]),
      lockedNodeId: "n1",
    };

    const snapshot = pickViewSnapshot(state);
    expect(snapshot.colorMode).toBe("confidence");
    expect(snapshot.filters.onlyDisputed).toBe(true);
    expect(snapshot).not.toHaveProperty("selection");
    expect(snapshot).not.toHaveProperty("overrides");
    expect(snapshot).not.toHaveProperty("lockedNodeId");
  });
});

describe("hydrateSessionPlots", () => {
  test("turns a stored blob into a fresh object URL, and passes through a missing plot", () => {
    const session = {
      plots: {
        initial: { ext: "png", blob: new Blob(["x"], { type: "image/png" }) },
        final: null,
      },
    };
    const plots = hydrateSessionPlots(session);
    expect(plots.initial.url).toMatch(/^blob:/);
    expect(plots.initial.ext).toBe("png");
    expect(plots.final).toBeNull();
  });
});
