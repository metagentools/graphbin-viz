import React, { useCallback } from "react";
import { Button } from "@fluentui/react-button";

import { CollapsibleSection } from "../common/CollapsibleSection.jsx";
import { RunLog } from "./RunLog.jsx";
import { StaticPlots } from "./StaticPlots.jsx";
import { useCollapsedSections } from "../../hooks/useCollapsedSections.js";
import { downloadBlob, getFileExtension } from "../../lib/download.js";
import { buildOutputZip } from "../../lib/pyodide/pipeline.js";
import { fileToBlob, getPyodide } from "../../lib/pyodide/runtime.js";
import { useRun } from "../../state/runStore.jsx";

export function OutputTab() {
  const { plots, log } = useRun();
  const { isCollapsed, toggleSection } = useCollapsedSections();

  const downloadPlot = useCallback(
    async (which) => {
      const plot = plots[which];
      if (!plot) {
        window.alert("No image available. Run the plot first.");
        return;
      }
      try {
        const pyodide = await getPyodide(log);
        const ext = getFileExtension(plot.path) || "png";
        downloadBlob(fileToBlob(pyodide, plot.path), `${which}_plot.${ext}`);
      } catch (err) {
        console.error(err);
        log("Download error: " + err);
      }
    },
    [plots, log]
  );

  const downloadZip = useCallback(async () => {
    try {
      const zipPath = await buildOutputZip(log);
      if (!zipPath) {
        window.alert("GraphBin output not available. Run GraphBin first.");
        return;
      }
      const pyodide = await getPyodide(log);
      downloadBlob(fileToBlob(pyodide, zipPath, "application/zip"), "graphbin_output.zip");
    } catch (err) {
      console.error(err);
      log("Download error: " + err);
    }
  }, [log]);

  return (
    <>
      <CollapsibleSection
        id="section-output"
        title="Output"
        collapsible
        isCollapsed={isCollapsed("section-output")}
        onToggle={() => toggleSection("section-output")}
        footer={
          <Button id="download-graphbin" type="button" appearance="primary" onClick={downloadZip}>
            Download GraphBin output (ZIP)
          </Button>
        }
      >
        <RunLog />
      </CollapsibleSection>

      <CollapsibleSection
        id="section-plots"
        title="Static plots"
        headerNote={
          <div className="ws-view-note plots-note">
            Publication-ready renderings of the same layout used in the workspace, for
            export.
          </div>
        }
      >
        <StaticPlots plots={plots} onDownload={downloadPlot} />
      </CollapsibleSection>
    </>
  );
}
