/**
 * Starting a run, and everything that has to happen around one.
 *
 * Both entry points — uploaded data and the bundled example — go through here,
 * so this is the one place that knows a run is in flight. A run that throws
 * still clears the flag, otherwise a failed run would shimmer forever.
 */

import { useCallback } from "react";

import { finishBenchmarkRun } from "../lib/benchmark.js";
import { lockedByContigName } from "../lib/curation.js";
import { normaliseSettings, rerunRefinement, runPipeline } from "../lib/pyodide/pipeline.js";
import { useModel } from "../state/modelStore.jsx";
import { useRun } from "../state/runStore.jsx";
import { useSettings } from "../state/settingsStore.jsx";
import { useView } from "../state/viewStore.jsx";

export function useGraphBinRun() {
  const { log, resetLog, statusController, setRunning, setPlots } = useRun();
  const { model, loadModel, clearModel, setRunContext, runContext } = useModel();
  const { dispatch, state } = useView();
  const { settings, files } = useSettings();

  /** Everything a run has to put back before it starts. */
  const resetForRun = useCallback(() => {
    resetLog();
    statusController.reset();
    setPlots({ initial: null, final: null });
    clearModel();
    dispatch({ type: "run/start" });
  }, [resetLog, statusController, setPlots, clearModel, dispatch]);

  const missingInputs = useCallback(() => {
    const needsPaths = settings.assembler === "spades";
    if (files.graph && files.contigs && files.initial && (!needsPaths || files.paths)) {
      return null;
    }
    return needsPaths
      ? "Please pick all input files (graph, contigs, paths, initial)."
      : "Please pick all input files (graph, contigs, initial).";
  }, [settings.assembler, files]);

  const start = useCallback(
    async (source) => {
      if (source === "upload") {
        const missing = missingInputs();
        if (missing) {
          resetLog();
          log(missing);
          return;
        }
      }

      resetForRun();
      setRunning(true);

      try {
        const result = await runPipeline({
          source,
          settings: normaliseSettings(settings),
          files,
          log,
          status: statusController,
        });

        setPlots(result.plots);
        setRunContext(result.runContext);

        if (result.model) {
          const prepared = loadModel(result.model);
          dispatch({ type: "model/loaded", model: prepared });
          log(
            `Interactive graph loaded (nodes=${prepared.nodes.length}, edges=${prepared.edges.length}).`
          );
        }

        finishBenchmarkRun(result.benchmark, {
          status: result.error ? "partial" : "success",
          error: result.benchmark.error,
        });
        log(result.isExample ? "Done (example data)!" : "Done!");
      } catch (err) {
        console.error(err);
        log((source === "example" ? "Error (example): " : "Error: ") + err);
      } finally {
        setRunning(false);
      }
    },
    [
      missingInputs,
      resetForRun,
      resetLog,
      setRunning,
      settings,
      files,
      log,
      statusController,
      setPlots,
      setRunContext,
      loadModel,
      dispatch,
    ]
  );

  /**
   * Re-run refinement with the locked assignments treated as fixed seeds, so
   * the consequences of a correction spread through the graph rather than
   * being a cosmetic relabelling of one contig.
   */
  const rerunWithLocks = useCallback(async () => {
    if (!model || !runContext) {
      log("Run a dataset first, then re-run refinement with locked assignments.");
      return;
    }
    if (state.overrides.size === 0) {
      log("Lock at least one assignment before re-running refinement.");
      return;
    }

    const lockedCount = state.overrides.size;
    log(`Re-running GraphBin with ${lockedCount} locked assignment(s)...`);

    try {
      const raw = await rerunRefinement({
        runContext,
        locked: lockedByContigName(model, state.overrides),
        log,
        status: statusController,
      });
      const prepared = loadModel(raw);
      // the locks are now baked into the result, so they no longer need to be
      // applied on top of it
      dispatch({ type: "model/loaded", model: prepared });
      log(`Refinement re-run complete with ${lockedCount} locked assignment(s) applied.`);
    } catch (err) {
      console.error(err);
      log("Re-run failed: " + String(err));
    }
  }, [model, runContext, state.overrides, log, statusController, loadModel, dispatch]);

  return { start, rerunWithLocks };
}
