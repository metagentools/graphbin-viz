import React from "react";

import { BRAND_BLUE, BRAND_RED, UNBINNED_COLOR } from "../../constants/graph.js";
import { RAMP_CAPTIONS } from "../../constants/encodings.js";
import { stagePalette } from "../../constants/stages.js";
import { RAMP_INTERPOLATORS, seqColor } from "../../lib/palette.js";
import { useView } from "../../state/viewStore.jsx";

function LegendRow({ label, color, variant = "solid" }) {
  const swatchClass =
    variant === "solid" ? "bin-legend-swatch" : `bin-legend-swatch legend-${variant}`;
  const style = variant === "solid" ? { background: color } : { borderColor: color };
  return (
    <div className="bin-legend-item" title={label}>
      <div className={swatchClass} style={style}></div>
      <div className="bin-legend-label">{label}</div>
    </div>
  );
}

function LegendRamp({ mode }) {
  const interpolator = RAMP_INTERPOLATORS[mode];
  const captions = RAMP_CAPTIONS[mode];
  const stops = Array.from({ length: 11 }, (_, i) => seqColor(interpolator, i / 10));
  return (
    <div className="legend-ramp">
      <div
        className="legend-ramp-bar"
        style={{ background: `linear-gradient(to right, ${stops.join(", ")})` }}
      ></div>
      <div className="legend-ramp-labels">
        <span>{captions[0]}</span>
        <span>{captions[1]}</span>
      </div>
    </div>
  );
}

/**
 * The legend is a key, not a control: it describes what is currently drawn, so
 * a marker appears here only while that marker is switched on.
 */
export function GraphLegend({ binColors }) {
  const { state } = useView();
  const { colorMode, markers } = state;

  if (colorMode === "stage") {
    const palette = stagePalette();
    return (
      <div id="bin-legend" className="bin-legend">
        <LegendRow label="Kept from initial binning" color={palette.seed} />
        <LegendRow label="Inferred by propagation" color={palette.propagated} />
        <LegendRow label="Label removed" color={palette.stripped} />
        <LegendRow label="No label available" color={palette.unresolved} />
      </div>
    );
  }

  if (RAMP_INTERPOLATORS[colorMode]) {
    return (
      <div id="bin-legend" className="bin-legend">
        <LegendRamp mode={colorMode} />
      </div>
    );
  }

  const bins = [...binColors.entries()].sort((a, b) =>
    String(a[0]).localeCompare(String(b[0]))
  );

  return (
    <div id="bin-legend" className="bin-legend">
      <LegendRow label="(unbinned)" color={UNBINNED_COLOR} />
      {markers.markChanged ? (
        <LegendRow label="Changed by refinement" color={BRAND_BLUE} variant="changed" />
      ) : null}
      {markers.markMisbinned ? (
        <LegendRow label="Likely misbinned" color={BRAND_RED} variant="misbinned" />
      ) : null}
      {markers.markAmbiguous ? (
        <LegendRow label="Ambiguous" color="#334155" variant="ambiguous" />
      ) : null}
      {bins.map(([bin, color]) => (
        <LegendRow key={bin} label={bin} color={color} />
      ))}
    </div>
  );
}
