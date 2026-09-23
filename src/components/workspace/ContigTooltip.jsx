import React from "react";

import { UNBINNED_LABEL } from "../../constants/graph.js";
import { STAGE_LABELS } from "../../constants/stages.js";
import { adjacentBinMix, degreeOf, nodeUncertainty } from "../../lib/model.js";

/** What hovering a contig on the canvas says about it. */
export function ContigTooltip({ model, node, results, binOf, mode }) {
  const uncertainty = nodeUncertainty(node);
  const stage = node.prov && node.prov.stage;
  const mix = adjacentBinMix(model, node.id, mode, binOf);

  return (
    <>
      <div>
        <b>{node.id}</b>
      </div>
      {results.map((r) => (
        <div key={r.key}>
          {r.name}: {binOf(node, r.key) ?? UNBINNED_LABEL}
        </div>
      ))}
      {stage ? <div className="tooltip-sub">{STAGE_LABELS[stage] || stage}</div> : null}
      {uncertainty == null ? null : (
        <div>confidence: {Math.round((1 - uncertainty) * 100)}%</div>
      )}
      <div>length: {Number(node.len ?? 0).toLocaleString()}bp</div>
      <div>GC%: {node.gc == null ? "n/a" : Number(node.gc).toFixed(2)}</div>
      <div>coverage: {node.cov == null ? "n/a" : Number(node.cov).toFixed(2)}</div>
      <div>degree: {degreeOf(model, node.id)}</div>
      {node.misbinned ? <div>misbinned: yes</div> : null}
      {node.ambiguous_multi ? <div>ambiguous: yes</div> : null}
      <div>adj bins: {mix || "n/a"}</div>
      <div className="tooltip-sub">click for the full decision record</div>
    </>
  );
}
