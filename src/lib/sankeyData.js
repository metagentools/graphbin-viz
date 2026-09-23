/** Shaping the comparison model into an alluvial diagram, and its headline counts. */

import { UNBINNED_LABEL } from "../constants/graph.js";
import { getResults, isUnbinned, graphbinResultKey, resultName } from "./model.js";

/**
 * One column per binning result, one link per group of contigs that moved the
 * same way between two adjacent columns. Links carry their contig ids so a
 * click can hand them to every other view.
 */
export function buildSankeyData({ model, binOf, onlyChanged, hideUnbinned }) {
  const results = getResults(model);
  const keys = results.map((r) => r.key);

  const nodes = [];
  const index = new Map();
  const ensure = (key, bin) => {
    const name = key + "|" + bin;
    if (!index.has(name)) {
      index.set(name, nodes.length);
      nodes.push({ name, key, bin, resultName: resultName(model, key) });
    }
    return index.get(name);
  };

  const label = (n, key) => {
    const b = binOf(n, key);
    return b == null || b === "" ? UNBINNED_LABEL : String(b);
  };

  const rows = [];
  const binsPerKey = new Map(keys.map((k) => [k, new Set()]));

  for (const n of model.nodes) {
    const labels = keys.map((k) => label(n, k));
    if (onlyChanged && labels.every((l) => l === labels[0])) continue;
    if (hideUnbinned && labels.some((l) => l === UNBINNED_LABEL)) continue;
    rows.push({ id: n.id, labels });
    labels.forEach((l, i) => binsPerKey.get(keys[i]).add(l));
  }

  // create column nodes in a stable order so the diagram does not reshuffle
  for (const k of keys) {
    const sorted = [...binsPerKey.get(k)].sort((a, b) => {
      if (a === UNBINNED_LABEL) return 1;
      if (b === UNBINNED_LABEL) return -1;
      return a.localeCompare(b);
    });
    for (const b of sorted) ensure(k, b);
  }

  const linkMap = new Map();
  for (const row of rows) {
    for (let i = 0; i < keys.length - 1; i++) {
      const sourceIdx = ensure(keys[i], row.labels[i]);
      const targetIdx = ensure(keys[i + 1], row.labels[i + 1]);
      const linkKey = sourceIdx + "->" + targetIdx;
      let link = linkMap.get(linkKey);
      if (!link) {
        link = {
          source: sourceIdx,
          target: targetIdx,
          value: 0,
          ids: [],
          srcBin: row.labels[i],
          dstBin: row.labels[i + 1],
          srcResult: resultName(model, keys[i]),
          dstResult: resultName(model, keys[i + 1]),
        };
        linkMap.set(linkKey, link);
      }
      link.value += 1;
      link.ids.push(row.id);
    }
  }

  return { nodes, links: [...linkMap.values()] };
}

/** What refinement did, in four numbers. */
export function computeFlowStats({ model, binOf }) {
  const results = getResults(model);
  const firstKey = results[0].key;
  const refinedKey = graphbinResultKey(model);

  let changed = 0;
  let reassigned = 0;
  let unbinnedToBinned = 0;
  let binnedToUnbinned = 0;

  for (const n of model.nodes) {
    const initBin = binOf(n, firstKey);
    const finalBin = binOf(n, refinedKey);
    const initUnbinned = isUnbinned(initBin);
    const finalUnbinned = isUnbinned(finalBin);

    if (initBin !== finalBin) changed += 1;
    if (!initUnbinned && !finalUnbinned && initBin !== finalBin) reassigned += 1;
    if (initUnbinned && !finalUnbinned) unbinnedToBinned += 1;
    if (!initUnbinned && finalUnbinned) binnedToUnbinned += 1;
  }

  return { changed, reassigned, unbinnedToBinned, binnedToUnbinned };
}
