import React, { useMemo, useRef } from "react";
import { Select } from "@fluentui/react-select";

import { PLOT_TEXT } from "../../constants/graph.js";
import { SCATTER_AXIS_OPTIONS } from "../../constants/encodings.js";
import { SCATTER_FIELDS } from "../../lib/features.js";
import { useElementSize } from "../../hooks/useElementSize.js";
import { buildExecutionUrl } from "../../lib/url.js";
import { useExecution } from "../../state/executionStore.jsx";
import { useView } from "../../state/viewStore.jsx";
import { Plot } from "../../lib/plotly.js";
import { MaximizeButton } from "../common/MaximizeButton.jsx";
import { OpenInNewWindowButton } from "../common/OpenInNewWindowButton.jsx";
import { ViewShimmer } from "../common/Shimmers.jsx";

const MARGIN = { l: 48, r: 16, t: 22, b: 36 };

// Non-maximized sizes are untouched from before this view moved to Plotly.
// The maximized card can be several times taller than the docked one (it is
// `inset: 16px` of the viewport rather than a ~260px-tall card — see
// `.ws-view.is-maximized` in style.css), and a marker radius or tick label
// sized for the small card reads as a speck once the card fills the screen.
// `scaleFor` grows every size that matters (points, axis text, hover text,
// margins) together, but only while maximized: the docked view is exactly
// as before.
const MAXIMIZED_BASELINE_HEIGHT = 260;
const MAXIMIZED_SCALE_RANGE = [1.3, 2.4];

function scaleFor(maximized, height) {
  if (!maximized) return 1;
  const raw = height / MAXIMIZED_BASELINE_HEIGHT;
  return Math.min(MAXIMIZED_SCALE_RANGE[1], Math.max(MAXIMIZED_SCALE_RANGE[0], raw));
}

const BASE_POINT_SIZE = { normal: 5, selected: 7.5 };
const BASE_FONT = { tick: 10, axisTitle: 11.5, hover: 12 };

/**
 * GC × coverage (or any other pair of contig features), brushed against the
 * graph.
 *
 * Plotly draws here rather than raw d3/SVG: the axes, the box/lasso brush
 * and the zoom are all its job, and — unlike the old hand-rolled d3 brush,
 * which had no zoom at all — points stay hoverable and clickable at any
 * zoom level, because Plotly recomputes hit-testing from the current axis
 * range rather than from the marks drawn at mount time.
 */
