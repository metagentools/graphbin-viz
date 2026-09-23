/**
 * Which saved session is on screen, and keeping it that way.
 *
 * Every finished run gets a name and a uuid and is written to IndexedDB
 * (`lib/sessionsDb.js`) as a view-only snapshot -- the result, the plots,
 * the log and the encodings the analyst had picked, but not the input
 * files or the live Pyodide filesystem a re-run needs (see
 * `lib/sessionSnapshot.js`). A re-run with locked assignments updates that
 * same session in place instead of minting a new one: it is a continuation
 * of the same working session, not a new job.
 *
 * The execution id lives in the URL (`?execution=<uuid>`) so the page can
 * be reloaded, bookmarked, or opened in a second window onto the same
 * session; `?maximize=scatter|flow` does the same for whichever lower view
 * has taken over the viewport. Both are read once on mount and kept in
 * sync with `history.replaceState` from then on.
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

import { defaultSessionName } from "../lib/sessionName.js";
import {
  buildSessionSnapshot,
  hydrateSessionPlots,
  pickViewSnapshot,
} from "../lib/sessionSnapshot.js";
import { getSession, patchSession, putSession } from "../lib/sessionsDb.js";
import { generateId } from "../lib/uuid.js";
import { getQueryParam, setQueryParam } from "../lib/url.js";
import { useModel } from "./modelStore.jsx";
import { useRun } from "./runStore.jsx";
import { useSettings } from "./settingsStore.jsx";
import { useView } from "./viewStore.jsx";

const ExecutionContext = createContext(null);

export function ExecutionProvider({ children }) {
  const { model, loadModel, setRunContext } = useModel();
  const { plots, setPlots, logText, loadLog, statusText, statusController } = useRun();
  const { settings, files, setSetting } = useSettings();
  const { state, dispatch } = useView();

  const [executionId, setExecutionId] = useState(null);
  const [executionName, setExecutionName] = useState("");
  const [restored, setRestored] = useState(false);
  // Whether this tab was itself opened via "open in a new window" --
  // read once from "?popout=1" below and never written back, so it holds
  // for the tab's whole lifetime and the open-in-new-window buttons stay
  // hidden here, preventing an endless chain of new tabs.
  const [isPopout, setIsPopout] = useState(false);
  // { kind: "new" | "update", isExample? } -- set by useGraphBinRun once a
  // run has finished; consumed by the effect below once `model` catches up.
  const [pendingSave, setPendingSave] = useState(null);

  const didInitUrl = useRef(false);

  const applySession = useCallback(
    (session) => {
      if (!session) return;
      setPlots(hydrateSessionPlots(session));
      loadLog(session.logText);
      statusController.set(session.statusText || "");
      // No live Pyodide filesystem survived the reload, so there is nothing
      // for a locked re-run to act on until a fresh run supplies one.
      setRunContext(null);
      const prepared = loadModel(session.model);
      dispatch({ type: "model/loaded", model: prepared });
      dispatch({ type: "view/restore", patch: session.view || {} });
      for (const [key, value] of Object.entries(session.settings || {})) {
        setSetting(key, value);
      }
      setExecutionId(session.id);
      setExecutionName(session.name || "");
      setRestored(true);
      setQueryParam("execution", session.id);
    },
    [setPlots, loadLog, statusController, setRunContext, loadModel, dispatch, setSetting]
  );

  const openSessionById = useCallback(
    async (id) => {
      try {
        const session = await getSession(id);
        if (session) applySession(session);
        else console.warn(`No saved session found for execution id "${id}".`);
        return session;
      } catch (e) {
        console.warn("Could not open saved session:", e);
        return null;
      }
    },
    [applySession]
  );

  /** Called by useGraphBinRun once a fresh run has a model on screen. */
  const requestSaveNew = useCallback((isExample) => {
    setPendingSave({ kind: "new", isExample: !!isExample });
  }, []);

  /** Called after a locked re-run: the same working session, updated. */
  const requestSaveUpdate = useCallback(() => {
    setPendingSave({ kind: "update" });
  }, []);

  // Fires once the model a save was requested for has actually landed in
  // state. Reading `state`/`model` back synchronously right after the
  // dispatches that produced them would only see the previous render's
  // values, since React defers the update -- waiting for the effect
  // sidesteps that.
  useEffect(() => {
    if (!pendingSave || !model) return;
    let cancelled = false;

    (async () => {
      try {
        if (pendingSave.kind === "update" && executionId) {
          await patchSession(executionId, {
            model,
            plots: {
              initial: plots.initial
                ? { ext: plots.initial.ext, blob: plots.initial.blob }
                : null,
              final: plots.final ? { ext: plots.final.ext, blob: plots.final.blob } : null,
            },
            logText,
            statusText,
            view: pickViewSnapshot(state),
          });
          if (!cancelled) setQueryParam("execution", executionId);
        } else {
          const id = generateId();
          const name = defaultSessionName({
            isExample: pendingSave.isExample,
            assembler: settings.assembler,
            files,
          });
          const snapshot = buildSessionSnapshot({
            id,
            name,
            isExample: pendingSave.isExample,
            settings,
            files,
            model,
            plots,
            logText,
            statusText,
            view: pickViewSnapshot(state),
          });
          await putSession(snapshot);
          if (!cancelled) {
            setExecutionId(id);
            setExecutionName(name);
            setRestored(false);
            setQueryParam("execution", id);
          }
        }
      } catch (e) {
        console.warn("Could not save session:", e);
      } finally {
        if (!cancelled) setPendingSave(null);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately narrow: this should only re-run when a save is requested
    // and once the model it describes has landed, not on every keystroke of
    // plots/logText/state/settings/files -- those are read fresh from the
    // closure at that point regardless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSave, model]);

  // Read `?execution=` and `?maximize=` once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const execId = getQueryParam("execution");
      const maximizeParam = getQueryParam("maximize");
      if (getQueryParam("popout") === "1") setIsPopout(true);
      if (execId) {
        const session = await getSession(execId).catch((e) => {
          console.warn("Could not load saved session:", e);
          return null;
        });
        if (!cancelled) {
          if (session) applySession(session);
          else console.warn(`No saved session found for execution id "${execId}".`);
        }
      }
      if (!cancelled && (maximizeParam === "scatter" || maximizeParam === "flow")) {
        dispatch({ type: "chrome/maximize", value: maximizeParam });
      }
      didInitUrl.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: this is the one read of the URL the app does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep `?maximize=` in sync once the initial URL has been consumed, so
  // this does not wipe it out before that first read happens.
  useEffect(() => {
    if (!didInitUrl.current) return;
    setQueryParam("maximize", state.maximizedView || null);
  }, [state.maximizedView]);

  const value = useMemo(
    () => ({
      executionId,
      executionName,
      isRestored: restored,
      isPopout,
      requestSaveNew,
      requestSaveUpdate,
      openSessionById,
    }),
    [
      executionId,
      executionName,
      restored,
      isPopout,
      requestSaveNew,
      requestSaveUpdate,
      openSessionById,
    ]
  );

  return <ExecutionContext.Provider value={value}>{children}</ExecutionContext.Provider>;
}

export function useExecution() {
  const ctx = useContext(ExecutionContext);
  if (!ctx) throw new Error("useExecution must be used inside <ExecutionProvider>");
  return ctx;
}
