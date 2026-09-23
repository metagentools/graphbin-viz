/**
 * Hit testing.
 *
 * A grid hash in world coordinates, so picking a contig under the cursor
 * looks at the nine cells around it rather than every node in the assembly.
 */

import { SPATIAL_CELL } from "../constants/graph.js";

export function buildSpatialIndex(model, cell = SPATIAL_CELL) {
  const map = new Map();
  if (!model) return { cell, map };

  for (const n of model.nodes) {
    const key = Math.floor(n.x / cell) + "," + Math.floor(n.y / cell);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(n.id);
  }
  return { cell, map };
}

export function pickNode({ index, model, world, radiusWorld, isVisible }) {
  if (!model || !index) return null;

  const { cell, map } = index;
  const cx = Math.floor(world.x / cell);
  const cy = Math.floor(world.y / cell);

  let best = null;
  let bestD2 = Infinity;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const list = map.get(cx + dx + "," + (cy + dy));
      if (!list) continue;

      for (const id of list) {
        const n = model.nodesById.get(id);
        if (!n || !isVisible(n)) continue;

        const ddx = n.x - world.x;
        const ddy = n.y - world.y;
        const d2 = ddx * ddx + ddy * ddy;

        if (d2 < bestD2 && d2 <= radiusWorld * radiusWorld) {
          bestD2 = d2;
          best = id;
        }
      }
    }
  }
  return best;
}
