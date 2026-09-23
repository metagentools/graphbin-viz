/**
 * The assembly graph, drawn to a 2D canvas.
 *
 * One pure-ish function: everything it needs arrives in `options`, and the
 * only thing it touches is the context it was handed. The React component
 * decides *when* to call it; this decides what a frame looks like.
 */

import { BRAND_BLUE, BRAND_RED, NODE_RADIUS_DELTA } from "../constants/graph.js";
import { screenToWorld } from "./viewport.js";

export function drawGraph(ctx, options) {
  const {
    model,
    transform,
    width,
    height,
    dpr = 1,
    isVisible,
    colorOf,
    sizeOf,
    binOf,
    mode,
    colorMode,
    markers,
    baseRadius,
    selection,
    overrides,
    hoverNodeId,
    lockedNodeId,
    replayActive,
  } = options;

  const t = transform || { x: 0, y: 0, k: 1 };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width * dpr, height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.transform(t.k, 0, 0, t.k, t.x, t.y);

  const visibleNodes = model.nodes.filter(isVisible);
  const visibleIds = new Set(visibleNodes.map((n) => n.id));

  const hoverId = hoverNodeId && visibleIds.has(hoverNodeId) ? hoverNodeId : null;
  const lockedId = lockedNodeId && visibleIds.has(lockedNodeId) ? lockedNodeId : null;

  const activeNodeId = lockedId || hoverId || null;
  const activeAdj = activeNodeId
    ? new Set([activeNodeId, ...(model.adj.get(activeNodeId) || [])])
    : null;

  // View bounds in world coords, for culling
  const pad = 80;
  const minW = screenToWorld(t, -pad, -pad);
  const maxW = screenToWorld(t, width + pad, height + pad);
  const inBounds = (n) => n.x >= minW.x && n.x <= maxW.x && n.y >= minW.y && n.y <= maxW.y;

  drawEdges();
  drawNodes();

  function drawEdges() {
    ctx.lineWidth = 1 / t.k;
    ctx.strokeStyle = "#111827";

    for (const [u, v] of model.edges) {
      if (!visibleIds.has(u) || !visibleIds.has(v)) continue;

      const nu = model.nodesById.get(u);
      const nv = model.nodesById.get(v);

      const minX = Math.min(nu.x, nv.x);
      const maxX = Math.max(nu.x, nv.x);
      const minY = Math.min(nu.y, nv.y);
      const maxY = Math.max(nu.y, nv.y);
      if (maxX < minW.x || minX > maxW.x || maxY < minW.y || minY > maxW.y) continue;

      if (!activeNodeId) ctx.globalAlpha = 0.25;
      else ctx.globalAlpha = u === activeNodeId || v === activeNodeId ? 0.85 : 0.05;

      ctx.beginPath();
      ctx.moveTo(nu.x, nu.y);
      ctx.lineTo(nv.x, nv.y);
      ctx.stroke();
    }
  }

  function drawNodes() {
    ctx.globalAlpha = 1.0;
    const hasSelection = selection.size > 0;

    // During playback the graph shows an intermediate state of propagation, so
    // the markers that describe the *finished* result — what changed, how
    // confident the final assignment was, what GraphBin flagged — would be
    // describing something that has not happened yet. Draw labels only.
    const showResultMarkers = !replayActive;

    for (const n of visibleNodes) {
      if (!inBounds(n)) continue;

      const isHover = n.id === hoverId;
      const isLocked = n.id === lockedId;
      const isSelected = hasSelection && selection.has(n.id);
      const isOverridden = overrides.has(n.id);

      let r = baseRadius * sizeOf(n);
      if (isHover) r += NODE_RADIUS_DELTA.hover;
      if (isLocked) r += NODE_RADIUS_DELTA.locked;
      r = r / t.k;

      if (activeAdj && !activeAdj.has(n.id)) ctx.globalAlpha = 0.25;
      else if (hasSelection && !isSelected) ctx.globalAlpha = 0.15;
      else ctx.globalAlpha = 1.0;

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = colorOf(n);
      ctx.fill();

      const bin = binOf(n, mode);
      if (!bin && colorMode === "bin") {
        ctx.lineWidth = 1 / t.k;
        ctx.strokeStyle = "#9ca3af";
        ctx.stroke();
      }

      if (showResultMarkers && markers.markChanged && n.changed) {
        ctx.lineWidth = 2 / t.k;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        ctx.lineWidth = 2.5 / t.k;
        ctx.strokeStyle = BRAND_BLUE;
        ctx.stroke();
      }

      if (showResultMarkers && isOverridden) {
        ring(n, r + 3 / t.k, { width: 2, dash: [3, 2], color: BRAND_BLUE });
      }

      if (isSelected) {
        ring(n, r + 2 / t.k, { width: 1.5, color: "#0f172a" });
      }

      if (isLocked) {
        ctx.lineWidth = 3 / t.k;
        ctx.strokeStyle = BRAND_BLUE;
        ctx.stroke();
      } else if (isHover) {
        ctx.lineWidth = 2 / t.k;
        ctx.strokeStyle = "#111827";
        ctx.stroke();
      }

      if (showResultMarkers && markers.markMisbinned && n.misbinned) {
        ring(n, r + 2 / t.k, { width: 3, dash: [2, 2], color: BRAND_RED });
      }

      if (showResultMarkers && markers.markAmbiguous && n.ambiguous_multi) {
        ring(n, r + 5 / t.k, { width: 2, dash: [1, 3], color: "#334155" });
      }
    }
  }

  /** A stroked circle around a node, in screen-constant line widths. */
  function ring(n, radius, { width: lineWidth, dash, color }) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
    ctx.lineWidth = lineWidth / t.k;
    if (dash) ctx.setLineDash(dash.map((d) => d / t.k));
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }
}
