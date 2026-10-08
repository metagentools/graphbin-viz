/**
 * Rendering the propagation replay to a GIF, frame by frame.
 *
 * Deliberately bypasses the view state and the on-screen canvas: for each
 * iteration it rebuilds the bin/colour/visibility accessors the same way
 * `useWorkspaceDerived` builds them for whichever iteration is *currently*
 * shown, and draws them to an off-screen canvas. Nothing is dispatched, so
 * playback, selection and the on-screen canvas are untouched while a GIF is
 * being built, and the export can run even while the user keeps interacting.
 */

import { GIFEncoder, quantize, applyPalette } from "gifenc";

import { drawGraph } from "./drawGraph.js";
import { createBinAccessor } from "./model.js";
import { createColorForNode, createSizeFactor } from "./palette.js";
import { createVisibilityTest } from "./visibility.js";
import { downloadBlob } from "./download.js";

// GIF delay is coarse (1/100s ticks) and most viewers floor anything much
// lower anyway, so the replay speed is clamped to something a GIF can show.
const MIN_FRAME_DELAY_MS = 40;
// Hold the fully-propagated frame for a beat so a looping GIF reads as
// "done" before it starts over, rather than cutting straight back to seeds.
const HOLD_LAST_FRAME_MS = 1200;

/**
 * @returns {Promise<Blob|null>} the encoded GIF, or null if there was
 * nothing to export (no model, or no propagation steps).
 */
export async function exportReplayGif({
  model,
  transform,
  width,
  height,
  dpr = 1,
  binColors,
  extents,
  unbinnedColor,
  state,
  filename = "graphbin-label-propagation.gif",
  onProgress,
} = {}) {
  const max = state?.replay?.max ?? 0;
  if (!model || max <= 0 || !width || !height) return null;

  const pxWidth = Math.max(1, Math.floor(width * dpr));
  const pxHeight = Math.max(1, Math.floor(height * dpr));
  const canvas = document.createElement("canvas");
  canvas.width = pxWidth;
  canvas.height = pxHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const filters = { ...state.filters, mode: state.mode, binOnly: state.binOnly };
  const delay = Math.max(MIN_FRAME_DELAY_MS, state.replay.intervalMs);
  const total = max + 1;
  const gif = GIFEncoder();

  for (let iter = 0; iter <= max; iter++) {
    const binOf = createBinAccessor({
      model,
      replay: { active: true, iter },
      overrides: state.overrides,
    });
    const isVisible = createVisibilityTest({ model, filters, binOf });
    const colorOf = createColorForNode({
      colorMode: state.colorMode,
      mode: state.mode,
      binOf,
      binColors,
      extents,
      unbinnedColor,
    });
    const sizeOf = createSizeFactor({ sizeMode: state.sizeMode, extents, model });

    drawGraph(ctx, {
      model,
      transform,
      width,
      height,
      dpr,
      isVisible,
      colorOf,
      sizeOf,
      binOf,
      mode: state.mode,
      colorMode: state.colorMode,
      markers: state.markers,
      baseRadius: state.nodeSize,
      selection: state.selection,
      overrides: state.overrides,
      hoverNodeId: null,
      lockedNodeId: null,
      replayActive: true,
    });

    const { data } = ctx.getImageData(0, 0, pxWidth, pxHeight);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    const isLast = iter === max;
    gif.writeFrame(index, pxWidth, pxHeight, {
      palette,
      delay: isLast ? Math.max(delay, HOLD_LAST_FRAME_MS) : delay,
    });

    onProgress?.(iter + 1, total);
    // Yield to the event loop between frames so the progress label can paint
    // and the tab stays responsive on larger graphs / longer replays.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  gif.finish();
  const blob = new Blob([gif.bytes()], { type: "image/gif" });
  downloadBlob(blob, filename);
  return blob;
}
