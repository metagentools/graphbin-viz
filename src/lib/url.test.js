import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { buildExecutionUrl, getQueryParam, setQueryParam } from "./url.js";

describe("url query params", () => {
  const original = window.location.href;

  beforeEach(() => {
    window.history.replaceState(null, "", "/graphbin-viz/");
  });

  afterEach(() => {
    window.history.replaceState(null, "", original);
  });

  test("setQueryParam adds and removes a param without pushing history", () => {
    setQueryParam("execution", "abc-123");
    expect(getQueryParam("execution")).toBe("abc-123");

    setQueryParam("execution", null);
    expect(getQueryParam("execution")).toBeNull();
  });

  test("buildExecutionUrl carries both params, and omits the ones left out", () => {
    const url = buildExecutionUrl({ executionId: "abc-123", maximize: "scatter" });
    expect(url).toContain("execution=abc-123");
    expect(url).toContain("maximize=scatter");

    const urlWithoutMaximize = buildExecutionUrl({ executionId: "abc-123" });
    expect(urlWithoutMaximize).not.toContain("maximize=");
  });

  test("buildExecutionUrl only marks the URL as a pop-out when asked", () => {
    const popoutUrl = buildExecutionUrl({ executionId: "abc-123", maximize: "flow", popout: true });
    expect(popoutUrl).toContain("popout=1");

    const normalUrl = buildExecutionUrl({ executionId: "abc-123", maximize: "flow" });
    expect(normalUrl).not.toContain("popout=");
  });
});
