import React, { useMemo } from "react";

import { interpolateOranges } from "../../d3.js";
import {
  CONFIDENCE_BUCKETS,
  STAGE_SUMMARY_LABELS,
  STAGE_SUMMARY_ORDER,
  stagePalette,
} from "../../constants/stages.js";
import { contigsNeedingAttention, summariseModel } from "../../lib/summary.js";
import { seqColor } from "../../lib/palette.js";
import { DISPUTED_LABEL, useView } from "../../state/viewStore.jsx";

/**
 * What the inspector shows when no contig is open.
 *
 * A reader arriving at a fresh result needs to know how much of it refinement
 * actually decided, how confident those decisions were, and which contigs are
 * worth opening first — otherwise the only way in is to click around the graph
 * blindly. Every element here selects the contigs it describes, so the summary
 * is the entry point into the data rather than a read-only header.
 */
export function SummaryPanel({ model, results, onOpenContig }) {
  const { state, dispatch } = useView();

  const summary = useMemo(() => summariseModel(model), [model]);
  const attention = useMemo(() => contigsNeedingAttention(model), [model]);

  const total = model.nodes.length || 1;
  const palette = stagePalette();
  const meta = model.provenance_meta || {};
  const present = STAGE_SUMMARY_ORDER.filter((k) => summary.stages[k].length > 0);
  const maxBucket = Math.max(1, ...summary.confidence.map((ids) => ids.length));

  const disputedActive =
    state.selectionLabel === DISPUTED_LABEL && state.selection.size > 0;

  const selectStage = (key) =>
    dispatch({
      type: "selection/set",
      ids: summary.stages[key],
      label: STAGE_SUMMARY_LABELS[key].toLowerCase(),
    });

  return (
    <>
      <div className="sum-facts">
        <Metric label="Contigs" value={total.toLocaleString()} />
        <Metric label="Bins" value={summary.bins} />
        <Metric label="Seeds" value={Number(meta.n_seeds || 0).toLocaleString()} />
        <Metric label="Iterations" value={Number(meta.lp_iterations || 0)} />
      </div>
      <div className="prov-note sum-converged">
        Propagation {meta.lp_converged ? "converged" : "stopped at the iteration limit"} ·
        comparing {results.length} result{results.length === 1 ? "" : "s"}
      </div>

      <div className="prov-section-title">How each bin was decided</div>
      <div className="sum-bar">
        {present.map((key) => {
          const count = summary.stages[key].length;
          return (
            <button
              key={key}
              className="sum-seg"
              data-stage={key}
              style={{ width: `${(count / total) * 100}%`, background: palette[key] }}
              title={`${STAGE_SUMMARY_LABELS[key]}: ${count.toLocaleString()}`}
              onClick={() => selectStage(key)}
            ></button>
          );
        })}
      </div>
      <div className="sum-rows">
        {present.map((key) => (
          <button
            key={key}
            className="sum-row"
            data-stage={key}
            onClick={() => selectStage(key)}
          >
            <span className="prov-swatch" style={{ background: palette[key] }}></span>
            <span className="sum-row-label">{STAGE_SUMMARY_LABELS[key]}</span>
            <span className="sum-row-value">
              {summary.stages[key].length.toLocaleString()}
            </span>
          </button>
        ))}
      </div>

      <div className="prov-section-title">Refinement confidence</div>
      <div className="sum-hist">
        {CONFIDENCE_BUCKETS.map((bucket, i) => {
          const count = summary.confidence[i].length;
          const shade = seqColor(interpolateOranges, 1 - (bucket.lo + bucket.hi) / 2);
          return (
            <button
              key={bucket.label}
              className="sum-hist-row"
              data-bucket={i}
              disabled={!count}
              onClick={() =>
                dispatch({
                  type: "selection/set",
                  ids: summary.confidence[i],
                  label: `confidence ${bucket.label}`,
                })
              }
            >
              <span className="sum-hist-label">{bucket.label}</span>
              <span className="sum-hist-track">
                <span
                  className="sum-hist-fill"
                  style={{ width: `${(count / maxBucket) * 100}%`, background: shade }}
                ></span>
              </span>
              <span className="sum-hist-value">{count.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      <div className="prov-section-title">Needs attention</div>
      {summary.disputed.length ? (
        <div className="sum-callout">
          <div className="sum-callout-text">
            <span className="sum-callout-count">
              {summary.disputed.length.toLocaleString()}
            </span>
            <span className="sum-callout-label">contigs the tools disagree on</span>
          </div>
          {/* the one control for the whole set, so it has to undo itself too */}
          <button
            className="btn secondary sum-callout-btn"
            type="button"
            id="sum-select-disputed"
            aria-pressed={disputedActive}
            onClick={() =>
              disputedActive
                ? dispatch({ type: "selection/clear" })
                : dispatch({
                    type: "selection/set",
                    ids: summary.disputed,
                    label: DISPUTED_LABEL,
                  })
            }
          >
            {disputedActive ? "Deselect all" : "Select all"}
          </button>
        </div>
      ) : null}
      <div className="sum-attention">
        {attention.length ? (
          attention.map((item) => (
            <button
              key={item.id}
              className="sum-attention-row"
              data-node={item.id}
              onClick={() => onOpenContig(item.id)}
            >
              <span className="sum-attention-id">{item.id}</span>
              <span className="sum-attention-reason">{item.reason}</span>
            </button>
          ))
        ) : (
          <div className="prov-note">
            Nothing contested: every result agrees and every assignment is well supported.
          </div>
        )}
      </div>
    </>
  );
}

function Metric({ label, value }) {
  return (
    <div className="prov-metric">
      <div className="prov-metric-label">{label}</div>
      <div className="prov-metric-value">{value}</div>
    </div>
  );
}

export { Metric };
