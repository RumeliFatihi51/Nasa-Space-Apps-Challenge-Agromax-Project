import { expect, test } from "@playwright/test";

test("Araştırma opens a saved experiment, supports day selection and downloads the report", async ({ page }, info) => {
  const cookie = process.env.AGROMAX_BROWSER_UPGRADE_COOKIE;
  if (!cookie) throw new Error("Missing isolated test account cookie");
  await page.context().addCookies(cookie.split("; ").map(pair => {
    const separator = pair.indexOf("=");
    return { name: pair.slice(0, separator), value: pair.slice(separator + 1),
      url: "http://127.0.0.1:5182", httpOnly: true, sameSite: "Lax" as const };
  }));
  await page.goto("/#terra-brain");
  await expect(page.getByRole("heading", { name: "Araştırma", exact: true })).toBeVisible();
  await page.getByLabel("Sezon başlangıç yılı").fill("2024");
  await expect(page.getByText("EXPLICIT BROWSER FIXTURE")).toHaveCount(2);
  await page.screenshot({ path: info.outputPath("terra-veri-ve-harita.png") });
  await page.getByRole("button", { name: "Araştırma raporları", exact: true }).click();
  await page.getByRole("row").filter({ hasText: "Su dengesi deneyi" }).getByRole("button", { name: "Aç" }).click();
  await expect(page.getByText("Stres günü", { exact: true })).toBeVisible();
  await page.getByRole("slider", { name: /Grafik günü/ }).press("End");
  await expect(page.locator(".terra-chart output")).toHaveText("2025-06-02");
  await page.getByText("Girdi kaynakları ve sürümler", { exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sürümlü rapor" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/^terra-[a-f0-9]{32}-v1\.json$/);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 2);
  await page.screenshot({ path: info.outputPath("terra-deney-sonucu.png") });
});
