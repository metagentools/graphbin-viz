import { afterEach, describe, expect, test } from "vitest";

import {
  deleteSession,
  getSession,
  listSessions,
  patchSession,
  putSession,
  renameSession,
} from "./sessionsDb.js";

function record(id, overrides = {}) {
  return {
    id,
    name: `Session ${id}`,
    createdAt: "2026-09-23T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z",
    isExample: false,
    assembler: "spades",
    settings: {},
    model: { nodes: [], edges: [] },
    plots: { initial: null, final: null },
    logText: "",
    statusText: "",
    view: {},
    ...overrides,
  };
}

// Each test gets its own id namespace so they can run against the same
// (fake) IndexedDB database without needing to reset it between tests.
describe("sessionsDb", () => {
  test("put + get round-trips a session", async () => {
    await putSession(record("rt-1"));
    const found = await getSession("rt-1");
    expect(found.id).toBe("rt-1");
    expect(found.name).toBe("Session rt-1");
  });

  test("getSession returns null for an id that was never saved", async () => {
    expect(await getSession("does-not-exist")).toBeNull();
  });

  test("listSessions returns saved sessions newest-first", async () => {
    await putSession(record("list-1", { updatedAt: "2026-09-20T00:00:00.000Z" }));
    await putSession(record("list-2", { updatedAt: "2026-09-22T00:00:00.000Z" }));
    await putSession(record("list-3", { updatedAt: "2026-09-21T00:00:00.000Z" }));

    const all = await listSessions();
    const ours = all.filter((s) => s.id.startsWith("list-"));
    expect(ours.map((s) => s.id)).toEqual(["list-2", "list-3", "list-1"]);
  });

  test("patchSession merges fields and bumps updatedAt", async () => {
    await putSession(record("patch-1", { updatedAt: "2026-09-01T00:00:00.000Z" }));
    const merged = await patchSession("patch-1", { logText: "updated" });
    expect(merged.logText).toBe("updated");
    expect(merged.name).toBe("Session patch-1"); // untouched fields survive
    expect(merged.updatedAt).not.toBe("2026-09-01T00:00:00.000Z");
  });

  test("patchSession on a missing id is a no-op", async () => {
    expect(await patchSession("missing-id", { logText: "x" })).toBeNull();
  });

  test("renameSession only changes the name", async () => {
    await putSession(record("rename-1"));
    const renamed = await renameSession("rename-1", "My renamed session");
    expect(renamed.name).toBe("My renamed session");
  });

  test("deleteSession removes it from later listings", async () => {
    await putSession(record("delete-1"));
    expect(await getSession("delete-1")).not.toBeNull();
    await deleteSession("delete-1");
    expect(await getSession("delete-1")).toBeNull();
  });
});
