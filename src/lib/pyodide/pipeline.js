/**
 * A run, end to end: inputs into the Python filesystem, GraphBin, the static
 * plots, then the interactive export.
 *
 * The uploaded and the example runs differ only in how the four input files
 * arrive, so they share everything after that. Nothing here knows about React
 * or the DOM: progress is reported through the `log` and `status` callbacks
 * the caller supplies, and the result is returned as data.
 */

import { GRAPHBIN_DEFAULTS } from "../../constants/graph.js";
import { finishBenchmarkRun, nowMs, roundMs, startBenchmarkRun } from "../benchmark.js";
import { getFileExtension } from "../download.js";
import {
  fileToBlob,
  fileToObjectUrl,
  getPyodide,
  getPyodideFileSize,
  readJsonFromPyodide,
  readLayoutTiming,
  readTextFromPyodide,
  runWithArgs,
  writeServerFile,
  writeUploadedFile,
} from "./runtime.js";

const EXAMPLE_FILES = {
  graph: ["data/assembly_graph_with_scaffolds.gfa", "/data/assembly_graph.gfa"],
  contigs: ["data/contigs.fasta", "/data/contigs.fasta"],
  paths: ["data/contigs.paths", "/data/contigs.paths"],
  initial: ["data/initial_binning_res.csv", "/data/initial_binning.csv"],
};

const FINAL_OUTPUT_PATH = "/out/graphbin_output.csv";

/** Turn a known GraphBin failure into a message that says what to do about it. */
function mapGraphbinError(statusText, fallbackErr) {
  if (String(statusText || "").toLowerCase().includes("input mismatch")) {
    return new Error(
      "Input mismatch between initial binning results and provided assembly/contig files. Please check inputs."
    );
  }
  return fallbackErr;
}

/** Settings the two forms collect, with the GraphBin defaults filled in. */
export function normaliseSettings(raw) {
  const num = (value, fallback, test = (v) => v > 0) => {
    const n = Number(value);
    return Number.isFinite(n) && test(n) ? n : fallback;
  };

  return {
    assembler: raw.assembler || "spades",
    delimiter: raw.delimiter || ",",
    dpi: parseInt(raw.dpi, 10),
    width: parseInt(raw.width, 10),
    height: parseInt(raw.height, 10),
    vsize: parseInt(raw.vsize, 10),
    lsize: parseInt(raw.lsize, 10),
    imgtype: raw.imgtype || "png",
    maxIteration: num(raw.maxIteration, GRAPHBIN_DEFAULTS.max_iteration),
    minBinSize: num(raw.minBinSize, GRAPHBIN_DEFAULTS.min_bin_size),
    diffThreshold: num(raw.diffThreshold, GRAPHBIN_DEFAULTS.diff_threshold, (v) => v >= 0),
    showLpLog: String(raw.showLpLog) === "true",
  };
}

/** Run GraphBin itself, and leave its log where the user can read it. */
async function runGraphBin({ pyodide, module, args, status, benchmark }) {
  const started = nowMs();
  try {
    await runWithArgs(pyodide, `import ${module}`, `${module}.run(args_ns)`, args);
    benchmark.phase_ms.graphbin = roundMs(nowMs() - started);
  } catch (err) {
    benchmark.phase_ms.graphbin = roundMs(nowMs() - started);
    let text = "GraphBin failed. ";
    try {
      const logText = readTextFromPyodide(pyodide, "/out/graphbin.log");
      text += logText ? "\n" + logText : String(err);
    } catch (e) {
      text += String(err);
    }
    status.set(text.trim());
    throw mapGraphbinError(text, err);
  }

  // GraphBin streams its log through window.graphbinLog when it is chatty;
  // when it is not, fall back to the file it wrote.
  if (!status.hasLog()) {
    try {
      const logText = readTextFromPyodide(pyodide, "/out/graphbin.log");
      status.set(
        logText && logText.trim().length > 0
          ? logText
          : "GraphBin finished. Log file was empty."
      );
    } catch (e) {
      status.set("GraphBin finished. Log file not available.");
    }
  }
}

