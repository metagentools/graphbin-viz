import React from "react";

import { BRAND_BLUE, BRAND_RED, UNBINNED_COLOR } from "../../constants/graph.js";
import { RAMP_CAPTIONS, SIZE_CAPTIONS } from "../../constants/encodings.js";
import { stagePalette } from "../../constants/stages.js";
import {
  DEGREE_SIZE_CAP,
  RAMP_INTERPOLATORS,
  SIZE_SCALE,
  formatFeatureValue,
  seqColor,
} from "../../lib/palette.js";
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

/**
 * One end of the ramp, broken into fixed lines (each caption word, then the
 * value) rather than left to wrap -- wrapping puts a different number of
 * lines on each side depending on how the two caption strings happen to
 * break, which reads as misaligned. Splitting explicitly keeps both ends the
 * same shape.
 */
function RampEnd({ caption, value, align }) {
  const [first, ...rest] = caption.split(" ");
  const lines = [first];
  if (rest.length) lines.push(rest.join(" "));
  if (value) lines.push(`(${value})`);

  return (
    <div className={`legend-ramp-end legend-ramp-end-${align}`}>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            // The line break between "low"/"high" and "confidence" (etc.) is
            // CSS only (each .legend-ramp-line is its own flex row) -- there
            // is no actual space character between them in the DOM, so
            // anything that reads the plain text (tests, copy/paste, a
            // screen reader) sees them run together as one word. This adds
            // the space back without changing how it looks.
            <span aria-hidden="true" style={{ display: "none" }}>
              {" "}
            </span>
          ) : null}
          <span className="legend-ramp-line">{line}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function LegendRamp({ mode, extents }) {
  const interpolator = RAMP_INTERPOLATORS[mode];
  const captions = RAMP_CAPTIONS[mode];
  const stops = Array.from({ length: 11 }, (_, i) => seqColor(interpolator, i / 10));

  // For the raw-data channels the two ends of the ramp are only useful if
  // they say what "low" and "high" actually mean for this dataset -- a bare
  // "low"/"high" caption doesn't tell you whether coverage tops out at 8x or
  // 800x.
  const [lo, hi] = extents?.[mode] || [];
  const loText = formatFeatureValue(mode, lo);
  const hiText = formatFeatureValue(mode, hi);

  return (
    <div className="legend-ramp">
      <div
        className="legend-ramp-bar"
        style={{ background: `linear-gradient(to right, ${stops.join(", ")})` }}
      ></div>
      <div className="legend-ramp-labels">
        <RampEnd caption={captions[0]} value={loText} align="start" />
        <RampEnd caption={captions[1]} value={hiText} align="end" />
      </div>
    </div>
  );
}

/**
 * The other end of a size channel: two dots, small then large, standing for
 * the same low/high extremes `LegendRamp` shows for colour. Degree has no
 * dataset extents (it's capped at DEGREE_SIZE_CAP neighbours), so its ends
 * are fixed rather than read from `extents`.
 */
function LegendSizeRamp({ sizeMode, extents, baseRadius }) {
  const captions = SIZE_CAPTIONS[sizeMode];
  if (!captions) return null;

  let loText;
  let hiText;
  if (sizeMode === "degree") {
    loText = "0";
    hiText = `${DEGREE_SIZE_CAP}+`;
  } else {
    const [lo, hi] = extents?.[sizeMode] || [];
    loText = formatFeatureValue(sizeMode, lo);
    hiText = formatFeatureValue(sizeMode, hi);
  }

  // Same multiplier the canvas uses, so the two dots are proportioned the
  // way the nodes actually are -- just capped so the legend stays compact.
  const loR = baseRadius * SIZE_SCALE(0);
  const hiR = baseRadius * SIZE_SCALE(1);
  const displayScale = Math.min(1, 15 / hiR);
  const loD = Math.max(4, loR * displayScale * 2);
  const hiD = Math.max(loD, hiR * displayScale * 2);

  return (
    <div className="legend-size">
      <div className="legend-size-dots">
        <span className="legend-size-dot" style={{ width: loD, height: loD }}></span>
        <span className="legend-size-dot" style={{ width: hiD, height: hiD }}></span>
      </div>
      <div className="legend-ramp-labels">
        <RampEnd caption={captions[0]} value={loText} align="start" />
        <RampEnd caption={captions[1]} value={hiText} align="end" />
      </div>
    </div>
  );
}

/**
 * The legend is a key, not a control: it describes what is currently drawn, so
 * a marker appears here only while that marker is switched on.
 */
export function GraphLegend({ binColors, extents, sizeMode, baseRadius }) {
  const { state } = useView();
  const { colorMode, markers } = state;

  const sizeRamp =
    sizeMode && sizeMode !== "uniform" ? (
      <LegendSizeRamp sizeMode={sizeMode} extents={extents} baseRadius={baseRadius} />
    ) : null;

  if (colorMode === "stage") {
    const palette = stagePalette();
    return (
      <div id="bin-legend" className="bin-legend">
        <LegendRow label="Kept from initial binning" color={palette.seed} />
        <LegendRow label="Inferred by propagation" color={palette.propagated} />
        <LegendRow label="Label removed" color={palette.stripped} />
        <LegendRow label="No label available" color={palette.unresolved} />
        {sizeRamp}
      </div>
    );
  }

  if (RAMP_INTERPOLATORS[colorMode]) {
    return (
      <div id="bin-legend" className="bin-legend">
        <LegendRamp mode={colorMode} extents={extents} />
        {sizeRamp}
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
      {sizeRamp}
    </div>
  );
}
