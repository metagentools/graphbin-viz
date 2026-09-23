/** The contig features the scatter can plot on either axis. */

import { nodeUncertainty } from "./model.js";

export const SCATTER_FIELDS = {
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
