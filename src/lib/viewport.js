/** Zoom transform maths for the graph canvas. */

import { zoomIdentity } from "../d3.js";

export function screenToWorld(transform, x, y) {
  const t = transform || { x: 0, y: 0, k: 1 };
  return { x: (x - t.x) / t.k, y: (y - t.y) / t.k };
}

export function worldToScreen(transform, x, y) {
  const t = transform || { x: 0, y: 0, k: 1 };
  return { x: x * t.k + t.x, y: y * t.k + t.y };
}

/**
 * The transform that fits the whole graph into a canvas of this size.
 *
 * One axis is always the limiting one; the leftover space on the other axis
 * has to be split between both sides, otherwise the whole graph is pinned to
 * the top-left corner with all the slack pushed to the right or the bottom.
 */
export function fitTransform(model, { width, height, padding = 28 }) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of model.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }

  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const s = Math.min((width - padding * 2) / w, (height - padding * 2) / h);

  const tx = (width - w * s) / 2 - minX * s;
  const ty = (height - h * s) / 2 - minY * s;

  return zoomIdentity.translate(tx, ty).scale(s);
}

/** Centre the view on one contig without changing how far it is zoomed out. */
export function focusTransform(node, { width, height, currentScale }) {
  const k = Math.max(currentScale || 1, 2);
  return zoomIdentity.translate(width / 2 - k * node.x, height / 2 - k * node.y).scale(k);
}
