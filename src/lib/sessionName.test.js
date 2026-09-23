import { describe, expect, test } from "vitest";

import { defaultSessionName } from "./sessionName.js";

describe("defaultSessionName", () => {
  const when = new Date("2026-09-23T04:32:00Z");

  test("names an example run", () => {
    const name = defaultSessionName({ isExample: true }, when);
    expect(name).toMatch(/^Example run/);
  });

  test("prefers the contigs file name over the graph file name", () => {
    const name = defaultSessionName(
      {
        isExample: false,
        assembler: "spades",
        files: { graph: { name: "assembly_graph.gfa" }, contigs: { name: "contigs.fasta" } },
      },
      when
    );
    expect(name).toMatch(/^contigs/);
  });

  test("falls back to the assembler when no file name is available", () => {
    expect(defaultSessionName({ isExample: false, assembler: "megahit" }, when)).toMatch(
      /^MEGAHIT run/
    );
    expect(defaultSessionName({ isExample: false, assembler: "spades" }, when)).toMatch(
      /^SPAdes run/
    );
  });
});
