/**
 * Which output sections the reader has collapsed, remembered across visits.
 *
 * The run log is deliberately never restored collapsed: it is where a failed
 * run explains itself.
 */

import { useCallback, useState } from "react";

const STORAGE_KEY = "graphbin-collapse-state";
const ALWAYS_EXPANDED = new Set(["section-output"]);

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
    for (const id of ALWAYS_EXPANDED) stored[id] = false;
    return stored;
  });

  const toggleSection = useCallback((id) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      save(next);
      return next;
    });
  }, []);

  const isCollapsed = useCallback((id) => !!collapsed[id], [collapsed]);

  return { isCollapsed, toggleSection };
}
