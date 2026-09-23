import React, { useMemo } from "react";
import { Label } from "@fluentui/react-label";
import { Select } from "@fluentui/react-select";
import { Slider } from "@fluentui/react-slider";

import { COLOR_MODES, NODE_SIZE_RANGE, SIZE_MODES } from "../../constants/encodings.js";
import { allBins } from "../../lib/model.js";
import { useModel } from "../../state/modelStore.jsx";
import { useView } from "../../state/viewStore.jsx";
import { FilterChips } from "./FilterChips.jsx";

/** A labelled select in the toolbar's first row. */
function ToolbarSelect({ id, label, value, onChange, children }) {
  return (
    <div className="tb-field">
      <Label htmlFor={id} size="small">
        {label}
      </Label>
      <Select id={id} size="small" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </Select>
    </div>
  );
}

export function WorkspaceToolbar({ results }) {
  const { model } = useModel();
  const { state, dispatch } = useView();

  const bins = useMemo(() => allBins(model), [model]);
  const nodeSizeLabel =
    state.nodeSize % 1 === 0 ? String(state.nodeSize) : state.nodeSize.toFixed(1);

  return (
    <div className="ws-toolbar">
      <div className="tb-row">
        <ToolbarSelect
          id="view-mode"
          label="Result"
          value={state.mode}
          onChange={(value) => dispatch({ type: "view/mode", value })}
        >
          {results.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </ToolbarSelect>

        <ToolbarSelect
          id="color-mode"
          label="Colour by"
          value={state.colorMode}
          onChange={(value) => dispatch({ type: "view/colorMode", value })}
        >
          {COLOR_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </ToolbarSelect>

        <ToolbarSelect
          id="size-mode"
          label="Size by"
          value={state.sizeMode}
          onChange={(value) => dispatch({ type: "view/sizeMode", value })}
        >
          {SIZE_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </ToolbarSelect>

        <ToolbarSelect
          id="bin-filter"
          label="Show only bin"
          value={state.binOnly}
          onChange={(value) => dispatch({ type: "view/binOnly", value })}
        >
          <option value="">(all bins)</option>
          {bins.map((bin) => (
            <option key={bin} value={bin}>
              {bin}
            </option>
          ))}
        </ToolbarSelect>

        <div className="tb-field tb-field-range">
          <Label htmlFor="node-size" size="small">
            Node size
          </Label>
          <div className="range-row">
            <Slider
              id="node-size"
              size="small"
              min={NODE_SIZE_RANGE.min}
              max={NODE_SIZE_RANGE.max}
              step={NODE_SIZE_RANGE.step}
              value={state.nodeSize}
              onChange={(_, data) => dispatch({ type: "view/nodeSize", value: data.value })}
            />
            <span id="node-size-value" className="range-value">
              {nodeSizeLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="tb-row tb-row-chips" role="group" aria-label="Filters">
        <FilterChips />
      </div>
    </div>
  );
}
