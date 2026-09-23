import React, { useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "@fluentui/react-checkbox";

import { sankey, sankeyLinkHorizontal, select } from "../../d3.js";
import { UNBINNED_LABEL } from "../../constants/graph.js";
import { buildSankeyData, computeFlowStats } from "../../lib/sankeyData.js";
import { colorForBin } from "../../lib/palette.js";
import { useElementSize } from "../../hooks/useElementSize.js";
import { useView } from "../../state/viewStore.jsx";
import { MaximizeButton } from "../common/MaximizeButton.jsx";
import { ViewShimmer } from "../common/Shimmers.jsx";
import { FlowStats } from "./FlowStats.jsx";

/**
 * Where contigs went between results.
 *
 * With more than two results this is an alluvial rather than a two-column
 * Sankey: every binning result gets a column, so GraphBin reads as one result
 * among several rather than the privileged answer. Clicking a flow hands its
 * contigs to every other view.
 */
export function ContigFlow({ derived }) {
  const { model, results, binOf, binColors, unbinnedColor } = derived;
  const { state, dispatch } = useView();
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const size = useElementSize(wrapRef);
  const [tooltip, setTooltip] = useState(null);

  const maximized = state.maximizedView === "flow";
  const { onlyChanged, hideUnbinned, locked } = state.sankey;

  const stats = useMemo(
    () => (model ? computeFlowStats({ model, binOf }) : null),
    [model, binOf]
  );

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !model) return;

    const width = Math.max(320, size.width || 900);
    const height = svgEl.clientHeight || 520;

    const svg = select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    setTooltip(null);

    const data = buildSankeyData({ model, binOf, onlyChanged, hideUnbinned });
    if (data.links.length === 0 || data.nodes.length === 0) {
      svg
        .append("text")
        .attr("x", 16)
        .attr("y", 24)
        .attr("font-size", 14)
        .attr("fill", "#6b7280")
        .text("No contigs match the current Sankey filters.");
      return;
    }

    const layout = sankey()
      .nodeWidth(16)
      .nodePadding(12)
      .extent([
        [16, 14],
        [width - 16, height - 26],
      ]);

    // d3-sankey mutates in place; hand it shallow clones
    const graph = layout({
      nodes: data.nodes.map((d) => ({ ...d })),
      links: data.links.map((d) => ({ ...d })),
    });

    const colorOfBin = (bin) =>
      colorForBin(binColors, bin === UNBINNED_LABEL ? null : bin, unbinnedColor);

    svg
      .append("g")
      .attr("fill", "none")
      .selectAll("path")
      .data(graph.links)
      .join("path")
      .attr("d", sankeyLinkHorizontal())
      .attr("stroke-width", (d) => Math.max(1, d.width))
      .attr("stroke", (d) => colorOfBin(d.srcBin))
      .attr("stroke-opacity", (d) => {
        if (!locked) return 0.35;
        return d.source.name === locked.source && d.target.name === locked.target ? 0.85 : 0.08;
      })
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.preventDefault();
        const hit = { source: d.source.name, target: d.target.name };
        const isLocked =
          locked && locked.source === hit.source && locked.target === hit.target;
        if (isLocked) {
          dispatch({ type: "sankey/set", patch: { locked: null } });
          dispatch({ type: "selection/set", ids: [], label: "" });
        } else {
          dispatch({ type: "sankey/set", patch: { locked: hit } });
          dispatch({
            type: "selection/set",
            ids: d.ids || [],
            label: `${d.srcBin} → ${d.dstBin}`,
          });
        }
      })
      .on("mousemove", (event, d) => {
        const rect = wrapRef.current.getBoundingClientRect();
        setTooltip({
          x: event.clientX - rect.left + 12,
          y: event.clientY - rect.top + 12,
          link: {
            srcBin: d.srcBin,
            dstBin: d.dstBin,
            srcResult: d.srcResult,
            dstResult: d.dstResult,
            value: d.value,
          },
        });
      })
      .on("mouseleave", () => setTooltip(null));

    const node = svg.append("g").selectAll("g").data(graph.nodes).join("g");

    node
      .append("rect")
      .attr("x", (d) => d.x0)
      .attr("y", (d) => d.y0)
      .attr("height", (d) => Math.max(1, d.y1 - d.y0))
      .attr("width", (d) => d.x1 - d.x0)
      .attr("rx", 3)
      .attr("ry", 3)
      .attr("fill", (d) => colorOfBin(d.bin))
      .attr("stroke", "rgba(0,0,0,0.25)");

    node
      .append("text")
      .attr("x", (d) => (d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6))
      .attr("y", (d) => (d.y0 + d.y1) / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", (d) => (d.x0 < width / 2 ? "start" : "end"))
      .attr("font-size", 11)
      .attr("fill", "currentColor")
      .attr("opacity", 0.85)
      .text((d) => d.bin);
  }, [
    model,
    size.width,
    size.height,
    binOf,
    binColors,
    unbinnedColor,
    onlyChanged,
    hideUnbinned,
    locked,
    dispatch,
  ]);

  return (
    <div className={`ws-view ws-flow${maximized ? " is-maximized" : ""}`}>
      <div className="ws-view-header">
        <span className="ws-view-title">Contig flow between results</span>
        <div className="ws-view-controls">
          <Checkbox
            id="sankey-only-changed"
            className="cb"
            size="medium"
            label="Only changed"
            checked={onlyChanged}
            onChange={(_, data) =>
              dispatch({
                type: "sankey/set",
                patch: { onlyChanged: !!data.checked, locked: null },
              })
            }
          />
          <Checkbox
            id="sankey-hide-unbinned"
            className="cb"
            size="medium"
            label="Hide unbinned"
            checked={hideUnbinned}
            onChange={(_, data) =>
              dispatch({
                type: "sankey/set",
                patch: { hideUnbinned: !!data.checked, locked: null },
              })
            }
          />
          <MaximizeButton
            label="contig flow"
            maximized={maximized}
            onToggle={() =>
              dispatch({ type: "chrome/maximize", value: maximized ? null : "flow" })
            }
          />
        </div>
      </div>

      <FlowStats stats={stats} />

      <div className="sankey-wrap" ref={wrapRef}>
        <div className="sankey-title-row" id="sankey-title-row">
          {results.map((r) => (
            <div className="sankey-title" key={r.key}>
              {r.name}
            </div>
          ))}
        </div>
        <svg
          id="sankey-svg"
          ref={svgRef}
          role="img"
          aria-label="Flow diagram showing contig bin changes between results"
        ></svg>
        <ViewShimmer />
        <div
          id="sankey-tooltip"
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
                <b>{tooltip.link.srcBin}</b> → <b>{tooltip.link.dstBin}</b>
              </div>
              <div className="tooltip-sub">
                {tooltip.link.srcResult} → {tooltip.link.dstResult}
              </div>
              <div>contigs: {tooltip.link.value}</div>
              <div className="tooltip-sub">click to select these contigs</div>
            </>
          ) : null}
        </div>
      </div>
      <div className="ws-view-note">Click a flow to select those contigs in every view.</div>
    </div>
  );
}
