/**
 * The comparison model: what the Python exporter hands us, and the accessors
 * every view reads it through.
 *
 * Nothing here touches the DOM or React. The two pieces of view state that
 * change what a contig's bin *displays* as — the propagation replay and the
 * analyst's locked assignments — are passed in explicitly rather than read
 * from a global, which is what makes these functions testable and what lets
 * the components stay declarative.
 */

import { DEFAULT_RESULTS, UNBINNED_LABEL } from "../constants/graph.js";
import { STAGE_GROUPS } from "../constants/stages.js";

/**
 * Normalise a freshly parsed export in place: index the nodes, fill in the
 * multi-result description older exports lack, and build the adjacency list.
 */
export function prepareModel(model) {
  model.nodesById = new Map();
  for (const n of model.nodes) model.nodesById.set(n.id, n);

  if (!Array.isArray(model.results) || model.results.length === 0) {
    model.results = DEFAULT_RESULTS.map((r) => ({ ...r }));
  }

  const keys = model.results.map((r) => r.key);

  for (const n of model.nodes) {
    if (!n.bins) {
      n.bins = { r0: n.initial_bin ?? null, r1: n.final_bin ?? null };
    }
    if (n.disagreement == null) {
      // Only results that actually binned the contig can disagree about where
      // it belongs; one that left it unbinned expressed no opinion.
      const assigned = keys.map((k) => n.bins[k]).filter((b) => b != null && b !== "");
      const distinct = new Set(assigned);
      n.n_assigned = assigned.length;
      n.n_distinct = distinct.size;
      n.disagreement = assigned.length > 1 && distinct.size > 1 ? 1 : 0;
    }
  }

  model.provenance_meta = model.provenance_meta || {};
  model.maxIteration = Number(model.provenance_meta.max_iteration || 0);

  model.adj = new Map();
  for (const n of model.nodes) model.adj.set(n.id, []);
  for (const [u, v] of model.edges) {
    if (model.adj.has(u)) model.adj.get(u).push(v);
    if (model.adj.has(v)) model.adj.get(v).push(u);
  }

  return model;
}

export function getResults(model) {
  if (model && Array.isArray(model.results) && model.results.length) {
    return model.results;
  }
  return DEFAULT_RESULTS;
}

export function resultName(model, key) {
  const r = getResults(model).find((x) => x.key === key);
  return r ? r.name : key;
}

/** Key of the GraphBin-refined result, which is the one curation acts on. */
export function graphbinResultKey(model) {
  const results = getResults(model);
  const gb = results.find((r) => r.kind === "graphbin");
  if (gb) return gb.key;
  return results.length > 1 ? results[1].key : results[0].key;
}

/** The bin a result assigns, ignoring replay and analyst overrides. */
export function rawBin(n, key) {
  if (n.bins && Object.prototype.hasOwnProperty.call(n.bins, key)) {
    return n.bins[key] ?? null;
  }
  if (key === "r0") return n.initial_bin ?? null;
  if (key === "r1") return n.final_bin ?? null;
  return null;
}

/** Label held at replay iteration `iter`; null if not yet reached. */
export function replayBinFor(model, n, iter) {
  const key = graphbinResultKey(model);
  const p = n.prov;
  if (!p) return rawBin(n, key);

  const group = STAGE_GROUPS[p.stage] || "unresolved";
  if (group === "seed") return p.final_bin ?? rawBin(n, key);

  const history = p.history || [];
  let label = null;
  for (const entry of history) {
    if (entry[0] <= iter) label = entry[1];
    else break;
  }
  return label;
}

/**
 * Build the accessor the views use to ask "what bin does this contig show?".
 *
 * Overrides and the propagation replay both act on the refined result only:
 * the initial binning is an input and is never rewritten.
 */
export function createBinAccessor({ model, replay, overrides }) {
  const refinedKey = graphbinResultKey(model);
  return function binOf(n, key) {
    if (key === refinedKey) {
      if (replay && replay.active) return replayBinFor(model, n, replay.iter);
      if (overrides && overrides.has(n.id)) return overrides.get(n.id);
    }
    return rawBin(n, key);
  };
}

export function nodeUncertainty(n) {
  const p = n.prov;
  if (!p) return null;
  if (typeof p.confidence !== "number") return null;
  return Math.max(0, Math.min(1, 1 - p.confidence));
}

export function nodeStageGroup(n) {
  const stage = n.prov && n.prov.stage;
  return STAGE_GROUPS[stage] || "unresolved";
}

export function nodeDisagreement(n) {
  return typeof n.disagreement === "number" ? n.disagreement : 0;
}

export function degreeOf(model, id) {
  return (model.adj.get(id) || []).length;
}

export function isUnbinned(bin) {
  return bin == null || bin === "" || bin === "unbinned";
}

/** Every bin label any result assigns, sorted. */
export function allBins(model) {
  const bins = new Set();
  if (!model) return [];
  for (const n of model.nodes) {
    for (const r of getResults(model)) {
      const b = rawBin(n, r.key);
      if (b) bins.add(b);
    }
  }
  return [...bins].sort();
}

/** The bins of a contig's neighbours, most common first, as a short string. */
export function adjacentBinMix(model, nodeId, key, binOf) {
  const adj = model.adj.get(nodeId) || [];
  const counts = new Map();

  for (const v of adj) {
    const nb = binOf(model.nodesById.get(v), key) ?? UNBINNED_LABEL;
    counts.set(nb, (counts.get(nb) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, c]) => `${k}:${c}`)
    .join(", ");
}
