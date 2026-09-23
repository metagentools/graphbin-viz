/**
 * Run timings.
 *
 * The benchmark suite drives the app from Playwright and reads the results off
 * `window`, so these two globals are a published interface — see
 * tests/bench/benchmark.spec.js.
 */

export function nowMs() {
  if (window.performance && typeof window.performance.now === "function") {
    return window.performance.now();
  }
  return Date.now();
}

export function roundMs(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

let benchmarkRunId = 0;

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

export function startBenchmarkRun({ source, dataset, assembler, delimiter, fileSizes }) {
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

export function finishBenchmarkRun(run, { status, error = null } = {}) {
  const result = {
    run_id: run.run_id,
    source: run.source,
    dataset: run.dataset,
    assembler: run.assembler,
    delimiter: run.delimiter,
    status: status || "success",
    started_at: run.started_at,
    completed_at: new Date().toISOString(),
    total_ms: roundMs(nowMs() - run._started_perf_ms),
    user_agent: run.user_agent,
    file_sizes_bytes: run.file_sizes_bytes,
    counts: run.counts,
    phase_ms: run.phase_ms,
    error: error || run.error || null,
  };

  window.__lastBenchmark = result;
  if (!Array.isArray(window.__benchmarkHistory)) window.__benchmarkHistory = [];
  window.__benchmarkHistory.push(result);
  if (window.__benchmarkHistory.length > 200) {
    window.__benchmarkHistory = window.__benchmarkHistory.slice(-200);
  }
  return result;
}

/** Reset the published globals to their pre-run state. */
export function initBenchmarkGlobals() {
  window.__lastBenchmark = null;
  window.__benchmarkHistory = [];
}
