/**
 * Plotly, assembled locally rather than fetched from a CDN — same reasoning
 * as the bundled d3 submodules in `d3.js`: the tool's premise is that data
 * never leaves the machine, so nothing the workspace draws should depend on
 * a script arriving from the network at load time (see the d3-CDN CI
 * failure in the tier-1 notes).
 *
 * `plotly.js-basic-dist-min` is the smallest partial bundle that still has
 * everything the feature scatter needs — SVG `scatter` markers, box/lasso
 * select, zoom and pan — without the gl2d, geo or 3d trace families the
 * workspace never uses.
 */
import Plotly from "plotly.js-basic-dist-min";
import createPlotComponent from "react-plotly.js/factory";

export const Plot = createPlotComponent(Plotly);