/** Locate the two static plots in /out and turn them into displayable URLs. */
function collectPlots(pyodide, imgtype, log) {
  const ext = (imgtype || "png").toLowerCase();
  const images = pyodide.FS.readdir("/out").filter((f) => f.endsWith("." + ext));
  log("Output files: " + images.join(", "));

  const pick = (needle, label) => {
    const file = images.find((f) => f.includes(needle));
    if (!file) {
      log(`${label} plot not found in /out.`);
      return null;
    }
    const path = "/out/" + file;
    // `blob` is what a saved session stores -- the object URL above only
    // resolves in this document, but a Blob survives into IndexedDB and can
    // be turned back into a fresh URL after a reload (see sessionSnapshot.js).
    return {
      path,
      url: fileToObjectUrl(pyodide, path),
      ext: getFileExtension(path),
      blob: fileToBlob(pyodide, path),
    };
  };

  return {
    initial: pick("initial_binning_result", "Initial"),
    final: pick("final_GraphBin_binning_result", "Final"),
  };
}

/**
 * The whole run.
 *
 * @returns {Promise<{model: object|null, plots: object, runContext: object, error: string|null}>}
 */
export async function runPipeline({ source, settings, files = {}, log, status }) {
  const isExample = source === "example";
  const assembler = isExample ? "spades" : settings.assembler;
  const requiresPaths = assembler === "spades";

  const benchmark = startBenchmarkRun({
    source: isExample ? "example" : "upload",
    dataset: isExample ? "example-data" : files.graph?.name || "uploaded-dataset",
    assembler,
    delimiter: settings.delimiter,
    fileSizes: isExample
      ? { graph: null, contigs: null, paths: null, initial: null }
      : {
          graph: files.graph?.size ?? null,
          contigs: files.contigs?.size ?? null,
          paths: requiresPaths ? files.paths?.size ?? null : null,
          initial: files.initial?.size ?? null,
        },
  });

  try {
    const pyodideStart = nowMs();
    const pyodide = await getPyodide(log);
    benchmark.phase_ms.pyodide_init = roundMs(nowMs() - pyodideStart);

    /* ---------------------------- inputs ---------------------------- */

    const inputLoadStart = nowMs();
    let graphPath;
    let contigsPath;
    let pathsPath = null;
    let initialPath;

    if (isExample) {
      log("Loading example data files into Pyodide FS...");
      graphPath = await writeServerFile(pyodide, ...EXAMPLE_FILES.graph);
      contigsPath = await writeServerFile(pyodide, ...EXAMPLE_FILES.contigs);
      pathsPath = await writeServerFile(pyodide, ...EXAMPLE_FILES.paths);
      initialPath = await writeServerFile(pyodide, ...EXAMPLE_FILES.initial);
    } else {
      log(
        "Writing input files into Pyodide FS... This step can take a while for large files. Please be patient!"
      );
      graphPath = await writeUploadedFile(pyodide, files.graph, "/data/assembly_graph.gfa");
      contigsPath = await writeUploadedFile(pyodide, files.contigs, "/data/contigs.fasta");
      pathsPath = requiresPaths
        ? await writeUploadedFile(pyodide, files.paths, "/data/contigs.paths")
        : null;
      initialPath = await writeUploadedFile(pyodide, files.initial, "/data/initial_binning.tsv");
    }
    benchmark.phase_ms.input_load = roundMs(nowMs() - inputLoadStart);

    if (isExample) {
      benchmark.file_sizes_bytes.graph = getPyodideFileSize(pyodide, graphPath);
      benchmark.file_sizes_bytes.contigs = getPyodideFileSize(pyodide, contigsPath);
      benchmark.file_sizes_bytes.paths = getPyodideFileSize(pyodide, pathsPath);
      benchmark.file_sizes_bytes.initial = getPyodideFileSize(pyodide, initialPath);
    }

    /* --------------------------- refinement -------------------------- */

    const graphbinArgs = {
      graph: graphPath,
      contigs: contigsPath,
      ...(requiresPaths ? { paths: pathsPath } : {}),
      binned: initialPath,
      output: "/out/",
      prefix: "",
      delimiter: settings.delimiter,
      max_iteration: settings.maxIteration,
      min_bin_size: settings.minBinSize,
      diff_threshold: settings.diffThreshold,
      show_lp_log: settings.showLpLog,
    };

    log(
      isExample
        ? "Running GraphBin on example data in Pyodide..."
        : "Running GraphBin in Pyodide... This step can take a while for large files."
    );
    status.reset("Running GraphBin...");

    await runGraphBin({
      pyodide,
      module: requiresPaths ? "graphbin_SPAdes" : "graphbin_MEGAHIT",
      args: graphbinArgs,
      status,
      benchmark,
    });

    /* ------------------------ extra comparisons ---------------------- */

    // Any additional binning results the user supplied become further columns
    // in the comparison, so GraphBin is one result among several rather than
    // the privileged "answer".
    const extraResults = [];
    const extras = isExample ? [] : files.extras || [];
    for (let i = 0; i < extras.length; i++) {
      const file = extras[i];
      const path = await writeUploadedFile(pyodide, file, `/data/extra_${i}.csv`);
      extraResults.push({
        name: file.name.replace(/\.(csv|tsv)$/i, ""),
        path,
        kind: "other",
        delimiter: settings.delimiter,
      });
    }
    if (extraResults.length) {
      log(`Comparing ${extraResults.length} additional binning result(s).`);
    }

    /* ------------------------ plots + export ------------------------- */

    const exportArgs = {
      initial: initialPath,
      final: FINAL_OUTPUT_PATH,
      graph: graphPath,
      paths: pathsPath,
      contigs: contigsPath,
      ...(isExample ? {} : { results: extraResults }),
      output: "/out/",
      prefix: "",
      dpi: settings.dpi,
      width: settings.width,
      height: settings.height,
      vsize: settings.vsize,
      lsize: settings.lsize,
      margin: 10,
      imgtype: settings.imgtype,
      delimiter: settings.delimiter,
    };

    const runContext = { graphbinArgs, exportArgs, requiresPaths };

    log(
      isExample
        ? "Running GraphBin visualise on example data in Pyodide..."
        : "Running GraphBin visualise in Pyodide... This step can take a while for large files. Please be patient!"
    );

    const visualizeStart = nowMs();
    const plotModule = requiresPaths ? "spades_plot" : "megahit_plot";
    const exportModule = requiresPaths ? "interactive_export" : "interactive_export_megahit";
    await runWithArgs(
      pyodide,
      `import ${plotModule}\nimport ${exportModule}`,
      `${plotModule}.run(args_ns)\n${exportModule}.export(args_ns, "/out/interactive_graph.json")`,
      exportArgs
    );
    benchmark.phase_ms.visualize = roundMs(nowMs() - visualizeStart);
    benchmark.phase_ms.layout = readLayoutTiming(pyodide);

    log(
      isExample
        ? "Python finished, reading example plots from /out..."
        : "Python finished, reading plots from /out..."
    );
    const plots = collectPlots(pyodide, settings.imgtype, log);

    /* --------------------------- the model --------------------------- */

    let model = null;
    let error = null;
    const prepareStart = nowMs();
    try {
      model = readJsonFromPyodide(pyodide, "/out/interactive_graph.json");
      benchmark.phase_ms.interactive_prepare = roundMs(nowMs() - prepareStart);
      benchmark.counts.nodes = model.nodes.length;
      benchmark.counts.edges = model.edges.length;
    } catch (e) {
      console.error(e);
      error = String(e);
      benchmark.error = error;
      log("Interactive graph JSON not found or failed to load: " + e);
    }

    return { model, plots, runContext, benchmark, error, isExample };
  } catch (err) {
    benchmark.error = String(err);
    finishBenchmarkRun(benchmark, { status: "failed", error: benchmark.error });
    throw err;
  }
}

