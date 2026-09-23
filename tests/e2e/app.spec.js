import { test, expect } from "@playwright/test";

test("workspace controls are available", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /GraphBin-Viz/i })
  ).toBeVisible();

  await page.getByRole("tab", { name: /Workspace/i }).click();

  await expect(
    page.getByRole("button", { name: "Hide isolated" })
  ).toBeVisible();
  await expect(page.locator("#graph-canvas")).toBeVisible();

  // the graph, the feature space and the flow view are shown together
  await expect(page.locator("#feature-scatter")).toBeVisible();
  await expect(page.locator("#sankey-svg")).toBeVisible();
});
