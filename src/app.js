export function initApp() {
  if (window.__graphbinAppInitialized) return;
  window.__graphbinAppInitialized = true;

const outputEl = document.getElementById("output");
const graphbinStatusEl = document.getElementById("graphbin-status");
let graphbinStatusBuffer = [];
let graphbinStatusHasLog = false;

const NODE_RADIUS = {
  base: 5.5,     // default node radius
  hover: 7.5,    // on hover
  locked: 8.5,   // on click
};

const NODE_RADIUS_DELTA = {
  hover: NODE_RADIUS.hover - NODE_RADIUS.base,
  locked: NODE_RADIUS.locked - NODE_RADIUS.base,
};

const GRAPHBIN_DEFAULTS = {
  max_iteration: 50,
  diff_threshold: 0.00001,
  min_bin_size: 5,
};

const BRAND_BLUE = "#007fff";
const BRAND_RED = "#ff0000";

// Initial placeholder when page loads
outputEl.textContent = "(logs will appear here)\n\n";

function log(msg) {
  outputEl.textContent += msg + "\n";
}

function mapGraphbinError(statusText, fallbackErr) {
  const text = String(statusText || "");
  if (text.toLowerCase().includes("input mismatch")) {
    return new Error(
      "Input mismatch between initial binning results and provided assembly/contig files. Please check inputs."
    );
  }
  return fallbackErr;
}

function setGraphbinStatus(msg) {
  if (!graphbinStatusEl) return;
  graphbinStatusEl.textContent = msg;
}

function resetGraphbinStatus(msg) {
  graphbinStatusBuffer = [];
  graphbinStatusHasLog = false;
  setGraphbinStatus(msg);
}

function appendGraphbinStatus(msg) {
  if (!graphbinStatusEl) return;
  const lines = String(msg ?? "").split("\n");
  for (const line of lines) {
    graphbinStatusBuffer.push(line);
  }
  if (graphbinStatusBuffer.length > 2000) {
    graphbinStatusBuffer = graphbinStatusBuffer.slice(-2000);
  }
  graphbinStatusHasLog = true;
  graphbinStatusEl.textContent = graphbinStatusBuffer.join("\n");
  graphbinStatusEl.scrollTop = graphbinStatusEl.scrollHeight;
}

window.graphbinLog = appendGraphbinStatus;

// store Pyodide init promise here, but don't start it yet
let pyodideReady = null;

// Track last generated plot paths for download
let lastInitialImgPath = null;
let lastFinalImgPath = null;
let lastGraphbinZipPath = null;
let benchmarkRunId = 0;

window.__lastBenchmark = null;
window.__benchmarkHistory = [];

function nowMs() {
  if (window.performance && typeof window.performance.now === "function") {
    return window.performance.now();
  }
  return Date.now();
}

function roundMs(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function publishRunningBenchmark(run) {
  window.__lastBenchmark = {
    run_id: run.run_id,
    status: "running",
    source: run.source,
    dataset: run.dataset,
    assembler: run.assembler,
    started_at: run.started_at,
  };
}

function startBenchmarkRun({ source, dataset, assembler, delimiter, fileSizes }) {
  benchmarkRunId += 1;
  const run = {
    run_id: benchmarkRunId,
    source,
    dataset,
    assembler: assembler || "spades",
    delimiter,
    started_at: new Date().toISOString(),
    user_agent: navigator.userAgent,
    file_sizes_bytes: fileSizes || {},
    counts: { nodes: null, edges: null },
    phase_ms: {
      pyodide_init: null,
      input_load: null,
      graphbin: null,
      visualize: null,
      layout: null,
      interactive_prepare: null,
      interactive_render_ready: null,
    },
    error: null,
    _started_perf_ms: nowMs(),
  };
  publishRunningBenchmark(run);
  return run;
}

function finishBenchmarkRun(run, { status, error = null } = {}) {
  const completedAt = new Date().toISOString();
  const totalMs = roundMs(nowMs() - run._started_perf_ms);
  const result = {
    run_id: run.run_id,
    source: run.source,
    dataset: run.dataset,
    assembler: run.assembler,
    delimiter: run.delimiter,
    status: status || "success",
    started_at: run.started_at,
    completed_at: completedAt,
    total_ms: totalMs,
    user_agent: run.user_agent,
    file_sizes_bytes: run.file_sizes_bytes,
    counts: run.counts,
    phase_ms: run.phase_ms,
    error: error || run.error || null,
  };

  window.__lastBenchmark = result;
  if (!Array.isArray(window.__benchmarkHistory)) {
    window.__benchmarkHistory = [];
  }
  window.__benchmarkHistory.push(result);
  if (window.__benchmarkHistory.length > 200) {
    window.__benchmarkHistory = window.__benchmarkHistory.slice(-200);
  }
  return result;
}

function waitForRenderFrame(drawFn) {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      drawFn();
      resolve();
    });
  });
}

function getPyodideFileSize(pyodide, path) {
  try {
    return pyodide.FS.stat(path).size;
  } catch (e) {
    return null;
  }
}

/* =========================
   Interactive graph globals
   ========================= */
let graphModel = null;

let canvas = null;
let ctx = null;
let zoomBehavior = null;
let currentTransform = null;

let hoverNodeId = null;
let lockedNodeId = null;

let baseNodeRadius = NODE_RADIUS.base;

// sankey state
let sankeyLocked = null; // {srcBin, dstBin} or null

// filters
let filters = {
  mode: "r0", // key of the binning result currently drawn in the graph
  binOnly: "", // "" = all
  hideUnbinned: false,
  onlyChanged: false,
  hideIsolated: false,
  // Marker overlays are opt-in: a graph that arrives pre-annotated hides its
  // own structure behind rings nobody asked for.
  markChanged: false,
  markMisbinned: false,
  markAmbiguous: false,
  khopFrom: null, // node id or null
  khopK: 0,
  collapseTips: false,
  colorMode: "bin", // bin | confidence | disagreement | stage | cov | gc | len
  sizeMode: "uniform", // uniform | len | cov | degree
  onlyDisputed: false,
  onlyLowConfidence: false,
};

/* -----------------------------------------------------------------
 * Shared analytical state
 *
 * `selection` is the one piece of state every view reads: brushing the
 * feature scatter, clicking a flow, or clicking a contig all write to it,
 * and the graph, the scatter and the flow diagram all render from it.
 * ----------------------------------------------------------------- */
let selection = new Set();
let selectionLabel = "";

// analyst-locked assignments: node id -> bin label
let overrides = new Map();

// propagation replay
let replay = { active: false, iter: 0, max: 0, timer: null, intervalMs: 600 };

// scatter state
let scatterBrush = null;

// enough context to re-run refinement under locked assignments
let lastRunContext = null;

// Decision-stage palette: three chromatic slots, validated for all-pairs
// separation under normal and colour-deficient vision against a light plot
// surface, plus neutral grey for "no label available". Every stage is also
// named in the legend and in the record panel, so identity is never colour
// alone.
const STAGE_PALETTE = {
  light: {
    seed: "#2a78d6",
    stripped: "#eb6834",
    propagated: "#1baf7a",
    unresolved: "#b6bdc9",
  },
};

const STAGE_GROUPS = {
  seed: "seed",
  locked: "seed",
  propagated: "propagated",
  stripped_neighbour: "stripped",
  stripped_closest: "stripped",
  stripped_post: "stripped",
  unresolved: "unresolved",
};

const STAGE_LABELS = {
  seed: "Kept from initial binning",
  locked: "Locked by analyst",
  propagated: "Inferred by propagation",
  stripped_neighbour: "Label removed (neighbours disagreed)",
  stripped_closest: "Label removed (nearest labelled contigs disagreed)",
  stripped_post: "Label removed after propagation",
  unresolved: "No label available",
};

// spatial index (grid hash in world coords)
let spatial = { cell: 20, map: new Map() };

// bin -> color (stable palette per dataset)
let binColorMap = new Map();


function resetInteractiveViews() {
  /* =============================
   * Reset global interaction state
   * ============================= */
  window.selectedNode = null;
  window.selectedBin = null;
  window.hoveredNode = null;
  window.lockedSelection = false;

  // Sankey-specific state
  window.sankeyLocked = false;
  window.sankeyLockedKey = null;

  // Zoom / pan state (if used)
  window.currentTransform = null;
  currentTransform = null;
  hoverNodeId = null;
  lockedNodeId = null;

  /* =============================
   * Clear interactive canvas plot
   * ============================= */
  const c = document.getElementById("graph-canvas");
  if (c) {
    const cctx = c.getContext("2d");
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, c.width, c.height);
  }
  canvas = null;
  ctx = null;
  zoomBehavior = null;

  /* =============================
   * Clear bin legend
   * ============================= */
  const legend = document.getElementById("bin-legend");
  if (legend) {
    legend.innerHTML = "";
  }

  /* =============================
   * Hide interactive tooltip
   * ============================= */
  const tooltip = document.getElementById("hover-tooltip");
  if (tooltip) {
    tooltip.style.display = "none";
    tooltip.innerHTML = "";
  }

  /* =============================
   * Clear Sankey diagram
   * ============================= */
  const sankeySvg = document.getElementById("sankey-svg");
  if (sankeySvg) {
    sankeySvg.replaceChildren(); // removes all nodes, links, labels
  }

  const sankeyTooltip = document.getElementById("sankey-tooltip");
  if (sankeyTooltip) {
    sankeyTooltip.style.display = "none";
    sankeyTooltip.innerHTML = "";
  }

  // Reset flow stats
  setFlowStat("flow-stat-changed", "—");
  setFlowStat("flow-stat-reassigned", "—");
  setFlowStat("flow-stat-unbinned-to-binned", "—");
  setFlowStat("flow-stat-binned-to-unbinned", "—");

  // Only contigs that changed bin → unchecked
  const sankeyOnlyChanged = document.getElementById("sankey-only-changed");
  if (sankeyOnlyChanged) {
    sankeyOnlyChanged.checked = false;
  }

  // Hide unbinned → unchecked
  const sankeyHideUnbinned = document.getElementById("sankey-hide-unbinned");
  if (sankeyHideUnbinned) {
    sankeyHideUnbinned.checked = false;
  }

  /* =============================
   * Reset controls to defaults
   * ============================= */

  // Binning to display → first result
  const viewMode = document.getElementById("view-mode");
  if (viewMode && viewMode.options.length) {
    viewMode.selectedIndex = 0;
  }

  // Shared analytical state
  selection = new Set();
  selectionLabel = "";
  overrides = new Map();
  stopReplay();
  replay = { active: false, iter: 0, max: 0, timer: null, intervalMs: replay.intervalMs };
  filters.colorMode = "bin";
  filters.sizeMode = "uniform";
  filters.markChanged = false;
  filters.markMisbinned = false;
  filters.markAmbiguous = false;

  for (const id of [
    "toggle-mark-changed",
    "toggle-mark-misbinned",
    "toggle-mark-ambiguous",
  ]) {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  }
  filters.onlyDisputed = false;
  filters.onlyLowConfidence = false;
  featureExtents = null;

  const colorModeEl = document.getElementById("color-mode");
  if (colorModeEl) colorModeEl.value = "bin";
  const sizeModeEl = document.getElementById("size-mode");
  if (sizeModeEl) sizeModeEl.value = "uniform";
  const onlyDisputedEl = document.getElementById("toggle-only-disputed");
  if (onlyDisputedEl) onlyDisputedEl.checked = false;
  const lowConfEl = document.getElementById("toggle-low-confidence");
  if (lowConfEl) lowConfEl.checked = false;
  updateSelectionSummary();

  // Bin filter → (all bins)
  const binFilter = document.getElementById("bin-filter");
  if (binFilter) {
    binFilter.value = "";
  }

  // Hide unbinned → unchecked
  const hideUnbinned = document.getElementById("toggle-hide-unbinned");
  if (hideUnbinned) {
    hideUnbinned.checked = false;
  }

  // Show only changed → unchecked
  const onlyChanged = document.getElementById("toggle-only-changed");
  if (onlyChanged) {
    onlyChanged.checked = false;
  }

  // Node size slider → default
  const nodeSize = document.getElementById("node-size");
  if (nodeSize) {
    nodeSize.value = String(NODE_RADIUS.base);
    updateRangeFill(nodeSize);
  }
  setBaseNodeRadius(NODE_RADIUS.base);

  // Hide isolated contigs → unchecked
  const hideIsolated = document.getElementById("toggle-hide-isolated");
  if (hideIsolated) {
    hideIsolated.checked = false;
  }

}




/* =========================
   File size checks
   ========================= */
const MAX_CONTIGS = 10000;

function countFastaContigs(text) {
  let count = 0;
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith(">")) count += 1;
  }
  return count;
}

async function validateContigsCount(file) {
  const text = await file.text();
  const contigCount = countFastaContigs(text);
  return {
    ok: contigCount <= MAX_CONTIGS,
    count: contigCount,
  };
}

document.getElementById("graph").addEventListener("change", function () {
  const file = this.files[0];
  const MAX_SIZE = 200 * 1024 * 1024; // 200MB
  if (file && !file.name.toLowerCase().endsWith(".gfa")) {
    alert("Please upload a valid GFA file ending with .gfa.");
    this.value = "";
    return;
  }
  if (file && file.size > MAX_SIZE) {
    alert("GFA file is too large! Maximum allowed size is 200 MB.");
    this.value = "";
  }
});

document.getElementById("contigs").addEventListener("change", async function () {
  const file = this.files[0];
  const MAX_SIZE = 200 * 1024 * 1024; // 200MB
  const ALLOWED_EXTENSIONS = [".fasta", ".fa", ".fna"];
  delete this.dataset.contigCount;

  if (
    file &&
    !ALLOWED_EXTENSIONS.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    )
  ) {
    alert("Please upload a contigs file ending with .fasta, .fa, or .fna.");
    this.value = "";
    return;
  }

  if (file && file.size > MAX_SIZE) {
    alert("Contigs file is too large! Maximum allowed size is 200 MB.");
    this.value = "";
    return;
  }

  if (!file) return;

  try {
    const result = await validateContigsCount(file);
    if (!result.ok) {
      alert(
        `Contigs file has ${result.count.toLocaleString()} contigs. Maximum allowed is ${MAX_CONTIGS.toLocaleString()}.`
      );
      this.value = "";
      return;
    }
    this.dataset.contigCount = String(result.count);
  } catch (e) {
    alert("Failed to read contigs file. Please upload a valid FASTA file.");
    this.value = "";
  }
});

document.getElementById("initial").addEventListener("change", function () {
  const file = this.files[0];
  const ALLOWED_EXTENSIONS = [".csv", ".tsv"];
  if (
    file &&
    !ALLOWED_EXTENSIONS.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    )
  ) {
    alert("Please upload an initial binning result file ending with .csv or .tsv.");
    this.value = "";
  }
});

const assemblerSelect = document.getElementById("assembler");
const pathsInput = document.getElementById("paths");
const pathsRow = document.getElementById("paths-row");
const pathsLabel = document.querySelector('label[for="paths"]');

