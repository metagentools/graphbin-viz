/**
 * Decision stages: how refinement arrived at a contig's bin.
 *
 * The palette is three chromatic slots, validated for all-pairs separation
 * under normal and colour-deficient vision against a light plot surface, plus
 * neutral grey for "no label available". Every stage is also named in the
 * legend and in the record panel, so identity is never colour alone.
 */
export const STAGE_PALETTE = {
  light: {
    seed: "#2a78d6",
    stripped: "#eb6834",
    propagated: "#1baf7a",
    unresolved: "#b6bdc9",
  },
};

/** Fine-grained stage -> the four groups the encodings and legend speak in. */
export const STAGE_GROUPS = {
  seed: "seed",
  locked: "seed",
  propagated: "propagated",
  stripped_neighbour: "stripped",
  stripped_closest: "stripped",
  stripped_post: "stripped",
  unresolved: "unresolved",
};

export const STAGE_LABELS = {
  seed: "Kept from initial binning",
  locked: "Locked by analyst",
  propagated: "Inferred by propagation",
  stripped_neighbour: "Label removed (neighbours disagreed)",
  stripped_closest: "Label removed (nearest labelled contigs disagreed)",
  stripped_post: "Label removed after propagation",
  unresolved: "No label available",
};

export const STAGE_EXPLANATIONS = {
  seed: "This contig kept the bin assigned by the initial binning tool: its graph neighbourhood agreed with that assignment, so refinement left it alone and used it as a seed for propagation.",
  locked:
    "You locked this assignment. Refinement treated it as a fixed seed and propagated outwards from it.",
  propagated:
    "This contig carried no trusted label, so its bin was inferred from labelled contigs reachable through the assembly graph.",
  stripped:
    "Refinement removed this contig's label because its graph neighbourhood contradicted it.",
  unresolved:
    "No label could be assigned: this contig is isolated, or sits in a component with no labelled contigs.",
};

export const STAGE_SUMMARY_ORDER = ["seed", "propagated", "stripped", "unresolved"];

export const STAGE_SUMMARY_LABELS = {
  seed: "Kept from initial binning",
  propagated: "Inferred by propagation",
  stripped: "Label removed",
  unresolved: "No label available",
};

export const CONFIDENCE_BUCKETS = [
  { label: "0-20%", lo: 0.0, hi: 0.2 },
  { label: "20-40%", lo: 0.2, hi: 0.4 },
  { label: "40-60%", lo: 0.4, hi: 0.6 },
  { label: "60-80%", lo: 0.6, hi: 0.8 },
  { label: "80-100%", lo: 0.8, hi: 1.01 },
];

/**
 * The graph canvas and the plot surfaces stay white in both page themes (so
 * what is on screen matches the exported figures), which means data marks are
 * always drawn against a light surface and always use the light-surface
 * palette, whatever the surrounding page theme is.
 */
export function stagePalette() {
  return STAGE_PALETTE.light;
}
