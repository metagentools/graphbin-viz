/** Locked assignments: what they add up to, and how they leave the app. */

import { graphbinResultKey, rawBin } from "./model.js";

/** Current effective assignment of the refined result, including locks. */
export function curatedAssignments(model, overrides) {
  const key = graphbinResultKey(model);
  const rows = [];
  for (const n of model.nodes) {
    const bin = overrides.has(n.id) ? overrides.get(n.id) : rawBin(n, key);
    if (bin == null || bin === "") continue;
    rows.push([n.id, bin]);
  }
  return rows;
}

export function assignmentsToCsv(rows) {
  return rows.map(([id, bin]) => `${id},${bin}`).join("\n") + "\n";
}

/**
 * GraphBin keys contigs by their full name; the graph uses short ids, so
 * recover the full name recorded on each node where available.
 */
export function lockedByContigName(model, overrides) {
  const locked = {};
  for (const [nodeId, bin] of overrides.entries()) {
    const n = model.nodesById.get(nodeId);
    locked[(n && n.full_name) || nodeId] = bin;
  }
  return locked;
}

/** Locked bins, most used first, for the curation summary line. */
export function summariseOverrides(overrides) {
  const counts = new Map();
  for (const bin of overrides.values()) {
    counts.set(bin, (counts.get(bin) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
