/**
 * A UUID for each execution (a run, or a session restored from one).
 *
 * `crypto.randomUUID` covers every browser the app targets; the fallback
 * below only matters for a runner (Vitest under an older jsdom) without it.
 */
export function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
