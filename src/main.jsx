import React from "react";
import { createRoot } from "react-dom/client";

// d3 is bundled with the app rather than fetched from a CDN at runtime: the
// visualisation should not depend on a third-party host being reachable, and
// this app is meant to work on data that never leaves the machine running it.
//
// Only the pieces the drawing code actually uses are imported, which keeps the
// bundle to a fraction of the full d3 distribution. The versions match the ones
// d3 6.x ships, so behaviour is identical to the script tags this replaced.
import { extent } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { brush } from "d3-brush";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import { scaleLinear, scaleLog } from "d3-scale";
import {
  interpolateBlues,
  interpolateOranges,
  interpolatePurples,
} from "d3-scale-chromatic";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
// imported for its side effect: it is what gives selections `.transition()`
import "d3-transition";

import App from "./App.jsx";

// Fluent UI is CSS-in-JS (Griffel), so there is no component stylesheet to
// import here: FluentProvider injects what the rendered components need.
import "./style.css";

// The drawing code reads these off `window`, the way it did when d3 was a
// script tag. Anything added here must also be imported above.
window.d3 = {
  axisBottom,
  axisLeft,
  brush,
  extent,
  interpolateBlues,
  interpolateOranges,
  interpolatePurples,
  sankey,
  sankeyLinkHorizontal,
  scaleLinear,
  scaleLog,
  select,
  zoom,
  zoomIdentity,
};

const root = createRoot(document.getElementById("root"));
root.render(<App />);
