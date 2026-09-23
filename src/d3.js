/**
 * The d3 surface this app uses.
 *
 * d3 is bundled rather than fetched from a CDN: the visualisation should not
 * depend on a third-party host being reachable, and this app is meant to work
 * on data that never leaves the machine running it. Only the pieces the
 * drawing code actually uses are imported, which keeps the bundle to a
 * fraction of the full d3 distribution.
 *
 * Everything goes through this one module so there is a single place that
 * answers "which bits of d3 are we on the hook for?" — and so no module has to
 * reach for a global.
 */

// imported for its side effect: it is what gives selections `.transition()`
import "d3-transition";

export { extent } from "d3-array";
export { axisBottom, axisLeft } from "d3-axis";
export { brush } from "d3-brush";
export { sankey, sankeyLinkHorizontal } from "d3-sankey";
export { scaleLinear, scaleLog } from "d3-scale";
export {
  interpolateBlues,
  interpolateOranges,
  interpolatePurples,
} from "d3-scale-chromatic";
export { select } from "d3-selection";
export { zoom, zoomIdentity } from "d3-zoom";
