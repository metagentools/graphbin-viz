/**
 * The query params the app tracks: which execution is on screen
 * (`execution`, a session id), which lower view has taken over the
 * viewport (`maximize`, "scatter" | "flow"), and whether this tab is
 * itself a window opened via the "open in a new window" button
 * (`popout`, "1"). The first two are read once on load and kept in sync
 * with `history.replaceState` from then on (`state/executionStore.jsx`)
 * -- never `pushState`, so navigating the workspace does not fill the
 * browser's back button with intermediate states. `popout` is read once
 * and never written back by that sync -- a tab that was popped out stays
 * marked as one for its whole lifetime, including across reloads, which
 * is what stops it from offering to pop out another one and cascading.
 * The URL is otherwise just a pointer: only `?execution=<id>` (opened via
 * a saved session, or copied out of the address bar) makes the app fetch
 * and restore anything.
 */

export function getQueryParam(key) {
  return new URL(window.location.href).searchParams.get(key);
}

export function setQueryParam(key, value) {
  const url = new URL(window.location.href);
  if (value === null || value === undefined || value === "") {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, String(value));
  }
  window.history.replaceState(window.history.state, "", url);
}

/**
 * The shareable URL for a saved execution, optionally with a maximized
 * view. `popout: true` marks the URL as one opened in a new window, so the
 * tab that loads it knows not to offer opening another one.
 */
export function buildExecutionUrl({ executionId, maximize, popout } = {}) {
  const url = new URL(window.location.href);
  if (executionId) url.searchParams.set("execution", executionId);
  else url.searchParams.delete("execution");
  if (maximize) url.searchParams.set("maximize", maximize);
  else url.searchParams.delete("maximize");
  if (popout) url.searchParams.set("popout", "1");
  else url.searchParams.delete("popout");
  return url.toString();
}