function syncAssemblerInputs() {
  const assembler = assemblerSelect ? assemblerSelect.value : "spades";
  const isSpades = assembler === "spades";

  if (pathsInput) {
    pathsInput.disabled = !isSpades;
    if (!isSpades) {
      pathsInput.value = "";
    }
  }

  if (pathsRow) {
    pathsRow.style.opacity = "1";
  }

  if (pathsLabel) {
    pathsLabel.textContent = isSpades
      ? "Paths file"
      : "Paths file";
  }
}

if (assemblerSelect) {
  assemblerSelect.addEventListener("change", syncAssemblerInputs);
  syncAssemblerInputs();
}

/* =========================
   Pyodide init
   ========================= */
async function getPyodide() {
  if (pyodideReady) return pyodideReady;

  pyodideReady = (async () => {
    log("Loading Pyodide...");
    const pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/",
    });

    log("Loading igraph + matplotlib...");
    await pyodide.loadPackage(["igraph", "matplotlib"]);

    // Directories in the Pyodide FS
    try {
      pyodide.FS.mkdir("/py");
    } catch (e) {}
    try {
      pyodide.FS.mkdir("/py/graphbin");
    } catch (e) {}
    try {
      pyodide.FS.mkdir("/py/graphbin/parsers");
    } catch (e) {}
    try {
      pyodide.FS.mkdir("/py/graphbin/labelpropagation");
    } catch (e) {}
    try {
      pyodide.FS.mkdir("/data");
    } catch (e) {}
    try {
      pyodide.FS.mkdir("/out");
    } catch (e) {}

    // Fetch Python files and write them into Pyodide’s filesystem
    const files = [
      "spades_plot.py",
      "megahit_plot.py",
      "bidictmap.py",
      "export_common.py",
      "interactive_export.py",
      "interactive_export_megahit.py",
      "graphbin/graphbin_SPAdes.py",
      "graphbin/graphbin_MEGAHIT.py",
      "graphbin/graphbin_Func.py",
      "graphbin/labelpropagation/__init__.py",
      "graphbin/labelpropagation/labelprop.py",
      "graphbin/parsers/__init__.py",
      "graphbin/parsers/spades_parser.py",
      "graphbin/parsers/megahit_parser.py",
    ];
    log("Loading Python files into Pyodide FS...");
    for (const f of files) {
      const text = await (await fetch("py/" + f)).text();
      pyodide.FS.writeFile("/py/" + f, text);
    }

    // Make Pyodide import from /py
    await pyodide.runPythonAsync(`
import sys
if "/py" not in sys.path:
    sys.path.append("/py")
if "/py/graphbin" not in sys.path:
    sys.path.append("/py/graphbin")
    `);

    return pyodide;
  })();

  return pyodideReady;
}

/* =========================
   Helpers: FS read/write
   ========================= */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

async function writeUploadedFile(pyodide, inputFile, destPath) {
  const buf = await readFileAsArrayBuffer(inputFile);
  const data = new Uint8Array(buf);
  pyodide.FS.writeFile(destPath, data);
  return destPath;
}

