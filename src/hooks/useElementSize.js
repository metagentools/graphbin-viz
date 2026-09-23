/**
 * The measured size of an element.
 *
 * The canvas and both SVGs size themselves from their container, and the
 * workspace is laid out only once its tab is on screen — so anything drawn
 * while the tab was hidden was measured against a zero-sized box. Observing
 * the element covers both cases: a window resize and a tab becoming visible
 * are the same event as far as the views are concerned.
 */

import { useEffect, useState } from "react";

export function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;

    // Rounded, so a sub-pixel wobble in the layout cannot keep waking the
    // views up: a view that redraws on every fractional change can nudge its
    // own container and never settle.
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height }
      );
    };

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();

    return () => observer.disconnect();
  }, [ref]);

  return size;
}
