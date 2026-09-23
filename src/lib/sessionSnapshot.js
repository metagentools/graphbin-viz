/**
 * What a saved session is made of, and how it comes back.
 *
 * This is a view-only restore: the input files never leave the machine's
 * Pyodide filesystem (nothing about that step survives a reload), so a
 * restored session carries the finished result, not the ability to re-run
 * refinement. `runContext` is deliberately never stored -- its absence is
 * what makes `useGraphBinRun.rerunWithLocks` refuse a restored session
 * instead of failing against a Pyodide filesystem that no longer exists.
 */

function cloneJson(value) {
  if (value == null) return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (e) {
      /* fall through to the JSON clone below */
    }
  }
  return JSON.parse(JSON.stringify(value));
}

const VIEW_FIELDS = [
  "mode",
  "refinedKey",
  "colorMode",
  "sizeMode",
  "binOnly",
  "nodeSize",
  "filters",
  "markers",
  "sankey",
  "scatter",
  "bottomHidden",
  "legendCollapsed",
];

/**
 * The slice of view state worth restoring -- encodings and filters, not the
 * live selection, locks or replay position, which describe an in-progress
 * analysis rather than the result itself.
 */
export function pickViewSnapshot(state) {
  const out = {};
  for (const key of VIEW_FIELDS) out[key] = cloneJson(state[key]);
  return out;
}

function plotForStorage(plot) {
  if (!plot) return null;
  return { ext: plot.ext, blob: plot.blob || null };
}

export function buildSessionSnapshot({
  id,
  name,
  createdAt,
  isExample,
  settings,
  files,
  model,
  plots,
  logText,
  statusText,
  view,
}) {
  const now = new Date().toISOString();
  return {
    id,
    name,
    createdAt: createdAt || now,
    updatedAt: now,
    isExample: !!isExample,
    assembler: settings?.assembler || null,
    inputSummary: isExample
      ? { isExample: true }
      : {
          isExample: false,
          fileNames: {
            graph: files?.graph?.name || null,
            contigs: files?.contigs?.name || null,
            paths: files?.paths?.name || null,
            initial: files?.initial?.name || null,
            extras: (files?.extras || []).map((f) => f.name),
          },
        },
    settings: cloneJson(settings) || {},
    model: cloneJson(model),
    plots: {
      initial: plotForStorage(plots?.initial),
      final: plotForStorage(plots?.final),
    },
    logText: logText || "",
    statusText: statusText || "",
    view: view || {},
  };
}

/**
 * Fresh, restore-scoped object URLs for a session's stored plot blobs. The
 * ones on the record that produced them are already gone by reload -- a
 * blob URL only resolves in the document that created it.
 */
export function hydrateSessionPlots(session) {
  const hydrate = (plot) =>
    plot && plot.blob
      ? { path: null, ext: plot.ext, url: URL.createObjectURL(plot.blob) }
      : null;
  return {
    initial: hydrate(session?.plots?.initial),
    final: hydrate(session?.plots?.final),
  };
}

export { cloneJson };
