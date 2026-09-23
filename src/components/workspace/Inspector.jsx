import React from "react";
import { Button } from "@fluentui/react-button";

import { useView } from "../../state/viewStore.jsx";
import { InspectorShimmer } from "../common/Shimmers.jsx";
import { ContigRecord } from "./ContigRecord.jsx";
import { SummaryPanel } from "./SummaryPanel.jsx";

/**
 * The inspector opens on a summary of the run rather than a placeholder, and
 * drills into one contig's decision record when one is picked.
 */
export function Inspector({ derived, onOpenContig }) {
  const { model, results, binOf, binColors, unbinnedColor } = derived;
  const { state, dispatch } = useView();

  const node = model && state.lockedNodeId ? model.nodesById.get(state.lockedNodeId) : null;
  const showRecord = !!node;

  return (
    <div className="inspector">
      <div className="inspector-head">
        <span id="inspector-title" className="settings-title">
          {showRecord ? "Why this assignment?" : "Refinement summary"}
        </span>
        <Button
          id="inspector-back"
          type="button"
          size="small"
          appearance="transparent"
          hidden={!showRecord}
          onClick={() => dispatch({ type: "inspector/lockNode", id: null })}
        >
          Back to summary
        </Button>
      </div>
      <div className="prov-shell">
        <div id="prov-panel" className="prov-panel">
          {!model ? (
            <div className="prov-empty">
              Run a dataset to see how refinement decided each contig&rsquo;s bin.
            </div>
          ) : showRecord ? (
            <ContigRecord
              model={model}
              node={node}
              results={results}
              binOf={binOf}
              binColors={binColors}
              unbinnedColor={unbinnedColor}
              onOpenContig={onOpenContig}
            />
          ) : (
            <SummaryPanel model={model} results={results} onOpenContig={onOpenContig} />
          )}
        </div>
        <InspectorShimmer />
      </div>
    </div>
  );
}
