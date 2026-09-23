/** Which contigs the active filters leave on screen. */

import { nodeDisagreement, nodeUncertainty } from "./model.js";

/**
 * Build the predicate every view filters through, so the graph, the scatter
 * and the hit-testing all agree on what is currently shown.
 */
export function createVisibilityTest({ model, filters, binOf }) {
  return function isVisible(n) {
    const b = binOf(n, filters.mode);

    if (filters.hideUnbinned && (b == null || b === "")) return false;
    if (filters.onlyDisputed && nodeDisagreement(n) <= 0) return false;
    if (filters.onlyLowConfidence) {
      const u = nodeUncertainty(n);
      if (u == null || u < 0.5) return false;
    }
    if (filters.binOnly && b !== filters.binOnly) return false;
    if (filters.hideIsolated && (model.adj.get(n.id) || []).length === 0) return false;

    return true;
  };
}
