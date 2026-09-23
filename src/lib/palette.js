/**
 * Colour and size channels.
 *
 * Each `create*` function takes the view state once and returns a small
 * accessor, so the drawing loops call a closure per node instead of
 * re-deriving the encoding on every mark.
 */

import { interpolateBlues, interpolateOranges, interpolatePurples } from "../d3.js";
import { NO_VALUE_COLOR, UNBINNED_COLOR } from "../constants/graph.js";
import { stagePalette } from "../constants/stages.js";
import { getResults, nodeDisagreement, nodeStageGroup, nodeUncertainty, rawBin } from "./model.js";

/**
 * Bin -> colour, stable per dataset.
 *
 * The exporter ships the exact palette matplotlib used for the static plots,
 * so the interactive views and the figures agree; the generated fallback is
 * only for exports written before that was added.
 */
export function buildBinColorMap(model) {
  const map = new Map();
  if (!model) return map;

  if (model.bin_colors) {
    for (const [bin, color] of Object.entries(model.bin_colors)) {
      map.set(bin, color);
    }
    return map;
  }

  const bins = new Set();
  const keys = getResults(model).map((r) => r.key);
  for (const n of model.nodes) {
    for (const k of keys) {
      const b = rawBin(n, k);
      if (b) bins.add(b);
    }
  }
  const sorted = [...bins].sort();
  sorted.forEach((bin, i) => {
    const hue = (i * 360) / Math.max(1, sorted.length);
    map.set(bin, `hsl(${hue}, 65%, 55%)`);
  });
  return map;
}

export function colorForBin(binColors, bin, unbinnedColor = UNBINNED_COLOR) {
  if (!bin) return unbinnedColor;
  return binColors.get(bin) || "#6b7280";
}

/**
 * Single-hue sequential ramps, light -> dark, clamped away from the paper so
 * the lowest values stay visible against the canvas.
 */
export function seqColor(interpolator, t) {
  const v = Math.max(0, Math.min(1, t));
  return interpolator(0.18 + 0.75 * v);
}

export const RAMP_INTERPOLATORS = {
  confidence: interpolateOranges,
  disagreement: interpolatePurples,
  cov: interpolateBlues,
  gc: interpolateBlues,
  len: interpolateBlues,
};

export function computeFeatureExtents(model) {
  const ext = {
    cov: [Infinity, -Infinity],
    gc: [Infinity, -Infinity],
    len: [Infinity, -Infinity],
  };
  if (model) {
    for (const n of model.nodes) {
      for (const field of ["cov", "gc", "len"]) {
        const v = n[field];
        if (typeof v !== "number" || !isFinite(v)) continue;
        if (v < ext[field][0]) ext[field][0] = v;
        if (v > ext[field][1]) ext[field][1] = v;
      }
    }
  }
  for (const field of ["cov", "gc", "len"]) {
    if (!isFinite(ext[field][0])) ext[field] = [0, 1];
    if (ext[field][0] === ext[field][1]) ext[field][1] = ext[field][0] + 1;
  }
  return ext;
}

/** Normalised position of a feature value, log-scaled where the data demands it. */
export function featureNorm(extents, field, value) {
  if (typeof value !== "number" || !isFinite(value)) return null;
  if (!extents || !extents[field]) return null;
  const [lo, hi] = extents[field];
  if (field === "gc") return (value - lo) / (hi - lo);
  const l = Math.log10(Math.max(1e-6, value));
  const a = Math.log10(Math.max(1e-6, lo));
  const b = Math.log10(Math.max(1e-6, hi));
  if (b === a) return 0.5;
  return (l - a) / (b - a);
}

/** Fill colour for a contig under the active colour channel. */
export function createColorForNode({ colorMode, mode, binOf, binColors, extents, unbinnedColor }) {
  const palette = stagePalette();

  if (colorMode === "bin") {
    return (n) => colorForBin(binColors, binOf(n, mode), unbinnedColor);
  }

  if (colorMode === "confidence") {
    // Shaded by how little support the assignment had, so the contigs worth
    // checking are the ones that stand out rather than the ones that are fine.
    return (n) => {
      const u = nodeUncertainty(n);
      return u == null ? NO_VALUE_COLOR : seqColor(interpolateOranges, u);
    };
  }

  if (colorMode === "disagreement") {
    return (n) => {
      const d = nodeDisagreement(n);
      return d <= 0 ? NO_VALUE_COLOR : seqColor(interpolatePurples, d);
    };
  }

  if (colorMode === "stage") {
    return (n) => palette[nodeStageGroup(n)];
  }

  return (n) => {
    const t = featureNorm(extents, colorMode, n[colorMode]);
    return t == null ? NO_VALUE_COLOR : seqColor(interpolateBlues, t);
  };
}

/** Radius multiplier for the active size channel. */
export function createSizeFactor({ sizeMode, extents, model }) {
  if (sizeMode === "uniform") return () => 1;

  // area-proportional so the visual weight matches the value
  const scale = (t) => (t == null ? 0.7 : Math.sqrt(0.35 + 1.65 * t));

  if (sizeMode === "degree") {
    return (n) => scale(Math.min(1, (model.adj.get(n.id) || []).length / 8));
  }

  return (n) => scale(featureNorm(extents, sizeMode, n[sizeMode]));
}
