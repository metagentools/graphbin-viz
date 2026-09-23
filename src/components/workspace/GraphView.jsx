import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import { select, zoom } from "../../d3.js";
import { PICK_RADIUS_PX } from "../../constants/graph.js";
import { drawGraph } from "../../lib/drawGraph.js";
import { pickNode } from "../../lib/spatial.js";
import { fitTransform, focusTransform, screenToWorld } from "../../lib/viewport.js";
import { useElementSize } from "../../hooks/useElementSize.js";
import { useView } from "../../state/viewStore.jsx";
import { ViewShimmer } from "../common/Shimmers.jsx";
import { ContigTooltip } from "./ContigTooltip.jsx";
import { GraphLegend } from "./GraphLegend.jsx";
import { ReplayBar } from "./ReplayBar.jsx";

/**
 * The assembly graph.
 *
 * React owns the state; d3 owns the zoom gesture and the canvas owns the
 * pixels. The drawing itself is a pure function of the view state, called from
 * an effect — so there is exactly one place that decides what a frame looks
 * like, and nothing redraws behind React's back.
 */
export const GraphView = forwardRef(function GraphView({ derived }, ref) {
  const { model, spatial, binColors, results, binOf, isVisible, colorOf, sizeOf, replayActive, replayAvailable } =
    derived;
  const { state, dispatch } = useView();

  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const zoomRef = useRef(null);
  const fittedModelRef = useRef(null);

  const size = useElementSize(wrapRef);
  const [transform, setTransform] = useState(null);
  const [hoverNodeId, setHoverNodeId] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  /* ------------------------------- zoom ------------------------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const behavior = zoom()
      .scaleExtent([0.05, 200])
      .on("zoom", (event) => setTransform(event.transform));
    zoomRef.current = behavior;
    select(canvas).call(behavior);

    return () => {
      select(canvas).on(".zoom", null);
      zoomRef.current = null;
    };
  }, []);

  const applyTransform = useCallback((next, animate) => {
    const canvas = canvasRef.current;
    if (!canvas || !zoomRef.current) return;
    const selection = select(canvas);
    if (animate) {
      selection.transition().duration(450).call(zoomRef.current.transform, next);
    } else {
      selection.call(zoomRef.current.transform, next);
    }
  }, []);

  const fitToView = useCallback(
    (animate = true) => {
      if (!model || !size.width || !size.height) return;
      applyTransform(fitTransform(model, { width: size.width, height: size.height }), animate);
    },
    [model, size.width, size.height, applyTransform]
  );

  useImperativeHandle(
    ref,
    () => ({
      fitToView,
      /** Centre on one contig without changing how far the view is zoomed out. */
      focusNode(id) {
        const node = model?.nodesById.get(id);
        if (!node || !size.width) return;
        applyTransform(
          focusTransform(node, {
            width: size.width,
            height: size.height,
            currentScale: transform?.k,
          }),
          true
        );
      },
    }),
    [fitToView, model, size.width, size.height, transform, applyTransform]
  );

  // A new model is fitted with a flourish; a resize (which includes the
  // workspace tab becoming visible for the first time) is fitted silently.
  useEffect(() => {
    if (!model || !size.width || !size.height) return;
    const isNewModel = fittedModelRef.current !== model;
    fittedModelRef.current = model;
    fitToView(isNewModel);
  }, [model, size.width, size.height, fitToView]);

  /* ------------------------------- draw ------------------------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(size.width * dpr));
    const h = Math.max(1, Math.floor(size.height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!model) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    drawGraph(ctx, {
      model,
      transform,
      width: size.width,
      height: size.height,
      dpr,
      isVisible,
      colorOf,
      sizeOf,
      binOf,
      mode: state.mode,
      colorMode: state.colorMode,
      markers: state.markers,
      baseRadius: state.nodeSize,
      selection: state.selection,
      overrides: state.overrides,
      hoverNodeId,
      lockedNodeId: state.lockedNodeId,
      replayActive,
    });
  }, [
    model,
    transform,
    size.width,
    size.height,
    isVisible,
    colorOf,
    sizeOf,
    binOf,
    state.mode,
    state.colorMode,
    state.markers,
    state.nodeSize,
    state.selection,
    state.overrides,
    state.lockedNodeId,
    hoverNodeId,
    replayActive,
  ]);

  /* ---------------------------- interaction ---------------------------- */

  const pickAt = useCallback(
    (offsetX, offsetY) => {
      if (!model || !spatial) return null;
      const k = transform?.k || 1;
      return pickNode({
        index: spatial,
        model,
        world: screenToWorld(transform, offsetX, offsetY),
        radiusWorld: PICK_RADIUS_PX / k,
        isVisible,
      });
    },
    [model, spatial, transform, isVisible]
  );

  const offsetsOf = (event) => {
    const native = event.nativeEvent || event;
    return [native.offsetX, native.offsetY];
  };

  const handleMouseMove = (event) => {
    const id = pickAt(...offsetsOf(event));
    setHoverNodeId(id);
    if (!id) {
      setTooltip(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      id,
      x: event.clientX - rect.left + 12,
      y: event.clientY - rect.top + 12,
    });
  };

  const handleMouseLeave = () => {
    setHoverNodeId(null);
    setTooltip(null);
  };

  const handleClick = (event) => {
    const id = pickAt(...offsetsOf(event));
    dispatch({ type: "inspector/lockNode", id: state.lockedNodeId === id ? null : id });
    if (id && event.shiftKey) {
      dispatch({ type: "selection/toggleNode", id });
    }
  };

  const tooltipNode = tooltip && model ? model.nodesById.get(tooltip.id) : null;

  return (
    <div className="ws-graph">
      <div className="interactive-canvas-wrap" ref={wrapRef}>
        <canvas
          id="graph-canvas"
          ref={canvasRef}
          width="900"
          height="640"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        ></canvas>
        <ViewShimmer className="shimmer-graph" />
        <div
          id="hover-tooltip"
          className="tooltip"
          style={
            tooltipNode
              ? { display: "block", left: `${tooltip.x}px`, top: `${tooltip.y}px` }
              : { display: "none" }
          }
        >
          {tooltipNode ? (
            <ContigTooltip
              model={model}
              node={tooltipNode}
              results={results}
              binOf={binOf}
              mode={state.mode}
            />
          ) : null}
        </div>
        <div
          id="legend-overlay"
          className={`legend-overlay${state.legendCollapsed ? " collapsed" : ""}`}
        >
          <button
            id="legend-toggle"
            className="legend-overlay-head"
            type="button"
            aria-expanded={!state.legendCollapsed}
            aria-controls="bin-legend"
            onClick={() => dispatch({ type: "chrome/toggleLegend" })}
          >
            Legend
          </button>
          <GraphLegend binColors={binColors} />
        </div>
      </div>

      <ReplayBar available={replayAvailable} active={replayActive} />
    </div>
  );
});
