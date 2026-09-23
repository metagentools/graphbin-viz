import React, { useEffect } from "react";
import { Button } from "@fluentui/react-button";
import { Select } from "@fluentui/react-select";
import { Slider } from "@fluentui/react-slider";

import { REPLAY_SPEEDS } from "../../constants/encodings.js";
import { resultName } from "../../lib/model.js";
import { useModel } from "../../state/modelStore.jsx";
import { useView } from "../../state/viewStore.jsx";

/**
 * Step through how labels spread outwards from the seeds.
 *
 * Replay only means anything for the refined result: propagation is what
 * produced it, and the other results were never built that way. Anywhere else
 * the transport is disabled rather than left to look available.
 */
export function ReplayBar({ available, active }) {
  const { model } = useModel();
  const { state, dispatch } = useView();
  const { iter, max, playing, intervalMs } = state.replay;

  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => dispatch({ type: "replay/step" }), intervalMs);
    return () => clearInterval(timer);
  }, [playing, intervalMs, dispatch]);

  // leaving the refined result mid-playback should not leave a timer running
  useEffect(() => {
    if (!available && playing) dispatch({ type: "replay/pause" });
  }, [available, playing, dispatch]);

  const value = max === 0 ? "off" : active ? `iter ${iter}` : "final";

  let hint;
  if (!available) {
    hint =
      model && max > 0
        ? `Available on the ${resultName(model, state.refinedKey)} result, which propagation produced.`
        : "Step through how labels spread outwards from the seeds.";
  } else {
    hint = active
      ? "Showing labels as they spread; result markers are hidden until the end."
      : "Step through how labels spread outwards from the seeds.";
  }

  return (
    <div
      className={`replay-bar${available ? "" : " is-disabled"}`}
      aria-disabled={String(!available)}
    >
      <span className="replay-label">Propagation replay</span>
      <Button
        id="replay-play"
        type="button"
        size="small"
        disabled={!available}
        onClick={() => dispatch({ type: playing ? "replay/pause" : "replay/play" })}
      >
        {playing ? "Pause" : "Play"}
      </Button>
      <Slider
        id="replay-slider"
        className="replay-slider"
        size="small"
        min={0}
        max={max}
        step={1}
        value={iter}
        disabled={!available || max === 0}
        onChange={(_, data) => {
          dispatch({ type: "replay/pause" });
          dispatch({ type: "replay/iter", value: data.value });
        }}
      />
      <span id="replay-value" className="range-value">
        {value}
      </span>
      <label className="replay-speed" htmlFor="replay-speed">
        <span>Speed</span>
        <Select
          id="replay-speed"
          size="small"
          value={String(intervalMs)}
          disabled={!available}
          onChange={(e) => dispatch({ type: "replay/speed", value: Number(e.target.value) })}
        >
          {REPLAY_SPEEDS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </label>
      <span id="replay-hint" className="replay-hint">
        {hint}
      </span>
    </div>
  );
}
