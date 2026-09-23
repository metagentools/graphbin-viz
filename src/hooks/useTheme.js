/**
 * Light/dark, remembered.
 *
 * Fluent theming is a prop rather than a stylesheet, so the appearance has to
 * live in state; `data-theme` stays on <html> for the app's own CSS rules.
 * Until the reader chooses, the system preference wins — and keeps winning if
 * it changes.
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "graphbin-theme";

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(() => readStored() || systemTheme());

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!readStored()) setTheme(systemTheme());
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (e) {
        /* private mode; the choice just will not stick */
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
