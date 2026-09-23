/** The encoding channels and filters the workspace toolbar offers. */

export const COLOR_MODES = [
  { value: "bin", label: "Bin assignment" },
  { value: "confidence", label: "Refinement confidence" },
  { value: "disagreement", label: "Cross-result disagreement" },
  { value: "stage", label: "Decision stage" },
  { value: "cov", label: "Coverage" },
  { value: "gc", label: "GC content" },
  { value: "len", label: "Contig length" },
];

export const SIZE_MODES = [
  { value: "uniform", label: "Uniform" },
  { value: "len", label: "Contig length" },
  { value: "cov", label: "Coverage" },
  { value: "degree", label: "Degree" },
];

/** Colour modes drawn as a continuous ramp, and what the two ends mean. */
export const RAMP_CAPTIONS = {
  confidence: ["high confidence", "low confidence"],
  disagreement: ["results agree", "results disagree"],
  cov: ["low coverage", "high coverage"],
  gc: ["low GC", "high GC"],
  len: ["short", "long"],
};

/** Chips that remove contigs from every view. */
export const FILTER_CHIPS = [
  { id: "toggle-only-disputed", key: "onlyDisputed", text: "Tools disagree" },
  { id: "toggle-low-confidence", key: "onlyLowConfidence", text: "Low confidence" },
  { id: "toggle-hide-unbinned", key: "hideUnbinned", text: "Hide unbinned" },
  { id: "toggle-hide-isolated", key: "hideIsolated", text: "Hide isolated" },
];

/**
 * Chips that annotate contigs on top of the drawing. Markers are opt-in: a
 * graph that arrives pre-annotated hides its own structure behind rings
 * nobody asked for.
 */
export const MARKER_CHIPS = [
  { id: "toggle-mark-changed", key: "markChanged", text: "Changed by refinement" },
  { id: "toggle-mark-misbinned", key: "markMisbinned", text: "Likely misbinned" },
  { id: "toggle-mark-ambiguous", key: "markAmbiguous", text: "Ambiguous" },
];

export const ALL_CHIPS = [...FILTER_CHIPS, ...MARKER_CHIPS];

export const NODE_SIZE_RANGE = { min: 2, max: 16, step: 0.5 };

export const REPLAY_SPEEDS = [
  { value: 1600, label: "Very slow" },
  { value: 1000, label: "Slow" },
  { value: 600, label: "Normal" },
  { value: 280, label: "Fast" },
];

export const SCATTER_AXIS_OPTIONS = [
  { value: "gc", label: "GC %" },
  { value: "cov", label: "Coverage" },
  { value: "len", label: "Length" },
  { value: "confidence", label: "Confidence" },
];
