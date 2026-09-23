/**
 * Everything about a run in flight: the log, GraphBin's own output, the static
 * plots it produced, and whether one is running at all.
 *
 * The run log is plain text rather than a list of nodes because the e2e suite
 * and the benchmark harness read it as text, and because GraphBin's own log
 * arrives as pre-formatted lines.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const EMPTY_LOG = "(logs will appear here)\n\n";
const EMPTY_STATUS = "(GraphBin logs will appear here)";
const MAX_STATUS_LINES = 2000;

const RunContext = createContext(null);

export function RunProvider({ children }) {
  const [running, setRunning] = useState(false);
  const [logText, setLogText] = useState(EMPTY_LOG);
  const [statusText, setStatusText] = useState(EMPTY_STATUS);
  const [plots, setPlots] = useState({ initial: null, final: null });

  // GraphBin may stream thousands of lines; keeping the buffer in a ref means
  // the trim is O(1) per line rather than a string concatenation each time.
  const statusBuffer = useRef([]);
  const statusHasLog = useRef(false);

  const log = useCallback((msg) => {
    setLogText((prev) => prev + msg + "\n");
  }, []);

  const resetLog = useCallback(() => setLogText(""), []);

  // Restoring a saved session replaces the whole log in one go, unlike
  // `log`, which appends a line to a run in progress.
  const loadLog = useCallback((text) => setLogText(text || EMPTY_LOG), []);

  const setStatus = useCallback((msg) => {
    statusBuffer.current = [];
    setStatusText(String(msg ?? ""));
  }, []);

  const resetStatus = useCallback((msg = EMPTY_STATUS) => {
    statusBuffer.current = [];
    statusHasLog.current = false;
    setStatusText(msg);
  }, []);

  const appendStatus = useCallback((msg) => {
    const lines = String(msg ?? "").split("\n");
    statusBuffer.current.push(...lines);
    if (statusBuffer.current.length > MAX_STATUS_LINES) {
      statusBuffer.current = statusBuffer.current.slice(-MAX_STATUS_LINES);
    }
    statusHasLog.current = true;
    setStatusText(statusBuffer.current.join("\n"));
  }, []);

  // GraphBin's Python code logs through this global.
  useEffect(() => {
    window.graphbinLog = appendStatus;
    return () => {
      if (window.graphbinLog === appendStatus) delete window.graphbinLog;
    };
  }, [appendStatus]);

  const statusController = useMemo(
    () => ({
      set: setStatus,
      reset: resetStatus,
      append: appendStatus,
      hasLog: () => statusHasLog.current,
    }),
    [setStatus, resetStatus, appendStatus]
  );

  const value = useMemo(
    () => ({
      running,
      setRunning,
      logText,
      log,
      resetLog,
      loadLog,
      statusText,
      statusController,
      plots,
      setPlots,
    }),
    [running, logText, log, resetLog, loadLog, statusText, statusController, plots]
  );

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export function useRun() {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error("useRun must be used inside <RunProvider>");
  return ctx;
}