export function FeatureScatter({ derived }) {
  const { model, isVisible, colorOf } = derived;
  const { state, dispatch } = useView();
  const { executionId, isPopout } = useExecution();
  const wrapRef = useRef(null);
  const size = useElementSize(wrapRef);

  const maximized = state.maximizedView === "scatter";

  const xSpec = SCATTER_FIELDS[state.scatter.x];
  const ySpec = SCATTER_FIELDS[state.scatter.y];

  const points = useMemo(() => {
    if (!model) return [];
    const out = [];
    for (const n of model.nodes) {
      if (!isVisible(n)) continue;
      const x = xSpec.get(n);
      const y = ySpec.get(n);
      if (typeof x !== "number" || typeof y !== "number") continue;
      if (!isFinite(x) || !isFinite(y)) continue;
      if (xSpec.log && x <= 0) continue;
      if (ySpec.log && y <= 0) continue;
      out.push({ n, x, y });
    }
    return out;
  }, [model, isVisible, xSpec, ySpec]);

  const width = Math.max(260, size.width || 380);
  const height = Math.max(180, size.height || 240);
  const scale = scaleFor(maximized, height);

  const selection = state.selection;
  const hasSelection = selection.size > 0;

  const { trace, layout, config } = useMemo(() => {
    const ids = points.map((d) => d.n.id);
    const selected = points.map((d) => selection.has(d.n.id));

    const traceObj = {
      type: "scatter",
      mode: "markers",
      x: points.map((d) => d.x),
      y: points.map((d) => d.y),
      customdata: ids,
      text: ids,
      hovertemplate:
        `%{text}<br>${xSpec.label}: %{x}<br>${ySpec.label}: %{y}<extra></extra>`,
      marker: {
        color: points.map((d) => colorOf(d.n)),
        size: selected.map((s) => (s ? BASE_POINT_SIZE.selected : BASE_POINT_SIZE.normal) * scale),
        opacity: selected.map((s) => (!hasSelection || s ? 0.85 : 0.12)),
        line: {
          color: PLOT_TEXT,
          width: selected.map((s) => (s ? 1 * scale : 0)),
        },
      },
      selected: { marker: { opacity: 0.85 } },
      unselected: { marker: { opacity: hasSelection ? 0.12 : 0.85 } },
    };

    const axisFont = { size: BASE_FONT.tick * scale, color: PLOT_TEXT };
    const titleFont = { size: BASE_FONT.axisTitle * scale, color: PLOT_TEXT };

    const layoutObj = {
      width,
      height,
      margin: {
        l: MARGIN.l * (1 + (scale - 1) * 0.7),
        r: MARGIN.r,
        t: MARGIN.t,
        b: MARGIN.b * (1 + (scale - 1) * 0.7),
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      dragmode: "select",
      hovermode: "closest",
      hoverlabel: {
        bgcolor: "#ffffff",
        bordercolor: PLOT_TEXT,
        font: { size: BASE_FONT.hover * scale, color: PLOT_TEXT },
      },
      // Keeps zoom/pan/selection alive across re-renders triggered by
      // recoloring or filter changes; changing which fields are plotted is
      // the one time a stale zoom range would be actively misleading, so
      // that's the one case this key changes.
      uirevision: `${state.scatter.x}:${state.scatter.y}`,
      xaxis: {
        type: xSpec.log ? "log" : "linear",
        title: { text: xSpec.label, font: titleFont, standoff: 6 * scale },
        tickfont: axisFont,
        gridcolor: "rgba(15, 23, 42, 0.08)",
        zerolinecolor: "rgba(15, 23, 42, 0.15)",
        linecolor: "rgba(15, 23, 42, 0.35)",
        showline: true,
      },
      yaxis: {
        type: ySpec.log ? "log" : "linear",
        title: { text: ySpec.label, font: titleFont, standoff: 4 * scale },
        tickfont: axisFont,
        gridcolor: "rgba(15, 23, 42, 0.08)",
        zerolinecolor: "rgba(15, 23, 42, 0.15)",
        linecolor: "rgba(15, 23, 42, 0.35)",
        showline: true,
      },
      font: { color: PLOT_TEXT },
    };

    const configObj = {
      displaylogo: false,
      scrollZoom: true,
      responsive: false,
      modeBarButtonsToRemove: ["toggleSpikelines", "hoverCompareCartesian", "hoverClosestCartesian"],
    };

    return { trace: traceObj, layout: layoutObj, config: configObj };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, selection, hasSelection, colorOf, width, height, scale, xSpec, ySpec, state.scatter.x, state.scatter.y]);

  const handleSelected = (event) => {
    if (!event) return;
    const ids = event.points.map((p) => p.customdata);
    dispatch({
      type: "selection/set",
      ids,
      label: `${xSpec.label} × ${ySpec.label} brush`,
    });
  };

  const handleClick = (event) => {
    const p = event?.points?.[0];
    if (!p) return;
    dispatch({ type: "inspector/lockNode", id: p.customdata });
  };

  const handleOpenNewWindow = () => {
    window.open(
      buildExecutionUrl({ executionId, maximize: "scatter", popout: true }),
      "_blank",
      "noopener"
    );
  };

  return (
    <div className={`ws-view ws-scatter${maximized ? " is-maximized" : ""}`}>
      <div className="ws-view-header">
        <span className="ws-view-title">Feature space</span>
        <div className="ws-view-controls">
          <Select
            id="scatter-x"
            size="small"
            value={state.scatter.x}
            onChange={(e) => dispatch({ type: "scatter/set", patch: { x: e.target.value } })}
          >
            {SCATTER_AXIS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select
            id="scatter-y"
            size="small"
            value={state.scatter.y}
            onChange={(e) => dispatch({ type: "scatter/set", patch: { y: e.target.value } })}
          >
            {SCATTER_AXIS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        {isPopout ? null : (
          <OpenInNewWindowButton
            label="feature space"
            disabled={!executionId}
            onOpen={handleOpenNewWindow}
          />
        )}
        <MaximizeButton
          label="feature space"
          maximized={maximized}
          onToggle={() =>
            dispatch({ type: "chrome/maximize", value: maximized ? null : "scatter" })
          }
        />
      </div>
      <div className="scatter-wrap" ref={wrapRef}>
        {points.length === 0 ? (
          <div
            id="feature-scatter"
            className="scatter-empty"
            role="img"
            aria-label="Contig feature scatter plot, brushable"
          >
            No contigs with both features under the current filters.
          </div>
        ) : (
          <Plot
            divId="feature-scatter"
            data={[trace]}
            layout={layout}
            config={config}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            onSelected={handleSelected}
            onClick={handleClick}
          />
        )}
        <ViewShimmer />
      </div>
      <div className="ws-view-note">
        Drag to brush contigs; scroll or use the toolbar to zoom — the graph and flow view follow.
      </div>
    </div>
  );
}
