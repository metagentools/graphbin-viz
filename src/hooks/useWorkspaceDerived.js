/**
 * The accessors every linked view shares.
 *
 * Deriving these once means the graph, the scatter, the flow diagram and the
 * hit-testing cannot drift apart about which contigs are visible or what
 * colour they are — and it keeps the per-mark work in the drawing loops down
 * to a closure call.
 */

import { useMemo } from "react";

import { UNBINNED_COLOR } from "../constants/graph.js";
import { createBinAccessor, getResults } from "../lib/model.js";
import { createColorForNode, createSizeFactor } from "../lib/palette.js";
import { createVisibilityTest } from "../lib/visibility.js";
import { isReplayActive, replayApplies, useView } from "../state/viewStore.jsx";
import { useModel } from "../state/modelStore.jsx";

export function useWorkspaceDerived() {
  const { model, binColors, extents, spatial } = useModel();
  const { state } = useView();

  const replayActive = isReplayActive(state);
  const replayAvailable = replayApplies(state);

  const binOf = useMemo(() => {
    if (!model) return () => null;
    return createBinAccessor({
      model,
      replay: { active: replayActive, iter: state.replay.iter },
      overrides: state.overrides,
    });
  }, [model, replayActive, state.replay.iter, state.overrides]);

  const filters = useMemo(
    () => ({ ...state.filters, mode: state.mode, binOnly: state.binOnly }),
    [state.filters, state.mode, state.binOnly]
  );

  const isVisible = useMemo(() => {
    if (!model) return () => false;
    return createVisibilityTest({ model, filters, binOf });
  }, [model, filters, binOf]);

  const colorOf = useMemo(
    () =>
      createColorForNode({
        colorMode: state.colorMode,
        mode: state.mode,
        binOf,
        binColors,
        extents,
        unbinnedColor: model?.unbinned_color || UNBINNED_COLOR,
      }),
    [state.colorMode, state.mode, binOf, binColors, extents, model]
  );

  const sizeOf = useMemo(
    () => (model ? createSizeFactor({ sizeMode: state.sizeMode, extents, model }) : () => 1),
    [state.sizeMode, extents, model]
  );

  const results = useMemo(() => (model ? getResults(model) : []), [model]);

  return {
    model,
    spatial,
    binColors,
    extents,
    results,
    binOf,
    isVisible,
    colorOf,
    sizeOf,
    replayActive,
    replayAvailable,
    unbinnedColor: model?.unbinned_color || UNBINNED_COLOR,
  };
}