/**
 * Re-run refinement with the locked assignments treated as fixed seeds.
 *
 * This is what separates inspection from curation: the analyst's correction is
 * fed back into propagation, so the consequences of that correction spread
 * through the graph rather than being a cosmetic relabelling of one contig.
 */
export async function rerunRefinement({ runContext, locked, log, status }) {
  const pyodide = await getPyodide(log);
  const { graphbinArgs, exportArgs, requiresPaths } = runContext;

  const module = requiresPaths ? "graphbin_SPAdes" : "graphbin_MEGAHIT";
  const exportModule = requiresPaths ? "interactive_export" : "interactive_export_megahit";

  status.reset("Re-running GraphBin with locked assignments...");

  await runWithArgs(pyodide, `import ${module}`, `${module}.run(args_ns)`, {
    ...graphbinArgs,
    locked,
  });
  await runWithArgs(
    pyodide,
    `import ${exportModule}`,
    `${exportModule}.export(args_ns, "/out/interactive_graph.json")`,
    exportArgs
  );

  return readJsonFromPyodide(pyodide, "/out/interactive_graph.json");
}

/** Zip everything GraphBin wrote, and hand it back as a Blob-ready path. */
export async function buildOutputZip(log) {
  const pyodide = await getPyodide(log);
  const zipPath = "/out/graphbin_output.zip";

  const files = pyodide.FS.readdir("/out").filter((f) => ![".", ".."].includes(f));
  if (files.length === 0) return null;

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

  return zipPath;
}

export { finishBenchmarkRun };
