import React, { useState } from "react";
import { Button } from "@fluentui/react-button";
import { Label } from "@fluentui/react-label";
import { Select } from "@fluentui/react-select";

import { assignmentsToCsv, curatedAssignments, summariseOverrides } from "../../lib/curation.js";
import { downloadBlob } from "../../lib/download.js";
import { useGraphBinRun } from "../../hooks/useGraphBinRun.js";
import { useRun } from "../../state/runStore.jsx";
import { useView } from "../../state/viewStore.jsx";

const UNBINNED_VALUE = "__unbinned__";

/**
 * Human-in-the-loop curation.
 *
 * Locking an assignment is not a relabelling: locked contigs are fed back into
 * propagation as fixed seeds, so a correction spreads through the graph the
 * way the original seeds did.
 */
export function CurationPanel({ derived }) {
  const { model, binColors } = derived;
  const { state, dispatch } = useView();
  const { log } = useRun();
  const { rerunWithLocks } = useGraphBinRun();

  const [targetBin, setTargetBin] = useState(UNBINNED_VALUE);
  const [rerunning, setRerunning] = useState(false);

  const bins = [...binColors.keys()].sort((a, b) => String(a).localeCompare(String(b)));
  const counts = summariseOverrides(state.overrides);

  const applyOverride = () => {
    if (!model) return;
    const targets = state.selection.size
      ? [...state.selection]
      : state.lockedNodeId
      ? [state.lockedNodeId]
      : [];

    if (targets.length === 0) {
      log("Select one or more contigs before locking an assignment.");
      return;
    }

    const bin = targetBin === UNBINNED_VALUE ? null : targetBin;
    dispatch({ type: "overrides/apply", ids: targets, bin });
    log(`Locked ${targets.length} contig(s) to ${bin ?? "(unbinned)"}.`);
  };

  const exportCurated = () => {
    if (!model) return;
    const rows = curatedAssignments(model, state.overrides);
    downloadBlob(
      new Blob([assignmentsToCsv(rows)], { type: "text/csv" }),
      "graphbin_viz_curated_binning.csv"
    );
    log(`Exported ${rows.length} curated contig assignments.`);
  };

  const rerun = async () => {
    setRerunning(true);
    try {
      await rerunWithLocks();
    } finally {
      setRerunning(false);
    }
  };

  return (
    <div className="curate-block">
      <div className="settings-title">Curate</div>
      <div id="curation-panel" className="curation-panel">
        <div className="form-row">
          <Label htmlFor="override-bin" size="small">
            Assign selected to
          </Label>
          <div className="control">
            <Select
              id="override-bin"
              size="small"
              value={targetBin}
              onChange={(e) => setTargetBin(e.target.value)}
            >
              <option value={UNBINNED_VALUE}>(unbinned)</option>
              {bins.map((bin) => (
                <option key={bin} value={bin}>
                  {bin}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="ws-button-row">
          <Button id="apply-override" type="button" size="small" onClick={applyOverride}>
            Lock assignment
          </Button>
          <Button
            id="clear-overrides"
            type="button"
            size="small"
            onClick={() => dispatch({ type: "overrides/clear" })}
          >
            Clear locks
          </Button>
        </div>
        <div id="override-summary" className="override-summary">
          {state.overrides.size === 0 ? (
            "No locked assignments."
          ) : (
            <>
              <b>{state.overrides.size}</b> locked:{" "}
              {counts.map(([bin, c]) => `${bin} ×${c}`).join(", ")}
            </>
          )}
        </div>
        <div className="ws-button-row">
          <Button
            id="rerun-refinement"
            type="button"
            size="small"
            appearance="primary"
            disabled={rerunning}
            onClick={rerun}
          >
            {rerunning ? "Re-running…" : "Re-run refinement"}
          </Button>
          <Button
            id="export-curated"
            type="button"
            size="small"
            appearance="outline"
            onClick={exportCurated}
          >
            Export binning
          </Button>
        </div>
        <div className="ws-view-note">
          Locked contigs are treated as fixed seeds, so refinement is re-run under your
          correction rather than around it.
        </div>
      </div>
    </div>
  );
}
