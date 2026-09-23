/**
 * Workspace view state.
 *
 * One reducer holds everything the linked views read: which result is drawn,
 * the encoding channels, the filter and marker chips, the shared selection,
 * the analyst's locked assignments, and the propagation replay. Brushing the
 * scatter, clicking a flow and clicking a contig all dispatch into the same
 * `selection`, which is what makes the views linked rather than merely
 * adjacent.
 */

import React, { createContext, useContext, useMemo, useReducer } from "react";

import { NODE_RADIUS } from "../constants/graph.js";
import { getResults, graphbinResultKey } from "../lib/model.js";

/** The label "select all the contested contigs" puts on the selection. */
export const DISPUTED_LABEL = "tools disagree";

const initialState = {
  // which binning result the graph and the encodings speak about
  mode: "r0",
  refinedKey: "r1",
  colorMode: "bin",
  sizeMode: "uniform",
  binOnly: "",
  nodeSize: NODE_RADIUS.base,

  filters: {
    onlyDisputed: false,
    onlyLowConfidence: false,
    hideUnbinned: false,
    hideIsolated: false,
  },
  // Markers are opt-in: a graph that arrives pre-annotated hides its own
  // structure behind rings nobody asked for.
  markers: {
    markChanged: false,
    markMisbinned: false,
    markAmbiguous: false,
  },

  selection: new Set(),
  selectionLabel: "",
  lockedNodeId: null,
  overrides: new Map(),

  replay: { iter: 0, max: 0, playing: false, intervalMs: 600 },

  sankey: { onlyChanged: false, hideUnbinned: false, locked: null },
  scatter: { x: "gc", y: "cov" },

  bottomHidden: false,
  legendCollapsed: false,
  maximizedView: null,
};

/** Replay only means anything for the result propagation produced. */
export function replayApplies(state) {
  return state.replay.max > 0 && state.mode === state.refinedKey;
}

/** Is the graph currently showing an intermediate propagation state? */
export function isReplayActive(state) {
  return replayApplies(state) && state.replay.iter < state.replay.max;
}

function clearedSelection(state) {
  return {
    ...state,
    selection: new Set(),
    selectionLabel: "",
    sankey: { ...state.sankey, locked: null },
  };
}

function reducer(state, action) {
  switch (action.type) {
    /* ------------------------------ a run ----------------------------- */

    case "run/start":
      // Everything derived from the previous model goes; the chips, the
      // encodings and the sliders all return to their defaults, because they
      // described a result that is no longer on screen.
      return {
        ...initialState,
        replay: { ...initialState.replay, intervalMs: state.replay.intervalMs },
        scatter: state.scatter,
        bottomHidden: state.bottomHidden,
        legendCollapsed: state.legendCollapsed,
      };

    case "model/loaded": {
      const { model } = action;
      const results = getResults(model);
      const refinedKey = graphbinResultKey(model);
      const mode = results.some((r) => r.key === state.mode) ? state.mode : results[0].key;
      const max = Number(model.maxIteration || 0);
      return {
        ...state,
        mode,
        refinedKey,
        binOnly: "",
        overrides: new Map(),
        replay: { ...state.replay, iter: max, max, playing: false },
      };
    }

    /* ------------------------- session restore ------------------------ */

    // Applied right after "model/loaded" when opening a saved session: the
    // encodings and filters the analyst had picked, layered onto the fresh
    // baseline that action just set up. Selection, locks and replay position
    // describe an in-progress analysis rather than the result itself, so
    // they are not part of what gets restored.
    case "view/restore": {
      const patch = action.patch || {};
      return {
        ...state,
        ...patch,
        filters: { ...state.filters, ...(patch.filters || {}) },
        markers: { ...state.markers, ...(patch.markers || {}) },
        sankey: { ...state.sankey, ...(patch.sankey || {}) },
        scatter: { ...state.scatter, ...(patch.scatter || {}) },
        selection: new Set(),
        selectionLabel: "",
        overrides: new Map(),
        lockedNodeId: null,
      };
    }

    /* --------------------------- encodings ---------------------------- */

    case "view/mode": {
      const mode = action.value;
      const applies = state.replay.max > 0 && mode === state.refinedKey;
      return {
        ...state,
        mode,
        // leaving the refined result puts the finished binning back on screen
        replay: applies
          ? state.replay
          : { ...state.replay, iter: state.replay.max, playing: false },
      };
    }

    case "view/colorMode":
      return { ...state, colorMode: action.value };

    case "view/sizeMode":
      return { ...state, sizeMode: action.value };

    case "view/binOnly":
      return { ...state, binOnly: action.value };

    case "view/nodeSize":
      return { ...state, nodeSize: action.value };

    case "view/filter":
      return { ...state, filters: { ...state.filters, [action.key]: action.value } };

    case "view/marker":
      return { ...state, markers: { ...state.markers, [action.key]: action.value } };

    /* --------------------------- selection ---------------------------- */

    case "selection/set":
      return {
        ...state,
        selection: new Set(action.ids || []),
        selectionLabel: action.label || "",
      };

    case "selection/toggleNode": {
      const next = new Set(state.selection);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { ...state, selection: next, selectionLabel: "picked contigs" };
    }

    case "selection/clear":
      return clearedSelection(state);

    case "inspector/lockNode":
      return { ...state, lockedNodeId: action.id };

    /* ---------------------------- curation ---------------------------- */

    case "overrides/apply": {
      const next = new Map(state.overrides);
      for (const id of action.ids) {
        if (action.bin == null) next.delete(id);
        else next.set(id, action.bin);
      }
      return { ...state, overrides: next };
    }

    case "overrides/clear":
      return { ...state, overrides: new Map() };

    /* ----------------------------- replay ----------------------------- */

    case "replay/iter": {
      const max = state.replay.max;
      const iter = Math.max(0, Math.min(max, Number(action.value) || 0));
      return { ...state, replay: { ...state.replay, iter } };
    }

    case "replay/step": {
      const { iter, max } = state.replay;
      if (iter >= max) return { ...state, replay: { ...state.replay, playing: false } };
      return { ...state, replay: { ...state.replay, iter: iter + 1 } };
    }

    case "replay/play": {
      if (!replayApplies(state)) return state;
      // restarting from the end rewinds, so "play" always plays something
      const iter = state.replay.iter >= state.replay.max ? 0 : state.replay.iter;
      return { ...state, replay: { ...state.replay, playing: true, iter } };
    }

    case "replay/pause":
      return { ...state, replay: { ...state.replay, playing: false } };

    case "replay/speed":
      return { ...state, replay: { ...state.replay, intervalMs: action.value } };

    /* ------------------------------ views ----------------------------- */

    case "sankey/set":
      return { ...state, sankey: { ...state.sankey, ...action.patch } };

    case "scatter/set":
      return { ...state, scatter: { ...state.scatter, ...action.patch } };

    case "chrome/toggleBottom":
      return { ...state, bottomHidden: !state.bottomHidden };

    case "chrome/toggleLegend":
      return { ...state, legendCollapsed: !state.legendCollapsed };

    case "chrome/maximize":
      return { ...state, maximizedView: action.value };

    default:
      return state;
  }
}

const ViewContext = createContext(null);

export function ViewProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

export function useView() {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error("useView must be used inside <ViewProvider>");
  return ctx;
}
