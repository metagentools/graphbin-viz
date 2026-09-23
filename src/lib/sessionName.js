/** A readable default name for a freshly finished run, editable afterwards. */
export function defaultSessionName({ isExample, assembler, files } = {}, when = new Date()) {
  const time = when.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (isExample) return `Example run — ${time}`;
  const base = files?.contigs?.name || files?.graph?.name || null;
  const label = base
    ? base.replace(/\.[^./\\]+$/, "")
    : assembler === "megahit"
    ? "MEGAHIT run"
    : "SPAdes run";
  return `${label} — ${time}`;
}
