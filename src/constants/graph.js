/** Drawing and input constants shared across the app. */

export const NODE_RADIUS = {
  base: 5.5, // default node radius
  hover: 7.5, // on hover
  locked: 8.5, // on click
};

export const NODE_RADIUS_DELTA = {
  hover: NODE_RADIUS.hover - NODE_RADIUS.base,
  locked: NODE_RADIUS.locked - NODE_RADIUS.base,
};

export const GRAPHBIN_DEFAULTS = {
  max_iteration: 50,
  diff_threshold: 0.00001,
  min_bin_size: 5,
};

export const BRAND_BLUE = "#007fff";
export const BRAND_RED = "#ff0000";

/** Fill for a mark whose encoded value is missing. */
export const NO_VALUE_COLOR = "#e3e7ee";

/** Matches the unbinned grey the exported PNG plots use. */
export const UNBINNED_COLOR = "#d3d3d3";

export const UNBINNED_LABEL = "(unbinned)";

/** Upload guards. */
export const MAX_CONTIGS = 10000;
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

/**
 * Exports written before the multi-result schema carry only initial_bin /
 * final_bin; this is the equivalent two-result description for them.
 */
export const DEFAULT_RESULTS = [
  { key: "r0", name: "Initial", kind: "initial" },
  { key: "r1", name: "GraphBin", kind: "graphbin" },
];

/** Grid cell size (world units) of the hit-testing spatial index. */
export const SPATIAL_CELL = 20;

/** Hit radius, in screen pixels, when picking a contig on the canvas. */
export const PICK_RADIUS_PX = 8;
