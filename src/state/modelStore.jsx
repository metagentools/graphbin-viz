/**
 * The loaded comparison model and the two lookups derived from it.
 *
 * Bin colours and feature extents are computed once per model rather than per
 * frame: they are pure functions of the data, and every view needs them.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

import { prepareModel } from "../lib/model.js";
import { buildBinColorMap, computeFeatureExtents } from "../lib/palette.js";
import { buildSpatialIndex } from "../lib/spatial.js";

const ModelContext = createContext(null);

const EMPTY = { model: null, binColors: new Map(), extents: null, spatial: null };

export function ModelProvider({ children }) {
  const [state, setState] = useState(EMPTY);
  const [runContext, setRunContext] = useState(null);

  /** Take a freshly parsed export and derive everything the views read. */
  const loadModel = useCallback((raw) => {
    if (!raw) {
      setState(EMPTY);
      return null;
    }
    const model = prepareModel(raw);
    setState({
      model,
      binColors: buildBinColorMap(model),
      extents: computeFeatureExtents(model),
      spatial: buildSpatialIndex(model),
    });
    return model;
  }, []);

  const clearModel = useCallback(() => setState(EMPTY), []);

  const value = useMemo(
    () => ({ ...state, loadModel, clearModel, runContext, setRunContext }),
    [state, loadModel, clearModel, runContext]
  );

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}

export function useModel() {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error("useModel must be used inside <ModelProvider>");
  return ctx;
}
