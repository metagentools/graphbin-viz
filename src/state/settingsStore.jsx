/**
 * The input form: which files were picked and how GraphBin should be run.
 *
 * The files live here as File objects rather than being read off the DOM at
 * run time, so the run button can tell whether it has what it needs without
 * querying the document.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

import { GRAPHBIN_DEFAULTS } from "../constants/graph.js";

const defaultSettings = {
  assembler: "spades",
  delimiter: ",",
  dpi: "300",
  width: "2000",
  height: "2000",
  vsize: "50",
  lsize: "2",
  imgtype: "png",
  maxIteration: String(GRAPHBIN_DEFAULTS.max_iteration),
  minBinSize: String(GRAPHBIN_DEFAULTS.min_bin_size),
  diffThreshold: String(GRAPHBIN_DEFAULTS.diff_threshold),
  showLpLog: "false",
};

const defaultFiles = { graph: null, contigs: null, paths: null, initial: null, extras: [] };

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [files, setFiles] = useState(defaultFiles);

  const setSetting = useCallback((key, value) => {
    setSettings((prev) => {
      if (key !== "assembler" || value === "spades") return { ...prev, [key]: value };
      return { ...prev, assembler: value };
    });
    // MEGAHIT has no paths file, so a previously chosen one is dropped rather
    // than silently carried into a run that ignores it.
    if (key === "assembler" && value !== "spades") {
      setFiles((prev) => ({ ...prev, paths: null }));
    }
  }, []);

  const setFile = useCallback((key, value) => {
    setFiles((prev) => ({ ...prev, [key]: value }));
  }, []);

  const value = useMemo(
    () => ({ settings, setSetting, files, setFile }),
    [settings, setSetting, files, setFile]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
