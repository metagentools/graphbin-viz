import React, { useEffect, useRef, useState } from "react";
import { Select } from "@fluentui/react-select";

import { axisBottom, axisLeft, brush, extent, scaleLinear, scaleLog, select } from "../../d3.js";
import { SCATTER_AXIS_OPTIONS } from "../../constants/encodings.js";
import { SCATTER_FIELDS } from "../../lib/features.js";
import { useElementSize } from "../../hooks/useElementSize.js";
import { useView } from "../../state/viewStore.jsx";
import { MaximizeButton } from "../common/MaximizeButton.jsx";
import { ViewShimmer } from "../common/Shimmers.jsx";

const MARGIN = { top: 22, right: 12, bottom: 32, left: 48 };

/**
 * GC × coverage (or any other pair of contig features), brushed against the
 * graph.
 *
 * d3 draws here because the axes, the scales and the brush are its job; the
 * effect re-runs whenever the view state it reads changes, so the plot is a
 * function of that state like every other view.
 */
export function FeatureScatter({ derived }) {
  const { model, isVisible, colorOf } = derived;
  const { state, dispatch } = useView();
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const size = useElementSize(wrapRef);
  const [tooltip, setTooltip] = useState(null);

  const maximized = state.maximizedView === "scatter";

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !model) return;

    const width = Math.max(260, size.width || 380);
    const height = Math.max(180, size.height || 240);

    const xSpec = SCATTER_FIELDS[state.scatter.x];
    const ySpec = SCATTER_FIELDS[state.scatter.y];

    const points = [];
    for (const n of model.nodes) {
      if (!isVisible(n)) continue;
      const x = xSpec.get(n);
      const y = ySpec.get(n);
      if (typeof x !== "number" || typeof y !== "number") continue;
      if (!isFinite(x) || !isFinite(y)) continue;
      if (xSpec.log && x <= 0) continue;
      if (ySpec.log && y <= 0) continue;
      points.push({ n, x, y });
    }

    const svg = select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    if (points.length === 0) {
      svg
        .append("text")
        .attr("x", 12)
        .attr("y", 22)
        .attr("font-size", 12)
        .attr("fill", "currentColor")
        .attr("opacity", 0.6)
        .text("No contigs with both features under the current filters.");
      return;
    }

    const xScale = (xSpec.log ? scaleLog() : scaleLinear())
      .domain(extent(points, (d) => d.x))
      .nice()
      .range([MARGIN.left, width - MARGIN.right]);
    const yScale = (ySpec.log ? scaleLog() : scaleLinear())
      .domain(extent(points, (d) => d.y))
      .nice()
      .range([height - MARGIN.bottom, MARGIN.top]);

    // recessive axes
    svg
      .append("g")
      .attr("transform", `translate(0,${height - MARGIN.bottom})`)
      .attr("opacity", 0.55)
      .call(axisBottom(xScale).ticks(4, xSpec.log ? "~s" : undefined))
      .call((g) => g.selectAll("text").attr("font-size", 10))
      .call((g) => g.select(".domain").attr("stroke", "currentColor").attr("opacity", 0.4));
    svg
      .append("g")
      .attr("transform", `translate(${MARGIN.left},0)`)
      .attr("opacity", 0.55)
      .call(axisLeft(yScale).ticks(4, ySpec.log ? "~s" : undefined))
      .call((g) => g.selectAll("text").attr("font-size", 10))
      .call((g) => g.select(".domain").attr("stroke", "currentColor").attr("opacity", 0.4));

    svg
      .append("text")
      .attr("x", width - MARGIN.right)
      .attr("y", height - 6)
      .attr("text-anchor", "end")
      .attr("font-size", 10)
      .attr("fill", "currentColor")
      .attr("opacity", 0.7)
      .text(xSpec.label);
    svg
      .append("text")
      .attr("x", 4)
      .attr("y", 12)
      .attr("font-size", 10)
      .attr("fill", "currentColor")
      .attr("opacity", 0.7)
      .text(ySpec.label);

    const selection = state.selection;
    const hasSelection = selection.size > 0;

    svg
      .append("g")
      .selectAll("circle")
      .data(points)
      .join("circle")
      .attr("cx", (d) => xScale(d.x))
      .attr("cy", (d) => yScale(d.y))
      .attr("r", (d) => (selection.has(d.n.id) ? 3.2 : 2.2))
      .attr("fill", (d) => colorOf(d.n))
      .attr("fill-opacity", (d) => (!hasSelection || selection.has(d.n.id) ? 0.85 : 0.12))
      .attr("stroke", (d) => (selection.has(d.n.id) ? "currentColor" : "none"))
      .attr("stroke-width", 0.8)
      .on("mousemove", (event, d) => {
        const rect = wrapRef.current.getBoundingClientRect();
        setTooltip({
          x: event.clientX - rect.left + 12,
          y: event.clientY - rect.top + 12,
          id: d.n.id,
          rows: [
            [xSpec.label, Number(d.x).toLocaleString()],
            [ySpec.label, Number(d.y).toLocaleString()],
          ],
        });
      })
      .on("mouseleave", () => setTooltip(null))
      .on("click", (event, d) => dispatch({ type: "inspector/lockNode", id: d.n.id }));

    // the brush writes into the shared selection
    const brushBehavior = brush()
      .extent([
        [MARGIN.left, MARGIN.top],
        [width - MARGIN.right, height - MARGIN.bottom],
      ])
      .on("end", (event) => {
        if (!event.selection) return;
        const [[x0, y0], [x1, y1]] = event.selection;
        const ids = points
          .filter((d) => {
            const px = xScale(d.x);
            const py = yScale(d.y);
            return px >= x0 && px <= x1 && py >= y0 && py <= y1;
          })
          .map((d) => d.n.id);
        dispatch({
          type: "selection/set",
          ids,
          label: `${xSpec.label} × ${ySpec.label} brush`,
        });
      });

    svg.append("g").attr("class", "scatter-brush").call(brushBehavior);
  }, [model, size.width, size.height, isVisible, colorOf, state.scatter, state.selection, dispatch]);

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
          <MaximizeButton
            label="feature space"
            maximized={maximized}
            onToggle={() =>
              dispatch({ type: "chrome/maximize", value: maximized ? null : "scatter" })
            }
          />
        </div>
      </div>
      <div className="scatter-wrap" ref={wrapRef}>
        <svg id="feature-scatter" ref={svgRef} role="img" aria-label="Contig feature scatter plot, brushable"></svg>
        <ViewShimmer />
        <div
          id="scatter-tooltip"
          className="tooltip"
          style={
            tooltip
              ? { display: "block", left: `${tooltip.x}px`, top: `${tooltip.y}px` }
              : { display: "none" }
          }
        >
          {tooltip ? (
            <>
              <div>
                <b>{tooltip.id}</b>
              </div>
              {tooltip.rows.map(([label, value]) => (
                <div key={label}>
                  {label}: {value}
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>
      <div className="ws-view-note">
        Drag to brush contigs; the graph and flow view follow.
      </div>
    </div>
  );
}