async function writeServerFile(pyodide, url, destPath) {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`);
  }
  const buf = await resp.arrayBuffer();
  const data = new Uint8Array(buf);
  pyodide.FS.writeFile(destPath, data);
  return destPath;
}

function readJsonFromPyodide(pyodide, path) {
  const data = pyodide.FS.readFile(path, { encoding: "utf8" });
  return JSON.parse(data);
}

function readTextFromPyodide(pyodide, path) {
  return pyodide.FS.readFile(path, { encoding: "utf8" });
}

function readLayoutTimingFromPyodide(pyodide, path = "/out/layout_timing.json") {
  try {
    const data = readJsonFromPyodide(pyodide, path);
    const layoutMs = Number(data?.layout_ms);
    return Number.isFinite(layoutMs) ? roundMs(layoutMs) : null;
  } catch (e) {
    return null;
  }
}

function getFileExtension(path) {
  const match = String(path || "").match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function mimeForExtension(ext) {
  if (ext === "png") return "image/png";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

function fileToObjectUrl(pyodide, path) {
  const ext = getFileExtension(path);
  const data = pyodide.FS.readFile(path); // Uint8Array
  const blob = new Blob([data], { type: mimeForExtension(ext) });
  return URL.createObjectURL(blob);
}

function setPlotMedia(pyodide, which, path) {
  const ext = getFileExtension(path);
  const img = document.getElementById(`${which}-img`);
  const pdf = document.getElementById(`${which}-pdf`);
  const url = fileToObjectUrl(pyodide, path);
  if (ext === "pdf") {
    if (img) img.style.display = "none";
    if (pdf) {
      pdf.style.display = "block";
      pdf.src = url;
    }
  } else {
    if (pdf) {
      pdf.style.display = "none";
      pdf.src = "";
    }
    if (img) {
      img.style.display = "block";
      img.src = url;
    }
  }
}

/* =========================
   Main: Run user inputs
   ========================= */
async function runInputPlot() {
  // clear old logs and hide old plots
  outputEl.textContent = "";
  resetGraphbinStatus("(GraphBin logs will appear here)");
  const initialBlock = document.getElementById("initial-block");
  const finalBlock = document.getElementById("final-block");
  if (initialBlock) initialBlock.style.display = "none";
  if (finalBlock) finalBlock.style.display = "none";

  const graph = document.getElementById("graph").files[0];
  const contigs = document.getElementById("contigs").files[0];
  const assembler = document.getElementById("assembler").value;
  const requiresPaths = assembler === "spades";
  const paths = document.getElementById("paths").files[0];
  const initial = document.getElementById("initial").files[0];

  const setDpi = parseInt(document.getElementById("setting-dpi").value);
  const setWidth = parseInt(document.getElementById("setting-width").value);
  const setHeight = parseInt(document.getElementById("setting-height").value);
  const setVsize = parseInt(document.getElementById("setting-vsize").value);
  const setLsize = parseInt(document.getElementById("setting-lsize").value);
  const setImgtype = document.getElementById("setting-imgtype").value;
  const setDelimiter = document.getElementById("setting-delimiter").value;
  const setMaxIterRaw = parseInt(document.getElementById("setting-max-iter").value, 10);
  const setMinBinRaw = parseInt(
    document.getElementById("setting-min-bin-size").value,
    10
  );
  const setDiffRaw = parseFloat(
    document.getElementById("setting-diff-threshold").value
  );
  const showLpLogValue = document.getElementById("setting-show-lp-log").value;
  const setMaxIter =
    Number.isFinite(setMaxIterRaw) && setMaxIterRaw > 0
      ? setMaxIterRaw
      : GRAPHBIN_DEFAULTS.max_iteration;
  const setMinBinSize =
    Number.isFinite(setMinBinRaw) && setMinBinRaw > 0
      ? setMinBinRaw
      : GRAPHBIN_DEFAULTS.min_bin_size;
  const setDiffThreshold =
    Number.isFinite(setDiffRaw) && setDiffRaw >= 0
      ? setDiffRaw
      : GRAPHBIN_DEFAULTS.diff_threshold;
  const setShowLpLog = showLpLogValue === "true";

  if (!graph || !contigs || !initial || (requiresPaths && !paths)) {
    if (requiresPaths) {
      log("Please pick all input files (graph, contigs, paths, initial).");
    } else {
      log("Please pick all input files (graph, contigs, initial).");
    }
    return;
  }

  const benchmark = startBenchmarkRun({
    source: "upload",
    dataset: graph.name || "uploaded-dataset",
    assembler,
    delimiter: setDelimiter,
    fileSizes: {
      graph: graph.size ?? null,
      contigs: contigs.size ?? null,
      paths: requiresPaths && paths ? paths.size ?? null : null,
      initial: initial.size ?? null,
    },
  });

  try {
    const pyodideStart = nowMs();
    const pyodide = await getPyodide();
    benchmark.phase_ms.pyodide_init = roundMs(nowMs() - pyodideStart);

    log("Writing input files into Pyodide FS... This step can take a while for large files. Please be patient!");

    const inputLoadStart = nowMs();
    const graphPath = await writeUploadedFile(pyodide, graph, "/data/assembly_graph.gfa");
    const contigsPath = await writeUploadedFile(pyodide, contigs, "/data/contigs.fasta");
    const pathsPath = requiresPaths
      ? await writeUploadedFile(pyodide, paths, "/data/contigs.paths")
      : null;
    const initialPath = await writeUploadedFile(pyodide, initial, "/data/initial_binning.tsv");
    benchmark.phase_ms.input_load = roundMs(nowMs() - inputLoadStart);
    let finalPath = "/out/graphbin_output.csv";

    let graphbinArgs = null;

    if (requiresPaths) {
      graphbinArgs = {
        graph: graphPath,
        contigs: contigsPath,
        paths: pathsPath,
        binned: initialPath,
        output: "/out/",
        prefix: "",
        delimiter: setDelimiter,
        max_iteration: setMaxIter,
        min_bin_size: setMinBinSize,
        diff_threshold: setDiffThreshold,
        show_lp_log: setShowLpLog,
      };

      log("Running GraphBin in Pyodide... This step can take a while for large files.");
      resetGraphbinStatus("Running GraphBin...");

      const graphbinStart = nowMs();
      try {
        await pyodide.runPythonAsync(`
import json
from types import SimpleNamespace
import graphbin_SPAdes

args_dict = json.loads(${JSON.stringify(JSON.stringify(graphbinArgs))})
args_ns = SimpleNamespace(**args_dict)

graphbin_SPAdes.run(args_ns)
  `);
        benchmark.phase_ms.graphbin = roundMs(nowMs() - graphbinStart);
      } catch (err) {
        benchmark.phase_ms.graphbin = roundMs(nowMs() - graphbinStart);
        let status = "GraphBin failed. ";
        try {
          const logText = readTextFromPyodide(pyodide, "/out/graphbin.log");
          status += logText ? "\n" + logText : String(err);
        } catch (e) {
          status += String(err);
        }
        setGraphbinStatus(status.trim());
        throw mapGraphbinError(status, err);
      }

      if (!graphbinStatusHasLog) {
        try {
          const logText = readTextFromPyodide(pyodide, "/out/graphbin.log");
          if (logText && logText.trim().length > 0) {
            setGraphbinStatus(logText);
          } else {
            setGraphbinStatus("GraphBin finished. Log file was empty.");
          }
        } catch (e) {
          setGraphbinStatus("GraphBin finished. Log file not available.");
        }
      }
    } else {
      graphbinArgs = {
        graph: graphPath,
        contigs: contigsPath,
        binned: initialPath,
        output: "/out/",
        prefix: "",
        delimiter: setDelimiter,
        max_iteration: setMaxIter,
        min_bin_size: setMinBinSize,
        diff_threshold: setDiffThreshold,
        show_lp_log: setShowLpLog,
      };

      log("Running GraphBin in Pyodide... This step can take a while for large files.");
      resetGraphbinStatus("Running GraphBin...");

      const graphbinStart = nowMs();
      try {
        await pyodide.runPythonAsync(`
import json
from types import SimpleNamespace
import graphbin_MEGAHIT

args_dict = json.loads(${JSON.stringify(JSON.stringify(graphbinArgs))})
args_ns = SimpleNamespace(**args_dict)

graphbin_MEGAHIT.run(args_ns)
  `);
        benchmark.phase_ms.graphbin = roundMs(nowMs() - graphbinStart);
      } catch (err) {
        benchmark.phase_ms.graphbin = roundMs(nowMs() - graphbinStart);
        let status = "GraphBin failed. ";
        try {
          const logText = readTextFromPyodide(pyodide, "/out/graphbin.log");
          status += logText ? "\n" + logText : String(err);
        } catch (e) {
          status += String(err);
        }
        setGraphbinStatus(status.trim());
        throw mapGraphbinError(status, err);
      }

      if (!graphbinStatusHasLog) {
        try {
          const logText = readTextFromPyodide(pyodide, "/out/graphbin.log");
          if (logText && logText.trim().length > 0) {
            setGraphbinStatus(logText);
          } else {
            setGraphbinStatus("GraphBin finished. Log file was empty.");
          }
        } catch (e) {
          setGraphbinStatus("GraphBin finished. Log file not available.");
        }
      }
    }

    // Any additional binning results the user supplied become further columns
    // in the comparison, so GraphBin is one result among several rather than
    // the privileged "answer".
    const extraResults = [];
    const extraInput = document.getElementById("extra-results");
    const extraFiles = extraInput && extraInput.files ? [...extraInput.files] : [];
    for (let i = 0; i < extraFiles.length; i++) {
      const file = extraFiles[i];
      const path = await writeUploadedFile(pyodide, file, `/data/extra_${i}.csv`);
      extraResults.push({
        name: file.name.replace(/\.(csv|tsv)$/i, ""),
        path,
        kind: "other",
        delimiter: setDelimiter,
      });
    }
    if (extraResults.length) {
      log(`Comparing ${extraResults.length} additional binning result(s).`);
    }

    const args = {
      initial: initialPath,
      final: finalPath,
      graph: graphPath,
      paths: pathsPath,
      contigs: contigsPath,
      results: extraResults,
      output: "/out/",
      prefix: "",
      dpi: setDpi,
      width: setWidth,
      height: setHeight,
      vsize: setVsize,
      lsize: setLsize,
      margin: 10,
      imgtype: setImgtype,
      delimiter: setDelimiter,
    };

    lastRunContext = { graphbinArgs, exportArgs: args, requiresPaths };

    log("Running GraphBin visualise in Pyodide... This step can take a while for large files. Please be patient!");

    const visualizeStart = nowMs();
    if (requiresPaths) {
      await pyodide.runPythonAsync(`
import json
from types import SimpleNamespace
import spades_plot
import interactive_export

args_dict = json.loads(${JSON.stringify(JSON.stringify(args))})
args_ns = SimpleNamespace(**args_dict)

spades_plot.run(args_ns)
interactive_export.export(args_ns, "/out/interactive_graph.json")
  `);
    } else {
      await pyodide.runPythonAsync(`
import json
from types import SimpleNamespace
import megahit_plot
import interactive_export_megahit

args_dict = json.loads(${JSON.stringify(JSON.stringify(args))})
args_ns = SimpleNamespace(**args_dict)

megahit_plot.run(args_ns)
interactive_export_megahit.export(args_ns, "/out/interactive_graph.json")
  `);
    }
    benchmark.phase_ms.visualize = roundMs(nowMs() - visualizeStart);
    benchmark.phase_ms.layout = readLayoutTimingFromPyodide(pyodide);

    log("Python finished, reading plots from /out...");

    const ext = (setImgtype || "png").toLowerCase();
    const images = pyodide.FS.readdir("/out").filter((f) => f.endsWith("." + ext));
    log("Output files: " + images.join(", "));

    const initialFile = images.find((f) => f.includes("initial_binning_result"));
    const finalFile = images.find((f) => f.includes("final_GraphBin_binning_result"));

    lastInitialImgPath = null;
    lastFinalImgPath = null;

    if (initialFile) {
      const fullPath = "/out/" + initialFile;
      setPlotMedia(pyodide, "initial", fullPath);
      if (initialBlock) initialBlock.style.display = "flex";
      lastInitialImgPath = fullPath;
    } else {
      log("Initial plot not found in /out.");
    }

    if (finalFile) {
      const fullPath = "/out/" + finalFile;
      setPlotMedia(pyodide, "final", fullPath);
      if (finalBlock) finalBlock.style.display = "flex";
      lastFinalImgPath = fullPath;
    } else {
      log("Final plot not found in /out.");
    }

    let interactiveError = null;
    try {
      const interactivePrepareStart = nowMs();
      graphModel = readJsonFromPyodide(pyodide, "/out/interactive_graph.json");
      prepareInteractiveModel(graphModel);
      rebuildSpatialIndex();
      buildBinColorMap();
      computeFeatureExtents();
      initInteractiveUI();
      initSankeyUI();
      renderLegend();
      updateFlowStats();
      renderProvPanel(null);
      benchmark.phase_ms.interactive_prepare = roundMs(
        nowMs() - interactivePrepareStart
      );

      const interactiveRenderStart = nowMs();
      await waitForRenderFrame(() => {
        fitToView(graphModel, true);
        render();
        renderSankey();
        renderScatter();
      });
      benchmark.phase_ms.interactive_render_ready = roundMs(
        nowMs() - interactiveRenderStart
      );

      benchmark.counts.nodes = graphModel.nodes.length;
      benchmark.counts.edges = graphModel.edges.length;

      log(`Interactive graph loaded (nodes=${graphModel.nodes.length}, edges=${graphModel.edges.length}).`);
    } catch (e) {
      console.error(e);
      interactiveError = String(e);
      benchmark.error = interactiveError;
      log("Interactive graph JSON not found or failed to load: " + e);
    }

    const benchmarkStatus = interactiveError ? "partial" : "success";
    const result = finishBenchmarkRun(benchmark, {
      status: benchmarkStatus,
      error: benchmark.error,
    });
    log("Done!");
  } catch (err) {
    benchmark.error = String(err);
    const result = finishBenchmarkRun(benchmark, {
      status: "failed",
      error: benchmark.error,
    });
    throw err;
  }
}

/* =========================
   Main: Run example inputs
   ========================= */
async function runExamplePlot() {
  outputEl.textContent = "";
  resetGraphbinStatus("(GraphBin logs will appear here)");
  const initialBlock = document.getElementById("initial-block");
  const finalBlock = document.getElementById("final-block");
  if (initialBlock) initialBlock.style.display = "none";
  if (finalBlock) finalBlock.style.display = "none";

  const setDpi = parseInt(document.getElementById("setting-dpi").value);
  const setWidth = parseInt(document.getElementById("setting-width").value);
  const setHeight = parseInt(document.getElementById("setting-height").value);
  const setVsize = parseInt(document.getElementById("setting-vsize").value);
  const setLsize = parseInt(document.getElementById("setting-lsize").value);
  const setImgtype = document.getElementById("setting-imgtype").value;
  const setDelimiter = document.getElementById("setting-delimiter").value;
  const setMaxIterRaw = parseInt(document.getElementById("setting-max-iter").value, 10);
  const setMinBinRaw = parseInt(
    document.getElementById("setting-min-bin-size").value,
    10
  );
  const setDiffRaw = parseFloat(
    document.getElementById("setting-diff-threshold").value
  );
  const showLpLogValue = document.getElementById("setting-show-lp-log").value;
  const setMaxIter =
    Number.isFinite(setMaxIterRaw) && setMaxIterRaw > 0
      ? setMaxIterRaw
      : GRAPHBIN_DEFAULTS.max_iteration;
  const setMinBinSize =
    Number.isFinite(setMinBinRaw) && setMinBinRaw > 0
      ? setMinBinRaw
      : GRAPHBIN_DEFAULTS.min_bin_size;
  const setDiffThreshold =
    Number.isFinite(setDiffRaw) && setDiffRaw >= 0
      ? setDiffRaw
      : GRAPHBIN_DEFAULTS.diff_threshold;
  const setShowLpLog = showLpLogValue === "true";

  const benchmark = startBenchmarkRun({
    source: "example",
    dataset: "example-data",
    assembler: "spades",
    delimiter: setDelimiter,
    fileSizes: {
      graph: null,
      contigs: null,
      paths: null,
      initial: null,
    },
  });

  try {
    const pyodideStart = nowMs();
    const pyodide = await getPyodide();
    benchmark.phase_ms.pyodide_init = roundMs(nowMs() - pyodideStart);

    log("Loading example data files into Pyodide FS...");

    const inputLoadStart = nowMs();
    const graphPath = await writeServerFile(
      pyodide,
      "data/assembly_graph_with_scaffolds.gfa",
      "/data/assembly_graph.gfa"
    );
    const contigsPath = await writeServerFile(
      pyodide,
      "data/contigs.fasta",
      "/data/contigs.fasta"
    );
    const pathsPath = await writeServerFile(pyodide, "data/contigs.paths", "/data/contigs.paths");
    const initialPath = await writeServerFile(
      pyodide,
      "data/initial_binning_res.csv",
      "/data/initial_binning.csv"
    );
    benchmark.phase_ms.input_load = roundMs(nowMs() - inputLoadStart);

    benchmark.file_sizes_bytes.graph = getPyodideFileSize(pyodide, graphPath);
    benchmark.file_sizes_bytes.contigs = getPyodideFileSize(pyodide, contigsPath);
    benchmark.file_sizes_bytes.paths = getPyodideFileSize(pyodide, pathsPath);
    benchmark.file_sizes_bytes.initial = getPyodideFileSize(pyodide, initialPath);

    const finalPath = "/out/graphbin_output.csv";

    const graphbinArgs = {
      graph: graphPath,
      contigs: contigsPath,
      paths: pathsPath,
      binned: initialPath,
      output: "/out/",
      prefix: "",
      delimiter: setDelimiter,
      max_iteration: setMaxIter,
      min_bin_size: setMinBinSize,
      diff_threshold: setDiffThreshold,
      show_lp_log: setShowLpLog,
    };

    log("Running GraphBin on example data in Pyodide...");
    resetGraphbinStatus("Running GraphBin...");

    const graphbinStart = nowMs();
    try {
      await pyodide.runPythonAsync(`
import json
from types import SimpleNamespace
import graphbin_SPAdes

args_dict = json.loads(${JSON.stringify(JSON.stringify(graphbinArgs))})
args_ns = SimpleNamespace(**args_dict)

graphbin_SPAdes.run(args_ns)
  `);
      benchmark.phase_ms.graphbin = roundMs(nowMs() - graphbinStart);
    } catch (err) {
      benchmark.phase_ms.graphbin = roundMs(nowMs() - graphbinStart);
      let status = "GraphBin failed. ";
      try {
        const logText = readTextFromPyodide(pyodide, "/out/graphbin.log");
        status += logText ? "\n" + logText : String(err);
      } catch (e) {
        status += String(err);
      }
      setGraphbinStatus(status.trim());
      throw mapGraphbinError(status, err);
    }

    if (!graphbinStatusHasLog) {
      try {
        const logText = readTextFromPyodide(pyodide, "/out/graphbin.log");
        if (logText && logText.trim().length > 0) {
          setGraphbinStatus(logText);
        } else {
          setGraphbinStatus("GraphBin finished. Log file was empty.");
        }
      } catch (e) {
        setGraphbinStatus("GraphBin finished. Log file not available.");
      }
    }

    const args = {
      initial: initialPath,
      final: finalPath,
      graph: graphPath,
      paths: pathsPath,
      contigs: contigsPath, // exporter needs this
      output: "/out/",
      prefix: "",
      dpi: setDpi,
      width: setWidth,
      height: setHeight,
      vsize: setVsize,
      lsize: setLsize,
      margin: 10,
      imgtype: setImgtype,
      delimiter: setDelimiter,
    };

    lastRunContext = { graphbinArgs, exportArgs: args, requiresPaths: true };

    log("Running GraphBin visualise on example data in Pyodide...");

    const visualizeStart = nowMs();
    await pyodide.runPythonAsync(`
import json
from types import SimpleNamespace
import spades_plot
import interactive_export

args_dict = json.loads(${JSON.stringify(JSON.stringify(args))})
args_ns = SimpleNamespace(**args_dict)

spades_plot.run(args_ns)
interactive_export.export(args_ns, "/out/interactive_graph.json")
  `);
    benchmark.phase_ms.visualize = roundMs(nowMs() - visualizeStart);
    benchmark.phase_ms.layout = readLayoutTimingFromPyodide(pyodide);

    log("Python finished, reading example plots from /out...");

    const ext = (setImgtype || "png").toLowerCase();
    const images = pyodide.FS.readdir("/out").filter((f) => f.endsWith("." + ext));
    log("Output files: " + images.join(", "));

    const initialFile = images.find((f) => f.includes("initial_binning_result"));
    const finalFile = images.find((f) => f.includes("final_GraphBin_binning_result"));

    lastInitialImgPath = null;
    lastFinalImgPath = null;

    if (initialFile) {
      const fullPath = "/out/" + initialFile;
      setPlotMedia(pyodide, "initial", fullPath);
      if (initialBlock) initialBlock.style.display = "flex";
      lastInitialImgPath = fullPath;
    } else {
      log("Initial plot not found in /out.");
    }

    if (finalFile) {
      const fullPath = "/out/" + finalFile;
      setPlotMedia(pyodide, "final", fullPath);
      if (finalBlock) finalBlock.style.display = "flex";
      lastFinalImgPath = fullPath;
    } else {
      log("Final plot not found in /out.");
    }

    let interactiveError = null;
    try {
      const interactivePrepareStart = nowMs();
      graphModel = readJsonFromPyodide(pyodide, "/out/interactive_graph.json");
      prepareInteractiveModel(graphModel);
      rebuildSpatialIndex();
      buildBinColorMap();
      computeFeatureExtents();
      initInteractiveUI();
      initSankeyUI();
      renderLegend();
      updateFlowStats();
      renderProvPanel(null);
      benchmark.phase_ms.interactive_prepare = roundMs(nowMs() - interactivePrepareStart);

      const interactiveRenderStart = nowMs();
      await waitForRenderFrame(() => {
        fitToView(graphModel, true);
        render();
        renderSankey();
        renderScatter();
      });
      benchmark.phase_ms.interactive_render_ready = roundMs(
        nowMs() - interactiveRenderStart
      );

      benchmark.counts.nodes = graphModel.nodes.length;
      benchmark.counts.edges = graphModel.edges.length;

      log(`Interactive graph loaded (nodes=${graphModel.nodes.length}, edges=${graphModel.edges.length}).`);
    } catch (e) {
      console.error(e);
      interactiveError = String(e);
      benchmark.error = interactiveError;
      log("Interactive graph JSON not found or failed to load: " + e);
    }

    const benchmarkStatus = interactiveError ? "partial" : "success";
    const result = finishBenchmarkRun(benchmark, {
      status: benchmarkStatus,
      error: benchmark.error,
    });
    log("Done (example data)!");
  } catch (err) {
    benchmark.error = String(err);
    const result = finishBenchmarkRun(benchmark, {
      status: "failed",
      error: benchmark.error,
    });
    throw err;
  }
}

/* =========================
   Buttons
   ========================= */
document.getElementById("run-btn").addEventListener("click", () => {
  resetGraphbinStatus("(GraphBin logs will appear here)");
  resetInteractiveViews();
  runInputPlot().catch((err) => {
    console.error(err);
    log("Error: " + err);
  });
});

document.getElementById("example-btn").addEventListener("click", () => {
  resetGraphbinStatus("(GraphBin logs will appear here)");
  resetInteractiveViews();
  runExamplePlot().catch((err) => {
    console.error(err);
    log("Error (example): " + err);
  });
});

document.getElementById("download-initial").addEventListener("click", () => {
  downloadImage("initial").catch((err) => {
    console.error(err);
    log("Download error: " + err);
  });
});

document.getElementById("download-final").addEventListener("click", () => {
  downloadImage("final").catch((err) => {
    console.error(err);
    log("Download error: " + err);
  });
});

document.getElementById("download-graphbin").addEventListener("click", () => {
  downloadGraphbinOutputZip().catch((err) => {
    console.error(err);
    log("Download error: " + err);
  });
});

initCollapseToggles();

/* =========================
   Download plot images
   ========================= */
async function downloadImage(which) {
  const pyodide = await getPyodide();

  let path = null;
  if (which === "initial") path = lastInitialImgPath;
  if (which === "final") path = lastFinalImgPath;

  if (!path) {
    alert("No image available. Run the plot first.");
    return;
  }

  const ext = getFileExtension(path) || "png";
  const data = pyodide.FS.readFile(path);
  const blob = new Blob([data], { type: mimeForExtension(ext) });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = which + "_plot." + ext;
  a.style.display = "none";
  document.body.appendChild(a);

  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 2000);
}

async function downloadGraphbinOutputZip() {
  const pyodide = await getPyodide();
  const zipPath = "/out/graphbin_output.zip";
  lastGraphbinZipPath = zipPath;

  try {
    const files = pyodide.FS.readdir("/out").filter((f) => ![".", ".."].includes(f));
    if (files.length === 0) {
      alert("GraphBin output not available. Run GraphBin first.");
      return;
    }
  } catch (e) {
    alert("GraphBin output not available. Run GraphBin first.");
    return;
  }

  await pyodide.runPythonAsync(`
import os, zipfile
out_dir = "/out"
zip_path = "${zipPath}"
if os.path.exists(zip_path):
    os.remove(zip_path)
with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(out_dir):
        for name in files:
            full = os.path.join(root, name)
            if full == zip_path:
                continue
            arc = os.path.relpath(full, out_dir)
            z.write(full, arcname=arc)
  `);

  const data = pyodide.FS.readFile(zipPath);
  const blob = new Blob([data], { type: "application/zip" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "graphbin_output.zip";
  a.style.display = "none";
  document.body.appendChild(a);

  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 2000);
}

/* =========================
   Interactive: model prep
   ========================= */
function prepareInteractiveModel(model) {
  // nodesById
  model.nodesById = new Map();
  for (const n of model.nodes) model.nodesById.set(n.id, n);

  // Normalise the comparison model. Exports written before the multi-result
  // schema carry only initial_bin / final_bin, so synthesise the equivalent
  // two-result description for them.
  if (!Array.isArray(model.results) || model.results.length === 0) {
    model.results = [
      { key: "r0", name: "Initial", kind: "initial" },
      { key: "r1", name: "GraphBin", kind: "graphbin" },
    ];
  }

  const keys = model.results.map((r) => r.key);

  for (const n of model.nodes) {
    if (!n.bins) {
      n.bins = { r0: n.initial_bin ?? null, r1: n.final_bin ?? null };
    }
    if (n.disagreement == null) {
      const labels = keys.map((k) => n.bins[k] ?? "(unbinned)");
      const distinct = new Set(labels);
      n.n_distinct = distinct.size;
      n.disagreement = distinct.size > 1 ? 1 : 0;
    }
  }

  model.provenance_meta = model.provenance_meta || {};
  model.maxIteration = Number(model.provenance_meta.max_iteration || 0);

  // adjacency list
  model.adj = new Map();
  for (const n of model.nodes) model.adj.set(n.id, []);
  for (const [u, v] of model.edges) {
    if (model.adj.has(u)) model.adj.get(u).push(v);
    if (model.adj.has(v)) model.adj.get(v).push(u);
  }

  model.khopSet = null;
}

/* =========================
   Bin colours (palette)
   ========================= */
function buildBinColorMap() {
  binColorMap.clear();
  if (!graphModel) return;

  // Prefer the exact palette exported from Python (matches PNG plots)
  if (graphModel.bin_colors) {
    for (const [bin, color] of Object.entries(graphModel.bin_colors)) {
      binColorMap.set(bin, color); // color is hex string from matplotlib
    }
    return;
  }

  // Fallback (shouldn't happen once exporter is updated)
  const bins = new Set();
  const keys = getResults().map((r) => r.key);
  for (const n of graphModel.nodes) {
    for (const k of keys) {
      const b = rawBin(n, k);
      if (b) bins.add(b);
    }
  }
  const sorted = [...bins].sort();
  const total = sorted.length;
  for (let i = 0; i < total; i++) {
    const hue = (i * 360) / Math.max(1, total);
    binColorMap.set(sorted[i], `hsl(${hue}, 65%, 55%)`);
  }
}

function colorForBin(bin) {
  if (!bin) return (graphModel?.unbinned_color || "#d3d3d3"); // match PNG plots
  return binColorMap.get(bin) || "#6b7280";
}

function makeLegendRow(label, color, variant = "solid") {
  const row = document.createElement("div");
  row.className = "bin-legend-item";

  const sw = document.createElement("div");
  sw.className = "bin-legend-swatch";
  if (variant === "misbinned") {
    sw.classList.add("legend-misbinned");
    sw.style.borderColor = color;
  } else if (variant === "changed") {
    sw.classList.add("legend-changed");
    sw.style.borderColor = color;
  } else if (variant === "ambiguous") {
    sw.classList.add("legend-ambiguous");
    sw.style.borderColor = color;
  } else {
    sw.style.background = color;
  }

  const txt = document.createElement("div");
  txt.className = "bin-legend-label";
  txt.textContent = label;
  row.title = label;

  row.appendChild(sw);
  row.appendChild(txt);
  return row;
}


/* =========================
   Interactive: UI + D3
   ========================= */
function initInteractiveUI() {
  const c = document.getElementById("graph-canvas");
  if (!c || !window.d3) return; // interactive panel not present

  if (!canvas) {
    canvas = c;
    ctx = canvas.getContext("2d");

    zoomBehavior = d3
      .zoom()
      .scaleExtent([0.05, 200])
      .on("zoom", (event) => {
        currentTransform = event.transform;
        render();
      });

    d3.select(canvas).call(zoomBehavior);

    canvas.addEventListener("mousemove", (e) => {
      const x = e.offsetX;
      const y = e.offsetY;

      hoverNodeId = pickNode(x, y);
      const tooltip = document.getElementById("hover-tooltip");
      if (tooltip) {
        if (hoverNodeId) {
          const n = getNode(hoverNodeId);
          showTooltip(tooltip, canvas, e, n);
        } else {
          hideTooltip(tooltip);
        }
      }
      render();
    });

    canvas.addEventListener("mouseleave", () => {
      hoverNodeId = null;
      hideTooltip(document.getElementById("hover-tooltip"));
      render();
    });

    canvas.addEventListener("click", (e) => {
      const nodeId = pickNode(e.offsetX, e.offsetY);
      lockedNodeId = lockedNodeId === nodeId ? null : nodeId;
      renderProvPanel(lockedNodeId);
      if (nodeId && e.shiftKey) {
        const next = new Set(selection);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        setSelection([...next], "picked contigs");
        return;
      }
      render();
    });

    if (!canvas.dataset._resizeBound) {
      window.addEventListener("resize", () => {
        if (!graphModel) return;
        render();
      });
      canvas.dataset._resizeBound = "1";
    }
  }

  // Controls (attach once)
  attachControl("view-mode", "change", (e) => {
    filters.mode = e.target.value;
    const title = document.getElementById("graph-view-title");
    if (title) title.textContent = `Assembly graph — ${resultName(filters.mode)}`;
    syncReplayAvailability();
    invalidateDerived();
    render();
    renderScatter();
  });

  attachControl("color-mode", "change", (e) => {
    filters.colorMode = e.target.value;
    renderLegend();
    render();
    renderScatter();
  });

  attachControl("size-mode", "change", (e) => {
    filters.sizeMode = e.target.value;
    render();
  });

  attachControl("toggle-only-disputed", "change", (e) => {
    filters.onlyDisputed = e.target.checked;
    invalidateDerived();
    render();
    renderScatter();
  });

  attachControl("toggle-low-confidence", "change", (e) => {
    filters.onlyLowConfidence = e.target.checked;
    invalidateDerived();
    render();
    renderScatter();
  });

  for (const [id, flag] of [
    ["toggle-mark-changed", "markChanged"],
    ["toggle-mark-misbinned", "markMisbinned"],
    ["toggle-mark-ambiguous", "markAmbiguous"],
  ]) {
    attachControl(id, "change", (e) => {
      filters[flag] = e.target.checked;
      renderLegend();
      render();
    });
  }

  attachControl("scatter-x", "change", () => renderScatter());
  attachControl("scatter-y", "change", () => renderScatter());
  attachControl("clear-selection", "click", () => clearSelection());
  attachControl("apply-override", "click", () => applyOverride());
  attachControl("clear-overrides", "click", () => clearOverrides());
  attachControl("rerun-refinement", "click", () => rerunRefinement());
  attachControl("export-curated", "click", () => exportCuratedBinning());

  // the canvas, scatter and legend all read theme colours at draw time
  const themeBtn = document.getElementById("theme-toggle");
  if (themeBtn && themeBtn.dataset._vizBound !== "1") {
    themeBtn.addEventListener("click", () => {
      window.requestAnimationFrame(() => {
        renderLegend();
        render();
        renderScatter();
        renderSankey();
      });
    });
    themeBtn.dataset._vizBound = "1";
  }

  attachControl("bin-filter", "change", (e) => {
    filters.binOnly = e.target.value;
    invalidateDerived();
    render();
    renderScatter();
  });

  attachControl("toggle-hide-unbinned", "change", (e) => {
    filters.hideUnbinned = e.target.checked;
    invalidateDerived();
    render();
    renderScatter();
  });

  attachControl("toggle-only-changed", "change", (e) => {
    filters.onlyChanged = e.target.checked;
    invalidateDerived();
    render();
    renderScatter();
  });

  attachControl("node-size", "input", (e) => {
    setBaseNodeRadius(e.target.value);
    render();
  });

  attachControl("toggle-hide-isolated", "change", (e) => {
    filters.hideIsolated = e.target.checked;
    invalidateDerived();
    render();
    renderScatter();
  });

  attachControl("toggle-collapse-tips", "change", (e) => {
    filters.collapseTips = e.target.checked;
    invalidateDerived();
    render();
  });

  attachControl("apply-khop", "click", () => {
    const kEl = document.getElementById("k-hops");
    const k = parseInt((kEl && kEl.value) || "0", 10);
    filters.khopK = Math.max(0, k);
    filters.khopFrom = lockedNodeId || hoverNodeId || null;
    invalidateDerived();
    render();
  });

  attachControl("clear-khop", "click", () => {
    filters.khopFrom = null;
    filters.khopK = 0;
    invalidateDerived();
    render();
  });

  attachControl("reset-view", "click", () => {
    if (!graphModel) return;
    fitToView(graphModel, true);
    render();
  });

  if (!window.__wsResizeBound) {
    window.__wsResizeBound = true;
    window.addEventListener("resize", () => {
      if (!graphModel) return;
      renderScatter();
    });

    // The workspace is laid out only once it is on screen, so anything drawn
    // while its tab was hidden was measured against a zero-sized canvas.
    // Re-fit and redraw every view when it becomes visible.
    window.addEventListener("graphbin-viz:workspace-shown", () => {
      if (!graphModel) return;
      window.requestAnimationFrame(() => {
        resizeCanvasToDisplaySize();
        fitToView(graphModel, false);
        render();
        renderScatter();
        renderSankey();
      });
    });
  }

  initWorkspaceChrome();
  initRangeFills();
  populateResultSelect();
  populateBinFilter();
  populateOverrideBins();
  initReplayUI();
  renderOverrideSummary();
  renderProvPanel(null);
}

/* =========================
   Sankey: UI + rendering
   ========================= */
function initSankeyUI() {
  const svg = document.getElementById("sankey-svg");
  if (!svg) return;

  // controls
  attachControl("sankey-only-changed", "change", () => {
    sankeyLocked = null;
    renderSankey();
  });

  attachControl("sankey-hide-unbinned", "change", () => {
    sankeyLocked = null;
    renderSankey();
  });

  // resize
  if (!svg.dataset._resizeBound) {
    window.addEventListener("resize", () => {
      renderSankey();
    });
    svg.dataset._resizeBound = "1";
  }
}

function getSankeyOptions() {
  const onlyChanged = !!document.getElementById("sankey-only-changed")?.checked;
  const hideUnbinned = !!document.getElementById("sankey-hide-unbinned")?.checked;
  return { onlyChanged, hideUnbinned };
}

function buildSankeyData(model, opts) {
  const UN = "(unbinned)";
  const results = getResults();
  const keys = results.map((r) => r.key);

  const nodes = [];
  const index = new Map();
  const ensure = (key, bin) => {
    const name = key + "|" + bin;
    if (!index.has(name)) {
      index.set(name, nodes.length);
      nodes.push({ name, key, bin, resultName: resultName(key) });
    }
    return index.get(name);
  };

  const label = (n, key) => {
    const b = nodeBin(n, key);
    return b == null || b === "" ? UN : String(b);
  };

  const rows = [];
  const binsPerKey = new Map(keys.map((k) => [k, new Set()]));

  for (const n of model.nodes) {
    const labels = keys.map((k) => label(n, k));
    if (opts.onlyChanged && labels.every((l) => l === labels[0])) continue;
    if (opts.hideUnbinned && labels.some((l) => l === UN)) continue;
    rows.push({ id: n.id, labels });
    labels.forEach((l, i) => binsPerKey.get(keys[i]).add(l));
  }

  // create column nodes in a stable order so the diagram does not reshuffle
  for (const k of keys) {
    const sorted = [...binsPerKey.get(k)].sort((a, b) => {
      if (a === UN) return 1;
      if (b === UN) return -1;
      return a.localeCompare(b);
    });
    for (const b of sorted) ensure(k, b);
  }

  const linkMap = new Map();
  for (const row of rows) {
    for (let i = 0; i < keys.length - 1; i++) {
      const sourceIdx = ensure(keys[i], row.labels[i]);
      const targetIdx = ensure(keys[i + 1], row.labels[i + 1]);
      const linkKey = sourceIdx + "->" + targetIdx;
      let link = linkMap.get(linkKey);
      if (!link) {
        link = {
          source: sourceIdx,
          target: targetIdx,
          value: 0,
          ids: [],
          srcBin: row.labels[i],
          dstBin: row.labels[i + 1],
          srcResult: resultName(keys[i]),
          dstResult: resultName(keys[i + 1]),
        };
        linkMap.set(linkKey, link);
      }
      link.value += 1;
      link.ids.push(row.id);
    }
  }

  return { nodes, links: [...linkMap.values()] };
}

function renderSankeyTitles() {
  const row = document.getElementById("sankey-title-row");
  if (!row) return;
  row.innerHTML = "";
  for (const r of getResults()) {
    const el = document.createElement("div");
    el.className = "sankey-title";
    el.textContent = r.name;
    row.appendChild(el);
  }
}

function renderSankey() {
  const svgEl = document.getElementById("sankey-svg");
  if (!svgEl || !window.d3 || !window.d3.sankey || !graphModel) return;

  const opts = getSankeyOptions();
  const tooltip = document.getElementById("sankey-tooltip");

  // Clear any stale tooltip
  if (tooltip) tooltip.style.display = "none";

  const wrap = svgEl.parentElement;
  const width = Math.max(320, wrap?.clientWidth || 900);
  const height = svgEl.clientHeight || 520;

  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  renderSankeyTitles();

  const data = buildSankeyData(graphModel, opts);
  if (data.links.length === 0 || data.nodes.length === 0) {
    svg.append("text")
      .attr("x", 16)
      .attr("y", 24)
      .attr("font-size", 14)
      .attr("fill", "#6b7280")
      .text("No contigs match the current Sankey filters.");
    return;
  }

  const sankey = d3.sankey()
    .nodeWidth(16)
    .nodePadding(12)
    .extent([[16, 14], [width - 16, height - 26]]);

  // d3-sankey mutates in-place; use shallow clones
  const graph = sankey({
    nodes: data.nodes.map((d) => ({ ...d })),
    links: data.links.map((d) => ({ ...d })),
  });

  // links
  const linkG = svg.append("g").attr("fill", "none");

  const linkSel = linkG
    .selectAll("path")
    .data(graph.links)
    .join("path")
    .attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke-width", (d) => Math.max(1, d.width))
    .attr("stroke", (d) => colorForBin(d.srcBin === "(unbinned)" ? null : d.srcBin))
    .attr("stroke-opacity", (d) => {
      if (!sankeyLocked) return 0.35;
      return d.source.name === sankeyLocked.source && d.target.name === sankeyLocked.target
        ? 0.85
        : 0.08;
    })
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      event.preventDefault();
      const hit = { source: d.source.name, target: d.target.name };
      if (
        sankeyLocked &&
        sankeyLocked.source === hit.source &&
        sankeyLocked.target === hit.target
      ) {
        sankeyLocked = null;
        setSelection([], "");
      } else {
        sankeyLocked = hit;
        // the flow is a set of contigs: hand them to every other view
        setSelection(d.ids || [], `${d.srcBin} → ${d.dstBin}`);
      }
    });

  // tooltip
  linkSel
    .on("mousemove", (event, d) => {
      if (!tooltip) return;
      const rect = wrap.getBoundingClientRect();
      tooltip.style.display = "block";
      tooltip.style.left = (event.clientX - rect.left + 12) + "px";
      tooltip.style.top = (event.clientY - rect.top + 12) + "px";
      tooltip.innerHTML = `
        <div><b>${escapeHtml(d.srcBin)}</b> → <b>${escapeHtml(d.dstBin)}</b></div>
        <div class="tooltip-sub">${escapeHtml(d.srcResult)} → ${escapeHtml(d.dstResult)}</div>
        <div>contigs: ${d.value}</div>
        <div class="tooltip-sub">click to select these contigs</div>
      `;
    })
    .on("mouseleave", () => {
      if (tooltip) tooltip.style.display = "none";
    });

  // nodes
  const node = svg
    .append("g")
    .selectAll("g")
    .data(graph.nodes)
    .join("g");

  node
    .append("rect")
    .attr("x", (d) => d.x0)
    .attr("y", (d) => d.y0)
    .attr("height", (d) => Math.max(1, d.y1 - d.y0))
    .attr("width", (d) => d.x1 - d.x0)
    .attr("rx", 3)
    .attr("ry", 3)
    .attr("fill", (d) => colorForBin(d.bin === "(unbinned)" ? null : d.bin))
    .attr("stroke", "rgba(0,0,0,0.25)");

  node
    .append("text")
    .attr("x", (d) => (d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6))
    .attr("y", (d) => (d.y0 + d.y1) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", (d) => (d.x0 < width / 2 ? "start" : "end"))
    .attr("font-size", 11)
    .attr("fill", "currentColor")
    .attr("opacity", 0.85)
    .text((d) => d.bin);
}

function setFlowStat(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function isUnbinned(bin) {
  return bin == null || bin === "" || bin === "unbinned";
}

function updateFlowStats() {
  if (!graphModel) return;
  let reassigned = 0;
  let unbinnedToBinned = 0;
  let binnedToUnbinned = 0;
  let changed = 0;

  const results = getResults();
  const firstKey = results[0].key;
  const refinedKey = graphbinResultKey();

  for (const n of graphModel.nodes) {
    const initBin = nodeBin(n, firstKey);
    const finalBin = nodeBin(n, refinedKey);
    const initUnbinned = isUnbinned(initBin);
    const finalUnbinned = isUnbinned(finalBin);

    if (initBin !== finalBin) {
      changed += 1;
    }
    if (!initUnbinned && !finalUnbinned && initBin !== finalBin) {
      reassigned += 1;
    }
    if (initUnbinned && !finalUnbinned) {
      unbinnedToBinned += 1;
    }
    if (!initUnbinned && finalUnbinned) {
      binnedToUnbinned += 1;
    }
  }

  setFlowStat("flow-stat-changed", String(changed));
  setFlowStat("flow-stat-reassigned", String(reassigned));
  setFlowStat("flow-stat-unbinned-to-binned", String(unbinnedToBinned));
  setFlowStat("flow-stat-binned-to-unbinned", String(binnedToUnbinned));
}

function attachControl(id, event, handler) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.dataset._bound === "1") return;
  el.addEventListener(event, handler);
  el.dataset._bound = "1";
}

function initCollapseToggles() {
  if (window.__collapseTogglesInitialized) return;
  window.__collapseTogglesInitialized = true;
  const storageKey = "graphbin-collapse-state";
  const loadState = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  };
  const saveState = (state) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (e) {}
  };

  const applyInitialState = () => {
    const state = loadState();
    const buttons = document.querySelectorAll(".collapse-toggle");
    buttons.forEach((btn) => {
      const section = btn.closest(".tab-section");
      if (!section) return;
      const target = btn.dataset.target || "";
      const collapsed = target === "section-output" ? false : !!state[target];
      section.classList.toggle("collapsed", collapsed);
      btn.textContent = collapsed ? "Expand" : "Collapse";
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
  };

  applyInitialState();

  document.addEventListener("click", (event) => {
    const btn = event.target?.closest?.(".collapse-toggle");
    if (!btn) return;
    const section = btn.closest(".tab-section");
    if (!section) return;
    const collapsed = section.classList.toggle("collapsed");
    btn.textContent = collapsed ? "Expand" : "Collapse";
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");

    const target = btn.dataset.target || "";
    const state = loadState();
    state[target] = collapsed;
    saveState(state);
  });
}

function resizeCanvasToDisplaySize() {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function populateBinFilter() {
  const sel = document.getElementById("bin-filter");
  if (!sel || !graphModel) return;

  // remove all but first option
  while (sel.options.length > 1) sel.remove(1);

  const bins = new Set();
  const keys = getResults().map((r) => r.key);
  for (const n of graphModel.nodes) {
    for (const k of keys) {
      const b = rawBin(n, k);
      if (b) bins.add(b);
    }
  }
  [...bins].sort().forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    sel.appendChild(opt);
  });
}

function setBaseNodeRadius(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  baseNodeRadius = v;
  const label = document.getElementById("node-size-value");
  if (label) {
    const text = v % 1 === 0 ? String(v) : v.toFixed(1);
    label.textContent = text;
  }
}

/* =========================
   Interactive: math / view
   ========================= */
function getCanvasSize() {
  if (!canvas) return { width: 900, height: 700 };
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width || 900);
  const height = Math.max(1, rect.height || 700);
  return { width, height };
}

function fitToView(model, animate = false) {
  if (!canvas || !model || !zoomBehavior || !window.d3) return;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const n of model.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }

  const w = maxX - minX || 1;
  const h = maxY - minY || 1;

  const padding = 28;
  const { width, height } = getCanvasSize();

  const sx = (width - padding * 2) / w;
  const sy = (height - padding * 2) / h;
  const s = Math.min(sx, sy);

  // One axis is always the limiting one; the leftover space on the other axis
  // has to be split between both sides, otherwise the whole graph is pinned to
  // the top-left corner with all the slack pushed to the right or the bottom.
  const tx = (width - w * s) / 2 - minX * s;
  const ty = (height - h * s) / 2 - minY * s;

  const t = d3.zoomIdentity.translate(tx, ty).scale(s);
  if (animate) {
    d3.select(canvas)
      .transition()
      .duration(450)
      .call(zoomBehavior.transform, t);
  } else {
    d3.select(canvas).call(zoomBehavior.transform, t);
  }
  currentTransform = t;
}

function worldToScreen(x, y) {
  const t = currentTransform || { x: 0, y: 0, k: 1 };
  return { x: x * t.k + t.x, y: y * t.k + t.y };
}

function screenToWorld(x, y) {
  const t = currentTransform || { x: 0, y: 0, k: 1 };
  return { x: (x - t.x) / t.k, y: (y - t.y) / t.k };
}

function rebuildSpatialIndex() {
  if (!graphModel) return;
  spatial.map.clear();
  const cell = spatial.cell;

  for (const n of graphModel.nodes) {
    const cx = Math.floor(n.x / cell);
    const cy = Math.floor(n.y / cell);
    const key = cx + "," + cy;
    if (!spatial.map.has(key)) spatial.map.set(key, []);
    spatial.map.get(key).push(n.id);
  }
}

function pickNode(screenX, screenY) {
  if (!graphModel) return null;
  const w = screenToWorld(screenX, screenY);

  const rScreen = 8; // px
  const t = currentTransform || { k: 1 };
  const rWorld = rScreen / t.k;

  const cell = spatial.cell;
  const cx = Math.floor(w.x / cell);
  const cy = Math.floor(w.y / cell);

  let best = null;
  let bestD2 = Infinity;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = cx + dx + "," + (cy + dy);
      const list = spatial.map.get(key);
      if (!list) continue;

      for (const id of list) {
        const n = getNode(id);
        if (!isNodeVisible(n)) continue;

        const ddx = n.x - w.x;
        const ddy = n.y - w.y;
        const d2 = ddx * ddx + ddy * ddy;

        if (d2 < bestD2 && d2 <= rWorld * rWorld) {
          bestD2 = d2;
          best = id;
        }
      }
    }
  }
  return best;
}

/* =========================
   Interactive: filters
   ========================= */
function invalidateDerived() {
  if (graphModel) graphModel.khopSet = null;
}

/* =========================
   Comparison model accessors
   ========================= */
function getResults() {
  if (graphModel && Array.isArray(graphModel.results) && graphModel.results.length) {
    return graphModel.results;
  }
  return [
    { key: "r0", name: "Initial", kind: "initial" },
    { key: "r1", name: "GraphBin", kind: "graphbin" },
  ];
}

function resultName(key) {
  const r = getResults().find((x) => x.key === key);
  return r ? r.name : key;
}

/** Key of the GraphBin-refined result, which is the one curation acts on. */
function graphbinResultKey() {
  const results = getResults();
  const gb = results.find((r) => r.kind === "graphbin");
  if (gb) return gb.key;
  return results.length > 1 ? results[1].key : results[0].key;
}

/** The bin a result assigns, ignoring replay and analyst overrides. */
function rawBin(n, key) {
  if (n.bins && Object.prototype.hasOwnProperty.call(n.bins, key)) {
    return n.bins[key] ?? null;
  }
  if (key === "r0") return n.initial_bin ?? null;
  if (key === "r1") return n.final_bin ?? null;
  return null;
}

/**
 * The bin to display for a node under the current view. Overrides and the
 * propagation replay both act on the refined result only: the initial binning
 * is an input and is never rewritten.
 */
function nodeBin(n, key) {
  const k = key || filters.mode;
  if (k === graphbinResultKey()) {
    if (replay.active) return replayBinFor(n);
    if (overrides.has(n.id)) return overrides.get(n.id);
  }
  return rawBin(n, k);
}

/** Label held at replay iteration `replay.iter`; null if not yet reached. */
function replayBinFor(n) {
  const key = graphbinResultKey();
  const p = n.prov;
  if (!p) return rawBin(n, key);

  const group = STAGE_GROUPS[p.stage] || "unresolved";
  if (group === "seed") return p.final_bin ?? rawBin(n, key);

  const history = p.history || [];
  let label = null;
  for (const entry of history) {
    if (entry[0] <= replay.iter) label = entry[1];
    else break;
  }
  return label;
}

function nodeUncertainty(n) {
  const p = n.prov;
  if (!p) return null;
  if (typeof p.confidence !== "number") return null;
  return Math.max(0, Math.min(1, 1 - p.confidence));
}

function nodeStageGroup(n) {
  const stage = n.prov && n.prov.stage;
  return STAGE_GROUPS[stage] || "unresolved";
}

function nodeDisagreement(n) {
  return typeof n.disagreement === "number" ? n.disagreement : 0;
}

function isNodeVisible(n) {
  const b = nodeBin(n, filters.mode);

  if (filters.hideUnbinned && (b == null || b === "")) return false;
  if (filters.onlyChanged && !n.changed) return false;
  if (filters.onlyDisputed && nodeDisagreement(n) <= 0) return false;
  if (filters.onlyLowConfidence) {
    const u = nodeUncertainty(n);
    if (u == null || u < 0.5) return false;
  }
  if (filters.binOnly && b !== filters.binOnly) return false;

  if (filters.hideIsolated) {
    const deg = (graphModel.adj.get(n.id) || []).length;
    if (deg === 0) return false;
  }


  if (filters.khopFrom && filters.khopK >= 0) {
    if (!graphModel.khopSet) graphModel.khopSet = computeKHop(filters.khopFrom, filters.khopK);
    if (!graphModel.khopSet.has(n.id)) return false;
  }

  if (filters.collapseTips) {
    const deg = (graphModel.adj.get(n.id) || []).length;
    if (deg <= 1 && n.id !== lockedNodeId && n.id !== hoverNodeId) return false;
  }

  return true;
}

function computeKHop(startId, k) {
  if (!graphModel.adj || !graphModel.adj.has(startId)) return new Set();
  const seen = new Set([startId]);
  let frontier = [startId];

  for (let d = 0; d < k; d++) {
    const next = [];
    for (const u of frontier) {
      for (const v of graphModel.adj.get(u) || []) {
        if (!seen.has(v)) {
          seen.add(v);
          next.push(v);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return seen;
}

function adjacentBinMix(nodeId, mode) {
  const adj = graphModel.adj.get(nodeId) || [];
  const counts = new Map();

  for (const v of adj) {
    const nb = nodeBin(getNode(v), mode) ?? "(unbinned)";
    counts.set(nb, (counts.get(nb) || 0) + 1);
  }

  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return entries.map(([k, c]) => `${k}:${c}`).join(", ");
}

/* =========================
   Interactive: tooltip
   ========================= */
function getNode(id) {
  return graphModel.nodesById.get(id);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[c];
  });
}

function formatTooltip(n) {
  const deg = (graphModel.adj.get(n.id) || []).length;
  const mix = adjacentBinMix(n.id, filters.mode);
  const uncertainty = nodeUncertainty(n);
  const stage = n.prov && n.prov.stage;

  const assignments = getResults()
    .map(
      (r) =>
        `<div>${escapeHtml(r.name)}: ${escapeHtml(nodeBin(n, r.key) ?? "(unbinned)")}</div>`
    )
    .join("");

  return `
    <div><b>${escapeHtml(n.id)}</b></div>
    ${assignments}
    ${
      stage
        ? `<div class="tooltip-sub">${escapeHtml(STAGE_LABELS[stage] || stage)}</div>`
        : ""
    }
    ${
      uncertainty == null
        ? ""
        : `<div>confidence: ${Math.round((1 - uncertainty) * 100)}%</div>`
    }
    <div>length: ${Number(n.len ?? 0).toLocaleString()}bp</div>
    <div>GC%: ${n.gc == null ? "n/a" : Number(n.gc).toFixed(2)}</div>
    <div>coverage: ${n.cov == null ? "n/a" : Number(n.cov).toFixed(2)}</div>
    <div>degree: ${deg}</div>
    ${n.misbinned ? "<div>misbinned: yes</div>" : ""}
    ${n.ambiguous_multi ? "<div>ambiguous: yes</div>" : ""}
    <div>adj bins: ${escapeHtml(mix || "n/a")}</div>
    <div class="tooltip-sub">click for the full decision record</div>
  `;
}

function showTooltip(tooltip, anchorEl, event, n) {
  if (!tooltip || !anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  tooltip.style.display = "block";
  tooltip.style.left = event.clientX - rect.left + 12 + "px";
  tooltip.style.top = event.clientY - rect.top + 12 + "px";
  tooltip.innerHTML = formatTooltip(n);
}

function hideTooltip(tooltip) {
  if (!tooltip) return;
  tooltip.style.display = "none";
  tooltip.innerHTML = "";
}

/* =========================
   Interactive: drawing
   ========================= */
function render() {
  if (!graphModel || !canvas || !ctx) return;

  resizeCanvasToDisplaySize();

  // compute khop set if needed
  if (filters.khopFrom && filters.khopK >= 0) {
    if (
      !graphModel.khopSet ||
      graphModel.khopSet._start !== filters.khopFrom ||
      graphModel.khopSet._k !== filters.khopK
    ) {
      const s = computeKHop(filters.khopFrom, filters.khopK);
      s._start = filters.khopFrom;
      s._k = filters.khopK;
      graphModel.khopSet = s;
    }
  } else {
    graphModel.khopSet = null;
  }

  const { width, height } = getCanvasSize();
  const t = currentTransform || { x: 0, y: 0, k: 1 };

  // Clear
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply DPR + zoom transform
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.transform(t.k, 0, 0, t.k, t.x, t.y);

  const visibleNodes = graphModel.nodes.filter((n) => isNodeVisible(n));
  const visibleIds = new Set(visibleNodes.map((n) => n.id));

  if (hoverNodeId && !visibleIds.has(hoverNodeId)) hoverNodeId = null;
  if (lockedNodeId && !visibleIds.has(lockedNodeId)) lockedNodeId = null;

  const activeNodeId = lockedNodeId || hoverNodeId || null;
  const activeAdj = activeNodeId
    ? new Set([activeNodeId, ...(graphModel.adj.get(activeNodeId) || [])])
    : null;

  // View bounds in world coords for culling
  const pad = 80;
  const minW = screenToWorld(-pad, -pad);
  const maxW = screenToWorld(width + pad, height + pad);

  const inBounds = (n) =>
    n.x >= minW.x && n.x <= maxW.x && n.y >= minW.y && n.y <= maxW.y;

  // edges
  ctx.lineWidth = 1 / t.k;
  ctx.strokeStyle = "#111827";

  for (const [u, v] of graphModel.edges) {
    const nu = getNode(u);
    const nv = getNode(v);
    if (!visibleIds.has(u) || !visibleIds.has(v)) continue;

    const minX = Math.min(nu.x, nv.x);
    const maxX = Math.max(nu.x, nv.x);
    const minY = Math.min(nu.y, nv.y);
    const maxY = Math.max(nu.y, nv.y);
    if (maxX < minW.x || minX > maxW.x || maxY < minW.y || minY > maxW.y) continue;

    if (!activeNodeId) ctx.globalAlpha = 0.25;
    else ctx.globalAlpha = (u === activeNodeId || v === activeNodeId) ? 0.85 : 0.05;

    ctx.beginPath();
    ctx.moveTo(nu.x, nu.y);
    ctx.lineTo(nv.x, nv.y);
    ctx.stroke();
  }

  // nodes
  ctx.globalAlpha = 1.0;
  const hasSelection = selection.size > 0;

  // During playback the graph shows an intermediate state of propagation, so
  // the markers that describe the *finished* result -- what changed, how
  // confident the final assignment was, what GraphBin flagged -- would be
  // describing something that has not happened yet. Draw labels only.
  const showResultMarkers = !replay.active;

  for (const n of visibleNodes) {
    if (!inBounds(n)) continue;

    const isHover = n.id === hoverNodeId;
    const isLocked = n.id === lockedNodeId;
    const isSelected = hasSelection && selection.has(n.id);
    const isOverridden = overrides.has(n.id);

    let r = baseNodeRadius * sizeFactor(n);
    if (isHover) r += NODE_RADIUS_DELTA.hover;
    if (isLocked) r += NODE_RADIUS_DELTA.locked;
    r = r / t.k;

    if (activeAdj && !activeAdj.has(n.id)) ctx.globalAlpha = 0.25;
    else if (hasSelection && !isSelected) ctx.globalAlpha = 0.15;
    else ctx.globalAlpha = 1.0;

    const b = nodeBin(n, filters.mode);

    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = colorForNode(n);
    ctx.fill();

    if (!b && filters.colorMode === "bin") {
      ctx.lineWidth = 1 / t.k;
      ctx.strokeStyle = "#9ca3af";
      ctx.stroke();
    }

    if (showResultMarkers && filters.markChanged && n.changed) {
      ctx.lineWidth = 2 / t.k;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.lineWidth = 2.5 / t.k;
      ctx.strokeStyle = BRAND_BLUE;
      ctx.stroke();
    }

    if (showResultMarkers && isOverridden) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 3 / t.k, 0, Math.PI * 2);
      ctx.lineWidth = 2 / t.k;
      ctx.setLineDash([3 / t.k, 2 / t.k]);
      ctx.strokeStyle = BRAND_BLUE;
      ctx.stroke();
      ctx.restore();
    }

    if (isSelected) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 2 / t.k, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 / t.k;
      ctx.strokeStyle = "#0f172a";
      ctx.stroke();
      ctx.restore();
    }

    if (isLocked) {
      ctx.lineWidth = 3 / t.k;
      ctx.strokeStyle = BRAND_BLUE;
      ctx.stroke();
    } else if (isHover) {
      ctx.lineWidth = 2 / t.k;
      ctx.strokeStyle = "#111827";
      ctx.stroke();
    }

    if (showResultMarkers && filters.markMisbinned && n.misbinned) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + (2 / t.k), 0, Math.PI * 2);
      ctx.lineWidth = 3 / t.k;
      ctx.setLineDash([2 / t.k, 2 / t.k]);
      ctx.strokeStyle = BRAND_RED;
      ctx.stroke();
      ctx.restore();
    }

    if (showResultMarkers && filters.markAmbiguous && n.ambiguous_multi) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + (5 / t.k), 0, Math.PI * 2);
      ctx.lineWidth = 2 / t.k;
      ctx.setLineDash([1 / t.k, 3 / t.k]);
      ctx.strokeStyle = "#334155";
      ctx.stroke();
      ctx.restore();
    }

  }
}



/* =====================================================================
   Encoding: colour and size channels
   ===================================================================== */

/**
 * The graph canvas and the plot surfaces stay white in both page themes (so
 * what is on screen matches the exported figures), which means data marks are
 * always drawn against a light surface and always use the light-surface
 * palette, whatever the surrounding page theme is.
 */
function stagePalette() {
  return STAGE_PALETTE.light;
}

const NO_VALUE_COLOR = "#e3e7ee";

/**
 * Single-hue sequential ramps, light -> dark, clamped away from the paper so
 * the lowest values stay visible against the canvas.
 */
function seqColor(interpolator, t) {
  const v = Math.max(0, Math.min(1, t));
  return interpolator(0.18 + 0.75 * v);
}

let featureExtents = null;

function computeFeatureExtents() {
  if (!graphModel) return;
  const ext = { cov: [Infinity, -Infinity], gc: [Infinity, -Infinity], len: [Infinity, -Infinity] };
  for (const n of graphModel.nodes) {
    for (const field of ["cov", "gc", "len"]) {
      const v = n[field];
      if (typeof v !== "number" || !isFinite(v)) continue;
      if (v < ext[field][0]) ext[field][0] = v;
      if (v > ext[field][1]) ext[field][1] = v;
    }
  }
  for (const field of ["cov", "gc", "len"]) {
    if (!isFinite(ext[field][0])) ext[field] = [0, 1];
    if (ext[field][0] === ext[field][1]) ext[field][1] = ext[field][0] + 1;
  }
  featureExtents = ext;
}

/** Normalised position of a feature value, log-scaled where the data demands it. */
function featureNorm(field, value) {
  if (typeof value !== "number" || !isFinite(value)) return null;
  if (!featureExtents) computeFeatureExtents();
  const [lo, hi] = featureExtents[field];
  if (field === "gc") return (value - lo) / (hi - lo);
  const l = Math.log10(Math.max(1e-6, value));
  const a = Math.log10(Math.max(1e-6, lo));
  const b = Math.log10(Math.max(1e-6, hi));
  if (b === a) return 0.5;
  return (l - a) / (b - a);
}

function colorForNode(n) {
  const mode = filters.colorMode;

  if (mode === "bin") return colorForBin(nodeBin(n, filters.mode));

  if (mode === "confidence") {
    // Shaded by how little support the assignment had, so the contigs worth
    // checking are the ones that stand out rather than the ones that are fine.
    const u = nodeUncertainty(n);
    if (u == null) return NO_VALUE_COLOR;
    return seqColor(d3.interpolateOranges, u);
  }

  if (mode === "disagreement") {
    const d = nodeDisagreement(n);
    if (d <= 0) return NO_VALUE_COLOR;
    return seqColor(d3.interpolatePurples, d);
  }

  if (mode === "stage") {
    return stagePalette()[nodeStageGroup(n)];
  }

  const t = featureNorm(mode, n[mode]);
  if (t == null) return NO_VALUE_COLOR;
  return seqColor(d3.interpolateBlues, t);
}

/** Radius multiplier for the active size channel. */
function sizeFactor(n) {
  const mode = filters.sizeMode;
  if (mode === "uniform") return 1;
  const field = mode === "degree" ? null : mode;
  let t;
  if (field) {
    t = featureNorm(field, n[field]);
  } else {
    const deg = (graphModel.adj.get(n.id) || []).length;
    t = featureNorm("len", null);
    t = Math.min(1, deg / 8);
  }
  if (t == null) return 0.7;
  // area-proportional so the visual weight matches the value
  return Math.sqrt(0.35 + 1.65 * t);
}

/* =====================================================================
   Shared selection across views
   ===================================================================== */

function setSelection(ids, label) {
  selection = new Set(ids || []);
  selectionLabel = label || "";
  updateSelectionSummary();
  render();
  renderScatter();
  renderSankey();
}

function clearSelection() {
  sankeyLocked = null;
  if (scatterBrush && scatterBrush.clear) scatterBrush.clear();
  setSelection([], "");
}

function updateSelectionSummary() {
  const el = document.getElementById("selection-summary");
  if (!el) return;
  if (!selection.size) {
    el.textContent = "";
    return;
  }
  const what = selectionLabel ? ` · ${selectionLabel}` : "";
  el.textContent = `${selection.size.toLocaleString()} contigs selected${what}`;
}

/* =====================================================================
   Provenance inspector: "why was this contig assigned here?"
   ===================================================================== */

function setInspectorMode(mode) {
  const title = document.getElementById("inspector-title");
  const back = document.getElementById("inspector-back");
  if (title) {
    title.textContent =
      mode === "record" ? "Why this assignment?" : "Refinement summary";
  }
  if (back) back.hidden = mode !== "record";
}

function renderProvPanel(nodeId) {
  const el = document.getElementById("prov-panel");
  if (!el) return;

  if (!nodeId || !graphModel) {
    setInspectorMode("summary");
    renderSummaryPanel();
    return;
  }

  setInspectorMode("record");

  const n = getNode(nodeId);
  if (!n) return;

  const p = n.prov || {};
  const stage = p.stage || "unresolved";
  const group = STAGE_GROUPS[stage] || "unresolved";
  const finalKey = graphbinResultKey();
  const shownBin = nodeBin(n, finalKey);
  const results = getResults();

  const rows = results
    .map((r) => {
      const b = nodeBin(n, r.key);
      const swatch = `<span class="prov-swatch" style="background:${colorForBin(b)}"></span>`;
      return `<tr><td>${escapeHtml(r.name)}</td><td>${swatch}${escapeHtml(b ?? "(unbinned)")}</td></tr>`;
    })
    .join("");

  const scores = p.scores || [];
  const scoreRows = scores
    .map(([bin, value]) => {
      const total = scores.reduce((acc, cur) => acc + cur[1], 0) || 1;
      const pct = Math.round((value / total) * 100);
      return `<div class="prov-bar-row">
          <span class="prov-bar-label">${escapeHtml(bin)}</span>
          <span class="prov-bar-track"><span class="prov-bar-fill" style="width:${pct}%;background:${colorForBin(bin)}"></span></span>
          <span class="prov-bar-value">${pct}%</span>
        </div>`;
    })
    .join("");

  const support = p.support || [];
  const supportRows = support
    .map(
      ([src, value]) =>
        `<li><button class="prov-link" data-node="${escapeHtml(src)}">${escapeHtml(src)}</button><span class="prov-support-weight">${Number(value).toFixed(3)}</span></li>`
    )
    .join("");

  const neighbourBins = p.neighbour_bins || {};
  const neighbourText =
    Object.entries(neighbourBins)
      .sort((a, b) => b[1] - a[1])
      .map(([bin, count]) => `${escapeHtml(bin)}&nbsp;×${count}`)
      .join(", ") || "none";

  const uncertainty = nodeUncertainty(n);

  const strippedNote =
    p.was_stripped && p.initial_bin
      ? `<p class="prov-explain prov-rejected">Its initial label <b>${escapeHtml(
          p.initial_bin
        )}</b> was rejected during label correction: ${
          p.strip_reason === "stripped_closest"
            ? "the nearest labelled contigs in the graph belonged to other bins"
            : "its immediate neighbours belonged to other bins"
        }.</p>`
      : "";

  const explain = {
    seed: "This contig kept the bin assigned by the initial binning tool: its graph neighbourhood agreed with that assignment, so refinement left it alone and used it as a seed for propagation.",
    locked: "You locked this assignment. Refinement treated it as a fixed seed and propagated outwards from it.",
    propagated: "This contig carried no trusted label, so its bin was inferred from labelled contigs reachable through the assembly graph.",
    stripped: "Refinement removed this contig's label because its graph neighbourhood contradicted it.",
    unresolved: "No label could be assigned: this contig is isolated, or sits in a component with no labelled contigs.",
  }[group === "seed" && stage === "locked" ? "locked" : group];

  el.innerHTML = `
    <div class="prov-head">
      <div class="prov-id">${escapeHtml(n.id)}</div>
      <div class="prov-stage prov-stage-${group}">
        <span class="prov-swatch" style="background:${stagePalette()[group]}"></span>
        ${escapeHtml(STAGE_LABELS[stage] || stage)}
      </div>
    </div>

    <p class="prov-explain">${explain}</p>
    ${strippedNote}

    <div class="prov-metrics">
      <div class="prov-metric">
        <div class="prov-metric-label">Confidence</div>
        <div class="prov-metric-value">${
          uncertainty == null ? "n/a" : `${Math.round((1 - uncertainty) * 100)}%`
        }</div>
      </div>
      <div class="prov-metric">
        <div class="prov-metric-label">Hops to seed</div>
        <div class="prov-metric-value">${p.hop == null ? "n/a" : p.hop}</div>
      </div>
      <div class="prov-metric">
        <div class="prov-metric-label">Labelled at</div>
        <div class="prov-metric-value">${
          p.first_iter == null ? "—" : `iter ${p.first_iter}`
        }</div>
      </div>
      <div class="prov-metric">
        <div class="prov-metric-label">Label changes</div>
        <div class="prov-metric-value">${p.n_switches ?? 0}</div>
      </div>
    </div>

    <div class="prov-section-title">Assignment across results</div>
    <table class="prov-table"><tbody>${rows}</tbody></table>

    ${
      scoreRows
        ? `<div class="prov-section-title">Competing bins</div>
           <div class="prov-bars">${scoreRows}</div>
           <div class="prov-note">Margin ${(p.margin ?? 0).toFixed(2)} · neighbourhood entropy ${(p.entropy ?? 0).toFixed(2)}</div>`
        : ""
    }

    ${
      supportRows
        ? `<div class="prov-section-title">Supporting contigs${
            p.n_support > support.length ? ` (top ${support.length} of ${p.n_support})` : ""
          }</div>
           <ul class="prov-support">${supportRows}</ul>
           <button class="btn tertiary prov-highlight" id="prov-highlight-support">Select supporters in all views</button>`
        : ""
    }

    <div class="prov-section-title">Adjacent bins</div>
    <div class="prov-note">${neighbourText}</div>

    <div class="prov-section-title">Contig</div>
    <div class="prov-note">
      length ${Number(n.len ?? 0).toLocaleString()} bp ·
      GC ${n.gc == null ? "n/a" : Number(n.gc).toFixed(1) + "%"} ·
      coverage ${n.cov == null ? "n/a" : Number(n.cov).toFixed(1)}×  ·
      degree ${(graphModel.adj.get(n.id) || []).length}
    </div>
  `;

  el.querySelectorAll(".prov-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.node;
      if (!target || !graphModel.nodesById.has(target)) return;
      lockedNodeId = target;
      renderProvPanel(target);
      render();
    });
  });

  const highlightBtn = document.getElementById("prov-highlight-support");
  if (highlightBtn) {
    highlightBtn.addEventListener("click", () => {
      const ids = support.map(([src]) => src).filter((id) => graphModel.nodesById.has(id));
      setSelection([n.id, ...ids], `supporters of ${n.id}`);
    });
  }
}

/* =====================================================================
   Feature-space scatter, brushed against the graph
   ===================================================================== */

const SCATTER_FIELDS = {
  gc: { label: "GC %", log: false, get: (n) => n.gc },
  cov: { label: "Coverage", log: true, get: (n) => n.cov },
  len: { label: "Length (bp)", log: true, get: (n) => n.len },
  confidence: {
    label: "Confidence",
    log: false,
    get: (n) => {
      const u = nodeUncertainty(n);
      return u == null ? null : 1 - u;
    },
  },
};

function getScatterFields() {
  const xf = document.getElementById("scatter-x")?.value || "gc";
  const yf = document.getElementById("scatter-y")?.value || "cov";
  return [xf, yf];
}

function renderScatter() {
  const svgEl = document.getElementById("feature-scatter");
  if (!svgEl || !window.d3 || !graphModel) return;

  const wrap = svgEl.parentElement;
  const width = Math.max(260, wrap?.clientWidth || 380);
  const height = Math.max(180, wrap?.clientHeight || 240);
  const margin = { top: 22, right: 12, bottom: 32, left: 48 };

  const [xf, yf] = getScatterFields();
  const xSpec = SCATTER_FIELDS[xf];
  const ySpec = SCATTER_FIELDS[yf];

  const points = [];
  for (const n of graphModel.nodes) {
    if (!isNodeVisible(n)) continue;
    const x = xSpec.get(n);
    const y = ySpec.get(n);
    if (typeof x !== "number" || typeof y !== "number") continue;
    if (!isFinite(x) || !isFinite(y)) continue;
    if (xSpec.log && x <= 0) continue;
    if (ySpec.log && y <= 0) continue;
    points.push({ n, x, y });
  }

  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  if (points.length === 0) {
    svg
      .append("text")
      .attr("x", 12)
      .attr("y", 22)
      .attr("font-size", 12)
      .attr("fill", "currentColor")
      .attr("opacity", 0.6)
      .text("No contigs with both features under the current filters.");
    return;
  }

  const xScale = (xSpec.log ? d3.scaleLog() : d3.scaleLinear())
    .domain(d3.extent(points, (d) => d.x))
    .nice()
    .range([margin.left, width - margin.right]);
  const yScale = (ySpec.log ? d3.scaleLog() : d3.scaleLinear())
    .domain(d3.extent(points, (d) => d.y))
    .nice()
    .range([height - margin.bottom, margin.top]);

  // recessive axes
  const axisColor = "currentColor";
  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .attr("opacity", 0.55)
    .call(d3.axisBottom(xScale).ticks(4, xSpec.log ? "~s" : undefined))
    .call((g) => g.selectAll("text").attr("font-size", 10))
    .call((g) => g.select(".domain").attr("stroke", axisColor).attr("opacity", 0.4));
  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .attr("opacity", 0.55)
    .call(d3.axisLeft(yScale).ticks(4, ySpec.log ? "~s" : undefined))
    .call((g) => g.selectAll("text").attr("font-size", 10))
    .call((g) => g.select(".domain").attr("stroke", axisColor).attr("opacity", 0.4));

  svg
    .append("text")
    .attr("x", width - margin.right)
    .attr("y", height - 6)
    .attr("text-anchor", "end")
    .attr("font-size", 10)
    .attr("fill", "currentColor")
    .attr("opacity", 0.7)
    .text(xSpec.label);
  svg
    .append("text")
    .attr("x", 4)
    .attr("y", 12)
    .attr("font-size", 10)
    .attr("fill", "currentColor")
    .attr("opacity", 0.7)
    .text(ySpec.label);

  const hasSelection = selection.size > 0;
  const tooltip = document.getElementById("scatter-tooltip");

  svg
    .append("g")
    .selectAll("circle")
    .data(points)
    .join("circle")
    .attr("cx", (d) => xScale(d.x))
    .attr("cy", (d) => yScale(d.y))
    .attr("r", (d) => (selection.has(d.n.id) ? 3.2 : 2.2))
    .attr("fill", (d) => colorForNode(d.n))
    .attr("fill-opacity", (d) => (!hasSelection || selection.has(d.n.id) ? 0.85 : 0.12))
    .attr("stroke", (d) => (selection.has(d.n.id) ? "currentColor" : "none"))
    .attr("stroke-width", 0.8)
    .on("mousemove", (event, d) => {
      if (!tooltip) return;
      const rect = wrap.getBoundingClientRect();
      tooltip.style.display = "block";
      tooltip.style.left = event.clientX - rect.left + 12 + "px";
      tooltip.style.top = event.clientY - rect.top + 12 + "px";
      tooltip.innerHTML = `<div><b>${escapeHtml(d.n.id)}</b></div>
        <div>${escapeHtml(xSpec.label)}: ${Number(d.x).toLocaleString()}</div>
        <div>${escapeHtml(ySpec.label)}: ${Number(d.y).toLocaleString()}</div>`;
    })
    .on("mouseleave", () => {
      if (tooltip) tooltip.style.display = "none";
    })
    .on("click", (event, d) => {
      lockedNodeId = d.n.id;
      renderProvPanel(d.n.id);
      render();
    });

  // brush writes into the shared selection
  const brush = d3
    .brush()
    .extent([
      [margin.left, margin.top],
      [width - margin.right, height - margin.bottom],
    ])
    .on("end", (event) => {
      if (!event.selection) return;
      const [[x0, y0], [x1, y1]] = event.selection;
      const ids = points
        .filter((d) => {
          const px = xScale(d.x);
          const py = yScale(d.y);
          return px >= x0 && px <= x1 && py >= y0 && py <= y1;
        })
        .map((d) => d.n.id);
      setSelection(ids, `${xSpec.label} × ${ySpec.label} brush`);
    });

  const brushG = svg.append("g").attr("class", "scatter-brush").call(brush);
  scatterBrush = {
    clear: () => {
      try {
        brushG.call(brush.move, null);
      } catch (e) {
        /* the brush may already be gone after a re-render */
      }
    },
  };
}

/* =====================================================================
   Propagation replay
   ===================================================================== */

function setReplayIteration(value) {
  const max = replay.max;
  const iter = Math.max(0, Math.min(max, Number(value) || 0));
  replay.iter = iter;
  replay.active = iter < max && max > 0;

  const label = document.getElementById("replay-value");
  if (label) {
    label.textContent = max === 0 ? "off" : replay.active ? `iter ${iter}` : "final";
  }
  const slider = document.getElementById("replay-slider");
  if (slider) {
    if (Number(slider.value) !== iter) slider.value = String(iter);
    updateRangeFill(slider);
  }

  const hint = document.getElementById("replay-hint");
  if (hint) {
    hint.textContent = replay.active
      ? "Showing labels as they spread; result markers are hidden until the end."
      : "Step through how labels spread outwards from the seeds.";
  }

  render();
  renderScatter();
  renderSankey();
}

function stopReplay() {
  if (replay.timer) {
    clearInterval(replay.timer);
    replay.timer = null;
  }
  const btn = document.getElementById("replay-play");
  if (btn) btn.textContent = "Play";
}

function toggleReplayPlayback() {
  if (replay.timer) {
    stopReplay();
    return;
  }
  if (!replay.max) return;

  const btn = document.getElementById("replay-play");
  if (btn) btn.textContent = "Pause";
  if (replay.iter >= replay.max) setReplayIteration(0);

  replay.timer = setInterval(() => {
    if (replay.iter >= replay.max) {
      stopReplay();
      return;
    }
    setReplayIteration(replay.iter + 1);
  }, replay.intervalMs);
}

/**
 * Replay only means anything for the refined result: propagation is what
 * produced it, and the other results were never built that way. Anywhere
 * else the transport is inert, so it is disabled rather than left to look
 * available.
 */
function replayApplies() {
  return !!graphModel && replay.max > 0 && filters.mode === graphbinResultKey();
}

function syncReplayAvailability() {
  const applies = replayApplies();

  if (!applies) {
    stopReplay();
    if (replay.max > 0) {
      setReplayIteration(replay.max); // leave the finished result on screen
    } else {
      replay.active = false;
      replay.iter = 0;
    }
  }

  const bar = document.querySelector(".replay-bar");
  if (bar) {
    bar.classList.toggle("is-disabled", !applies);
    bar.setAttribute("aria-disabled", String(!applies));
  }
  for (const id of ["replay-slider", "replay-play", "replay-speed"]) {
    const el = document.getElementById(id);
    if (el) el.disabled = !applies;
  }

  const hint = document.getElementById("replay-hint");
  if (hint && !applies) {
    hint.textContent =
      graphModel && replay.max > 0
        ? `Available on the ${resultName(graphbinResultKey())} result, which propagation produced.`
        : "Step through how labels spread outwards from the seeds.";
  }
}

function initReplayUI() {
  const slider = document.getElementById("replay-slider");
  const max = graphModel ? Number(graphModel.maxIteration || 0) : 0;
  replay.max = max;
  replay.iter = max;
  replay.active = false;

  if (slider) {
    slider.min = "0";
    slider.max = String(max);
    slider.value = String(max);
    updateRangeFill(slider);
  }
  const label = document.getElementById("replay-value");
  if (label) label.textContent = max === 0 ? "off" : "final";

  attachControl("replay-slider", "input", (e) => {
    stopReplay();
    setReplayIteration(e.target.value);
  });
  attachControl("replay-play", "click", toggleReplayPlayback);

  attachControl("replay-speed", "change", (e) => {
    replay.intervalMs = Number(e.target.value) || 600;
    // restart the timer so a speed change takes effect immediately
    if (replay.timer) {
      stopReplay();
      toggleReplayPlayback();
    }
  });

  const speed = document.getElementById("replay-speed");
  if (speed) replay.intervalMs = Number(speed.value) || 600;

  syncReplayAvailability();
}

/* =====================================================================
   Curation: lock assignments, re-run refinement, export
   ===================================================================== */

function populateOverrideBins() {
  const sel = document.getElementById("override-bin");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = "";

  const unbinned = document.createElement("option");
  unbinned.value = "__unbinned__";
  unbinned.textContent = "(unbinned)";
  sel.appendChild(unbinned);

  for (const [bin] of [...binColorMap.entries()].sort((a, b) =>
    String(a[0]).localeCompare(String(b[0]))
  )) {
    const opt = document.createElement("option");
    opt.value = bin;
    opt.textContent = bin;
    sel.appendChild(opt);
  }
  if (current) sel.value = current;
}

function renderOverrideSummary() {
  const el = document.getElementById("override-summary");
  if (!el) return;
  if (overrides.size === 0) {
    el.textContent = "No locked assignments.";
    return;
  }
  const counts = new Map();
  for (const bin of overrides.values()) {
    counts.set(bin, (counts.get(bin) || 0) + 1);
  }
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([bin, c]) => `${escapeHtml(bin)} ×${c}`)
    .join(", ");
  el.innerHTML = `<b>${overrides.size}</b> locked: ${parts}`;
}

function applyOverride() {
  const sel = document.getElementById("override-bin");
  if (!sel || !graphModel) return;

  const targets = selection.size
    ? [...selection]
    : lockedNodeId
    ? [lockedNodeId]
    : [];

  if (targets.length === 0) {
    log("Select one or more contigs before locking an assignment.");
    return;
  }

  const value = sel.value === "__unbinned__" ? null : sel.value;
  for (const id of targets) {
    if (value == null) overrides.delete(id);
    else overrides.set(id, value);
  }

  renderOverrideSummary();
  render();
  renderScatter();
  renderSankey();
  updateFlowStats();
  if (lockedNodeId) renderProvPanel(lockedNodeId);
  log(`Locked ${targets.length} contig(s) to ${value ?? "(unbinned)"}.`);
}

function clearOverrides() {
  overrides.clear();
  renderOverrideSummary();
  render();
  renderScatter();
  renderSankey();
  updateFlowStats();
}

/** Current effective assignment of the refined result, including locks. */
function curatedAssignments() {
  const key = graphbinResultKey();
  const rows = [];
  for (const n of graphModel.nodes) {
    const bin = overrides.has(n.id) ? overrides.get(n.id) : rawBin(n, key);
    if (bin == null || bin === "") continue;
    rows.push([n.id, bin]);
  }
  return rows;
}

function exportCuratedBinning() {
  if (!graphModel) return;
  const rows = curatedAssignments();
  const csv = rows.map(([id, bin]) => `${id},${bin}`).join("\n") + "\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "graphbin_viz_curated_binning.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  log(`Exported ${rows.length} curated contig assignments.`);
}

/**
 * Re-run refinement with the locked assignments treated as fixed seeds.
 *
 * This is what separates inspection from curation: the analyst's correction
 * is fed back into propagation, so the consequences of that correction spread
 * through the graph rather than being a cosmetic relabelling of one contig.
 */
async function rerunRefinement() {
  if (!graphModel || !lastRunContext) {
    log("Run a dataset first, then re-run refinement with locked assignments.");
    return;
  }
  if (overrides.size === 0) {
    log("Lock at least one assignment before re-running refinement.");
    return;
  }

  const btn = document.getElementById("rerun-refinement");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Re-running…";
  }

  try {
    const pyodide = await getPyodide();
    const { graphbinArgs, exportArgs, requiresPaths } = lastRunContext;

    // GraphBin keys contigs by their full name; the graph uses short ids, so
    // recover the full name recorded on each node where available.
    const locked = {};
    for (const [nodeId, bin] of overrides.entries()) {
      const n = graphModel.nodesById.get(nodeId);
      locked[(n && n.full_name) || nodeId] = bin;
    }

    const argsWithLocks = { ...graphbinArgs, locked };

    log(`Re-running GraphBin with ${overrides.size} locked assignment(s)...`);
    resetGraphbinStatus("Re-running GraphBin with locked assignments...");

    const moduleName = requiresPaths ? "graphbin_SPAdes" : "graphbin_MEGAHIT";
    await pyodide.runPythonAsync(`
import json
from types import SimpleNamespace
import ${moduleName}

args_dict = json.loads(${JSON.stringify(JSON.stringify(argsWithLocks))})
args_ns = SimpleNamespace(**args_dict)

${moduleName}.run(args_ns)
`);

    const exportModule = requiresPaths ? "interactive_export" : "interactive_export_megahit";
    await pyodide.runPythonAsync(`
import json
from types import SimpleNamespace
import ${exportModule}

args_dict = json.loads(${JSON.stringify(JSON.stringify(exportArgs))})
args_ns = SimpleNamespace(**args_dict)

${exportModule}.export(args_ns, "/out/interactive_graph.json")
`);

    const previousOverrides = new Map(overrides);
    graphModel = readJsonFromPyodide(pyodide, "/out/interactive_graph.json");
    prepareInteractiveModel(graphModel);
    rebuildSpatialIndex();
    buildBinColorMap();
    computeFeatureExtents();
    populateResultSelect();
    populateBinFilter();
    populateOverrideBins();
    renderLegend();
    initReplayUI();
    updateFlowStats();
    renderOverrideSummary();

    // the locks are now baked into the result, so they no longer need to be
    // applied on top of it
    overrides = new Map();
    renderOverrideSummary();

    render();
    renderScatter();
    renderSankey();
    if (lockedNodeId) renderProvPanel(lockedNodeId);

    log(
      `Refinement re-run complete with ${previousOverrides.size} locked assignment(s) applied.`
    );
  } catch (err) {
    console.error(err);
    log("Re-run failed: " + String(err));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Re-run refinement";
    }
  }
}

/* =====================================================================
   Result picker + legend
   ===================================================================== */

function populateResultSelect() {
  const sel = document.getElementById("view-mode");
  if (!sel) return;

  const results = getResults();
  sel.innerHTML = "";
  for (const r of results) {
    const opt = document.createElement("option");
    opt.value = r.key;
    opt.textContent = r.name;
    sel.appendChild(opt);
  }

  if (!results.some((r) => r.key === filters.mode)) {
    filters.mode = results[0].key;
  }
  sel.value = filters.mode;

  const title = document.getElementById("graph-view-title");
  if (title) title.textContent = `Assembly graph — ${resultName(filters.mode)}`;
}

function renderLegend() {
  const el = document.getElementById("bin-legend");
  if (!el) return;
  el.innerHTML = "";

  const mode = filters.colorMode;

  if (mode === "stage") {
    const palette = stagePalette();
    el.appendChild(makeLegendRow("Kept from initial binning", palette.seed));
    el.appendChild(makeLegendRow("Inferred by propagation", palette.propagated));
    el.appendChild(makeLegendRow("Label removed", palette.stripped));
    el.appendChild(makeLegendRow("No label available", palette.unresolved));
    return;
  }

  if (mode === "confidence" || mode === "disagreement" || mode === "cov" || mode === "gc" || mode === "len") {
    const interpolator =
      mode === "confidence"
        ? d3.interpolateOranges
        : mode === "disagreement"
        ? d3.interpolatePurples
        : d3.interpolateBlues;
    const captions = {
      confidence: ["high confidence", "low confidence"],
      disagreement: ["results agree", "results disagree"],
      cov: ["low coverage", "high coverage"],
      gc: ["low GC", "high GC"],
      len: ["short", "long"],
    }[mode];

    const ramp = document.createElement("div");
    ramp.className = "legend-ramp";
    const bar = document.createElement("div");
    bar.className = "legend-ramp-bar";
    const stops = [];
    for (let i = 0; i <= 10; i++) stops.push(seqColor(interpolator, i / 10));
    bar.style.background = `linear-gradient(to right, ${stops.join(", ")})`;
    const labels = document.createElement("div");
    labels.className = "legend-ramp-labels";
    labels.innerHTML = `<span>${captions[0]}</span><span>${captions[1]}</span>`;
    ramp.appendChild(bar);
    ramp.appendChild(labels);
    el.appendChild(ramp);
    return;
  }

  // default: bin identity
  el.appendChild(makeLegendRow("(unbinned)", "#d3d3d3"));

  // The marker overlays are switched on from the toolbar; the legend only
  // describes the ones currently drawn.
  if (filters.markChanged) {
    el.appendChild(makeLegendRow("Changed between results", BRAND_BLUE, "changed"));
  }
  if (filters.markMisbinned) {
    el.appendChild(makeLegendRow("Likely misbinned", BRAND_RED, "misbinned"));
  }
  if (filters.markAmbiguous) {
    el.appendChild(makeLegendRow("Ambiguous", "#334155", "ambiguous"));
  }

  const entries = [...binColorMap.entries()].sort((a, b) =>
    String(a[0]).localeCompare(String(b[0]))
  );
  for (const [bin, color] of entries) {
    el.appendChild(makeLegendRow(bin, color));
  }
}



/* =====================================================================
   Inspector: refinement summary
   ---------------------------------------------------------------------
   What the inspector shows when nothing is selected. A reader arriving at
   a fresh result needs to know how much of it refinement actually decided,
   how confident those decisions were, and which contigs are worth opening
   first -- otherwise the only way in is to click around the graph blindly.
   ===================================================================== */

const STAGE_SUMMARY_ORDER = ["seed", "propagated", "stripped", "unresolved"];

const STAGE_SUMMARY_LABELS = {
  seed: "Kept from initial binning",
  propagated: "Inferred by propagation",
  stripped: "Label removed",
  unresolved: "No label available",
};

const CONFIDENCE_BUCKETS = [
  { label: "0-20%", lo: 0.0, hi: 0.2 },
  { label: "20-40%", lo: 0.2, hi: 0.4 },
  { label: "40-60%", lo: 0.4, hi: 0.6 },
  { label: "60-80%", lo: 0.6, hi: 0.8 },
  { label: "80-100%", lo: 0.8, hi: 1.01 },
];

function summariseModel() {
  const stages = {};
  for (const key of STAGE_SUMMARY_ORDER) stages[key] = [];

  const confidence = CONFIDENCE_BUCKETS.map(() => []);
  const disputed = [];
  const bins = new Set();

  for (const n of graphModel.nodes) {
    stages[nodeStageGroup(n)].push(n.id);

    const uncertainty = nodeUncertainty(n);
    if (uncertainty != null) {
      const value = 1 - uncertainty;
      const index = CONFIDENCE_BUCKETS.findIndex(
        (b) => value >= b.lo && value < b.hi
      );
      confidence[index < 0 ? CONFIDENCE_BUCKETS.length - 1 : index].push(n.id);
    }

    if (nodeDisagreement(n) > 0) disputed.push(n.id);

    for (const r of getResults()) {
      const b = rawBin(n, r.key);
      if (b) bins.add(b);
    }
  }

  return { stages, confidence, disputed, bins: bins.size };
}

/**
 * The contigs worth opening first: those the results disagree about, and
 * those refinement decided with the least support.
 */
function contigsNeedingAttention(limit = 10) {
  const scored = [];

  for (const n of graphModel.nodes) {
    const disagreement = nodeDisagreement(n);
    const uncertainty = nodeUncertainty(n);
    const stage = nodeStageGroup(n);

    if (disagreement <= 0 && (uncertainty == null || uncertainty < 0.25)) continue;

    let reason;
    if (stage === "stripped") reason = "label removed";
    else if (disagreement > 0 && uncertainty != null && uncertainty >= 0.5)
      reason = "disputed, low confidence";
    else if (disagreement > 0) reason = "results disagree";
    else reason = "low confidence";

    scored.push({
      id: n.id,
      reason,
      score: disagreement * 2 + (uncertainty == null ? 0 : uncertainty),
      confidence: uncertainty == null ? null : 1 - uncertainty,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  // Ranking alone fills the list with whichever failure mode is most common
  // (usually removed labels). Take the worst few of each reason instead, so
  // the list shows the range of what is wrong rather than one category.
  const perReason = Math.max(2, Math.ceil(limit / 3));
  const counts = new Map();
  const spread = [];

  for (const item of scored) {
    const seen = counts.get(item.reason) || 0;
    if (seen >= perReason) continue;
    counts.set(item.reason, seen + 1);
    spread.push(item);
    if (spread.length >= limit) break;
  }

  // top up from the ranking if some reasons are absent
  if (spread.length < limit) {
    const taken = new Set(spread.map((item) => item.id));
    for (const item of scored) {
      if (taken.has(item.id)) continue;
      spread.push(item);
      if (spread.length >= limit) break;
    }
  }

  return spread.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function renderSummaryPanel() {
  const el = document.getElementById("prov-panel");
  if (!el || !graphModel) return;

  const summary = summariseModel();
  const total = graphModel.nodes.length || 1;
  const palette = stagePalette();
  const meta = graphModel.provenance_meta || {};

  const present = STAGE_SUMMARY_ORDER.filter((k) => summary.stages[k].length > 0);

  const segments = present
    .map((key) => {
      const count = summary.stages[key].length;
      const pct = (count / total) * 100;
      return `<button class="sum-seg" data-stage="${key}" style="width:${pct}%;background:${palette[key]}"
        title="${escapeHtml(STAGE_SUMMARY_LABELS[key])}: ${count.toLocaleString()}"></button>`;
    })
    .join("");

  const stageRows = present
    .map((key) => {
      const count = summary.stages[key].length;
      return `<button class="sum-row" data-stage="${key}">
          <span class="prov-swatch" style="background:${palette[key]}"></span>
          <span class="sum-row-label">${escapeHtml(STAGE_SUMMARY_LABELS[key])}</span>
          <span class="sum-row-value">${count.toLocaleString()}</span>
        </button>`;
    })
    .join("");

  const maxBucket = Math.max(1, ...summary.confidence.map((ids) => ids.length));
  const confidenceRows = CONFIDENCE_BUCKETS.map((bucket, i) => {
    const count = summary.confidence[i].length;
    const width = (count / maxBucket) * 100;
    const shade = seqColor(d3.interpolateOranges, 1 - (bucket.lo + bucket.hi) / 2);
    return `<button class="sum-hist-row" data-bucket="${i}" ${count ? "" : "disabled"}>
        <span class="sum-hist-label">${bucket.label}</span>
        <span class="sum-hist-track"><span class="sum-hist-fill" style="width:${width}%;background:${shade}"></span></span>
        <span class="sum-hist-value">${count.toLocaleString()}</span>
      </button>`;
  }).join("");

  const attention = contigsNeedingAttention();
  const attentionRows = attention.length
    ? attention
        .map(
          (item) => `<button class="sum-attention-row" data-node="${escapeHtml(item.id)}">
            <span class="sum-attention-id">${escapeHtml(item.id)}</span>
            <span class="sum-attention-reason">${escapeHtml(item.reason)}</span>
          </button>`
        )
        .join("")
    : '<div class="prov-note">Nothing contested: every result agrees and every assignment is well supported.</div>';

  const results = getResults();

  el.innerHTML = `
    <div class="sum-facts">
      <div class="prov-metric">
        <div class="prov-metric-label">Contigs</div>
        <div class="prov-metric-value">${total.toLocaleString()}</div>
      </div>
      <div class="prov-metric">
        <div class="prov-metric-label">Bins</div>
        <div class="prov-metric-value">${summary.bins}</div>
      </div>
      <div class="prov-metric">
        <div class="prov-metric-label">Seeds</div>
        <div class="prov-metric-value">${Number(meta.n_seeds || 0).toLocaleString()}</div>
      </div>
      <div class="prov-metric">
        <div class="prov-metric-label">Iterations</div>
        <div class="prov-metric-value">${Number(meta.lp_iterations || 0)}</div>
      </div>
    </div>
    <div class="prov-note sum-converged">
      Propagation ${
        meta.lp_converged
          ? "converged"
          : "stopped at the iteration limit"
      } · comparing ${results.length} result${results.length === 1 ? "" : "s"}
    </div>

    <div class="prov-section-title">How each bin was decided</div>
    <div class="sum-bar">${segments}</div>
    <div class="sum-rows">${stageRows}</div>

    <div class="prov-section-title">Refinement confidence</div>
    <div class="sum-hist">${confidenceRows}</div>

    <div class="prov-section-title">
      Needs attention
      ${
        summary.disputed.length
          ? `<button class="sum-inline-link" id="sum-select-disputed">select all ${summary.disputed.length.toLocaleString()} disputed</button>`
          : ""
      }
    </div>
    <div class="sum-attention">${attentionRows}</div>
  `;

  el.querySelectorAll("[data-stage]").forEach((node) => {
    node.addEventListener("click", () => {
      const key = node.dataset.stage;
      setSelection(summary.stages[key], STAGE_SUMMARY_LABELS[key].toLowerCase());
    });
  });

  el.querySelectorAll("[data-bucket]").forEach((node) => {
    node.addEventListener("click", () => {
      const index = Number(node.dataset.bucket);
      setSelection(
        summary.confidence[index],
        `confidence ${CONFIDENCE_BUCKETS[index].label}`
      );
    });
  });

  el.querySelectorAll(".sum-attention-row").forEach((node) => {
    node.addEventListener("click", () => {
      const id = node.dataset.node;
      lockedNodeId = id;
      focusNode(id);
      renderProvPanel(id);
      render();
    });
  });

  const disputedBtn = document.getElementById("sum-select-disputed");
  if (disputedBtn) {
    disputedBtn.addEventListener("click", () =>
      setSelection(summary.disputed, "results disagree")
    );
  }
}

/** Centre the view on one contig without changing how far it is zoomed out. */
function focusNode(id) {
  const n = getNode(id);
  if (!n || !canvas || !zoomBehavior) return;

  const { width, height } = getCanvasSize();
  const k = Math.max(currentTransform ? currentTransform.k : 1, 2);
  const t = d3.zoomIdentity.translate(width / 2 - k * n.x, height / 2 - k * n.y).scale(k);

  d3.select(canvas).transition().duration(400).call(zoomBehavior.transform, t);
}

/* =====================================================================
   Workspace chrome: legend overlay and collapsible lower views
   ===================================================================== */

function initWorkspaceChrome() {
  attachControl("legend-toggle", "click", () => {
    const overlay = document.getElementById("legend-overlay");
    const toggle = document.getElementById("legend-toggle");
    if (!overlay || !toggle) return;
    const collapsed = overlay.classList.toggle("collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
  });

  attachControl("toggle-bottom-row", "click", () => {
    const workspace = document.getElementById("workspace");
    const button = document.getElementById("toggle-bottom-row");
    if (!workspace || !button) return;

    const hidden = workspace.classList.toggle("bottom-hidden");
    button.textContent = hidden ? "Show lower views" : "Hide lower views";

    window.requestAnimationFrame(() => {
      resizeCanvasToDisplaySize();
      render();
      if (!hidden) {
        renderScatter();
        renderSankey();
      }
    });
  });

  attachControl("inspector-back", "click", () => {
    lockedNodeId = null;
    renderProvPanel(null);
    render();
  });
}


/* =====================================================================
   Range inputs
   ===================================================================== */

/**
 * Publish a range input's position as a percentage of its whole track, which
 * the stylesheet paints as the filled portion. Doing it here rather than
 * leaving it to the browser is what lets the track read as empty at the
 * minimum and completely full at the maximum.
 */
function updateRangeFill(el) {
  if (!el) return;
  const min = Number(el.min);
  const max = Number(el.max);
  const value = Number(el.value);
  const span = max - min;
  const pct = span > 0 ? ((value - min) / span) * 100 : 0;
  el.style.setProperty("--fill", `${Math.max(0, Math.min(100, pct))}%`);
}

function initRangeFills() {
  document.querySelectorAll('input[type="range"]').forEach((el) => {
    updateRangeFill(el);
    if (el.dataset._fillBound === "1") return;
    el.addEventListener("input", () => updateRangeFill(el));
    el.dataset._fillBound = "1";
  });
}

}
