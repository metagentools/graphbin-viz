import React from "react";
import { ToggleButton } from "@fluentui/react-button";

import { FILTER_CHIPS, MARKER_CHIPS } from "../../constants/encodings.js";
import { useView } from "../../state/viewStore.jsx";

/**
 * The filters and the markers, as pressed/unpressed chips.
 *
 * A filter removes contigs from every view; a marker only annotates what is
 * already drawn. They read as one row because they answer the same question —
 * "which contigs am I looking at?" — but the SHOW / MARK grouping keeps the
 * two kinds apart.
 */
function Chip({ chip, pressed, onToggle }) {
  return (
    <ToggleButton
      id={chip.id}
      className="chip"
      type="button"
      size="small"
      shape="circular"
      checked={pressed}
      onClick={() => onToggle(chip, !pressed)}
    >
      {chip.text}
    </ToggleButton>
  );
}

export function FilterChips() {
  const { state, dispatch } = useView();

  const toggleFilter = (chip, value) =>
    dispatch({ type: "view/filter", key: chip.key, value });
  const toggleMarker = (chip, value) =>
    dispatch({ type: "view/marker", key: chip.key, value });

  const filterChip = (chip) => (
    <Chip
      key={chip.id}
      chip={chip}
      pressed={state.filters[chip.key]}
      onToggle={toggleFilter}
    />
  );

  return (
    <>
      <span className="tb-chip-label">Show</span>
      {FILTER_CHIPS.slice(0, 2).map(filterChip)}
      <span className="tb-chip-sep" aria-hidden="true"></span>
      {FILTER_CHIPS.slice(2).map(filterChip)}
      <span className="tb-chip-sep" aria-hidden="true"></span>
      <span className="tb-chip-label">Mark</span>
      {MARKER_CHIPS.map((chip) => (
        <Chip
          key={chip.id}
          chip={chip}
          pressed={state.markers[chip.key]}
          onToggle={toggleMarker}
        />
      ))}
    </>
  );
}
