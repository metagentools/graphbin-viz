import React from "react";

import { UNBINNED_LABEL } from "../../constants/graph.js";
import { STAGE_EXPLANATIONS, STAGE_LABELS, stagePalette } from "../../constants/stages.js";
import { colorForBin } from "../../lib/palette.js";
import { degreeOf, nodeStageGroup, nodeUncertainty } from "../../lib/model.js";
import { useView } from "../../state/viewStore.jsx";
import { Metric } from "./SummaryPanel.jsx";

/**
 * "Why was this contig assigned here?"
 *
 * The answer refinement recorded: which stage decided it, what the competing
 * bins scored, and which labelled contigs supplied the support. Both the
 * supporting contigs and the "select supporters" button reach back into the
 * shared selection, so the record is navigable rather than terminal.
 */
export function ContigRecord({ model, node, results, binOf, binColors, unbinnedColor, onOpenContig }) {
  const { dispatch } = useView();

  const p = node.prov || {};
  const stage = p.stage || "unresolved";
  const group = nodeStageGroup(node);
  const uncertainty = nodeUncertainty(node);
  const scores = p.scores || [];
  const support = p.support || [];
  const scoreTotal = scores.reduce((acc, cur) => acc + cur[1], 0) || 1;

  const explain = STAGE_EXPLANATIONS[group === "seed" && stage === "locked" ? "locked" : group];

  const neighbourText =
    Object.entries(p.neighbour_bins || {})
      .sort((a, b) => b[1] - a[1])
      .map(([bin, count]) => `${bin} ×${count}`)
      .join(", ") || "none";

  const swatch = (bin) => (
    <span
      className="prov-swatch"
      style={{ background: colorForBin(binColors, bin, unbinnedColor) }}
    ></span>
  );

  return (
    <>
      <div className="prov-head">
        <div className="prov-id">{node.id}</div>
        <div className={`prov-stage prov-stage-${group}`}>
          <span className="prov-swatch" style={{ background: stagePalette()[group] }}></span>
          {STAGE_LABELS[stage] || stage}
        </div>
      </div>

      <p className="prov-explain">{explain}</p>
      {p.was_stripped && p.initial_bin ? (
        <p className="prov-explain prov-rejected">
          Its initial label <b>{p.initial_bin}</b> was rejected during label correction:{" "}
          {p.strip_reason === "stripped_closest"
            ? "the nearest labelled contigs in the graph belonged to other bins"
            : "its immediate neighbours belonged to other bins"}
          .
        </p>
      ) : null}

      <div className="prov-metrics">
        <Metric
          label="Confidence"
          value={uncertainty == null ? "n/a" : `${Math.round((1 - uncertainty) * 100)}%`}
        />
        <Metric label="Hops to seed" value={p.hop == null ? "n/a" : p.hop} />
        <Metric label="Labelled at" value={p.first_iter == null ? "—" : `iter ${p.first_iter}`} />
        <Metric label="Label changes" value={p.n_switches ?? 0} />
      </div>

      <div className="prov-section-title">Assignment across results</div>
      <table className="prov-table">
        <tbody>
          {results.map((r) => {
            const bin = binOf(node, r.key);
            return (
              <tr key={r.key}>
                <td>{r.name}</td>
                <td>
                  {swatch(bin)}
                  {bin ?? UNBINNED_LABEL}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {scores.length ? (
        <>
          <div className="prov-section-title">Competing bins</div>
          <div className="prov-bars">
            {scores.map(([bin, value]) => {
              const pct = Math.round((value / scoreTotal) * 100);
              return (
                <div className="prov-bar-row" key={bin}>
                  <span className="prov-bar-label">{bin}</span>
                  <span className="prov-bar-track">
                    <span
                      className="prov-bar-fill"
                      style={{
                        width: `${pct}%`,
                        background: colorForBin(binColors, bin, unbinnedColor),
                      }}
                    ></span>
                  </span>
                  <span className="prov-bar-value">{pct}%</span>
                </div>
              );
            })}
          </div>
          <div className="prov-note">
            Margin {(p.margin ?? 0).toFixed(2)} · neighbourhood entropy{" "}
            {(p.entropy ?? 0).toFixed(2)}
          </div>
        </>
      ) : null}

      {support.length ? (
        <>
          <div className="prov-section-title">
            Supporting contigs
            {p.n_support > support.length ? ` (top ${support.length} of ${p.n_support})` : ""}
          </div>
          <ul className="prov-support">
            {support.map(([src, value]) => (
              <li key={src}>
                <button
                  className="prov-link"
                  data-node={src}
                  onClick={() => {
                    if (model.nodesById.has(src)) onOpenContig(src);
                  }}
                >
                  {src}
                </button>
                <span className="prov-support-weight">{Number(value).toFixed(3)}</span>
              </li>
            ))}
          </ul>
          <button
            className="btn tertiary prov-highlight"
            id="prov-highlight-support"
            onClick={() =>
              dispatch({
                type: "selection/set",
                ids: [
                  node.id,
                  ...support.map(([src]) => src).filter((id) => model.nodesById.has(id)),
                ],
                label: `supporters of ${node.id}`,
              })
            }
          >
            Select supporters in all views
          </button>
        </>
      ) : null}

      <div className="prov-section-title">Adjacent bins</div>
      <div className="prov-note">{neighbourText}</div>

      <div className="prov-section-title">Contig</div>
      <div className="prov-note">
        length {Number(node.len ?? 0).toLocaleString()} bp · GC{" "}
        {node.gc == null ? "n/a" : `${Number(node.gc).toFixed(1)}%`} · coverage{" "}
        {node.cov == null ? "n/a" : `${Number(node.cov).toFixed(1)}×`} · degree{" "}
        {degreeOf(model, node.id)}
      </div>
    </>
  );
}
