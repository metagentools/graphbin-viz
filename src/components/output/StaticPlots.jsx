import React from "react";
import { Button } from "@fluentui/react-button";

import { PlotsShimmer } from "../common/Shimmers.jsx";

/**
 * One exported figure: an image, or an embedded viewer when it was rendered
 * as a PDF.
 */
function PlotBlock({ id, plot, alt, title, downloadId, downloadLabel, onDownload }) {
  const isPdf = plot?.ext === "pdf";
  return (
    <div className="plot-block" id={id} style={{ display: plot ? "flex" : "none" }}>
      <img
        id={`${id.replace("-block", "")}-img`}
        alt={alt}
        src={!isPdf && plot ? plot.url : undefined}
        style={{ display: plot && !isPdf ? "block" : "none" }}
      />
      <iframe
        id={`${id.replace("-block", "")}-pdf`}
        title={title}
        className="plot-pdf"
        src={isPdf ? plot.url : undefined}
        style={{ display: isPdf ? "block" : "none" }}
      />
      <Button id={downloadId} type="button" size="small" onClick={onDownload}>
        {downloadLabel}
      </Button>
    </div>
  );
}

export function StaticPlots({ plots, onDownload }) {
  return (
    <>
      <PlotsShimmer />
      <div id="plots-row">
        <PlotBlock
          id="initial-block"
          plot={plots.initial}
          alt="Initial binning plot"
          title="Initial binning plot (PDF)"
          downloadId="download-initial"
          downloadLabel="Download initial binning result plot"
          onDownload={() => onDownload("initial")}
        />
        <PlotBlock
          id="final-block"
          plot={plots.final}
          alt="GraphBin binning plot"
          title="GraphBin binning plot (PDF)"
          downloadId="download-final"
          downloadLabel="Download GraphBin binning result plot"
          onDownload={() => onDownload("final")}
        />
      </div>
    </>
  );
}
