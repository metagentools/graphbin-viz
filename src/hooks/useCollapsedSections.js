/**
 * Which output sections the reader has collapsed, remembered across visits.
 *
 * The run log is deliberately never restored collapsed: it is where a failed
 * run explains itself. The config section is the same -- a fresh page load
 * always shows the inputs, even if a previous visit ended with them
 * collapsed after plotting; ConfigPanel is the one that collapses it again
 * once a result comes in during *this* visit.
 */

import { useCallback, useState } from "react";

const STORAGE_KEY = "graphbin-collapse-state";
const EXPANDED_ON_LOAD = new Set(["section-output", "section-config"]);

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* private mode; the choice just will not stick */
  }
}

export function useCollapsedSections() {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = load();
    for (const id of EXPANDED_ON_LOAD) stored[id] = false;
    return stored;
  });

  const toggleSection = useCallback((id) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      save(next);
      return next;
    });
  }, []);

  /** Force a section's collapsed state, e.g. auto-collapsing once a result loads. */
  const setSectionCollapsed = useCallback((id, value) => {
    setCollapsed((prev) => {
      if (prev[id] === value) return prev;
      const next = { ...prev, [id]: value };
      save(next);
      return next;
    });
  }, []);

  const isCollapsed = useCallback((id) => !!collapsed[id], [collapsed]);

  return { isCollapsed, toggleSection, setSectionCollapsed };
}
