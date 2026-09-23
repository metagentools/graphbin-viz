import React from "react";

import { useRun } from "../../state/runStore.jsx";

/**
 * The run log and GraphBin's own output.
 *
 * Both are plain text boxes: GraphBin's log arrives pre-formatted, and the
 * e2e suite and the benchmark harness read the run log as text.
 */
export function RunLog() {
  const { logText, statusText } = useRun();
  return (
    <>
      <div id="output" className="output-box">
        {logText}
      </div>
      <div className="status-card">
        <div className="status-title">GraphBin status</div>
        <div id="graphbin-status" className="status-log output-box">
          {statusText}
        </div>
      </div>
    </>
  );
}
