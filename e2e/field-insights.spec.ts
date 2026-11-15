import { test, expect } from "@playwright/test";

test("plain-language summary opens recorded and archived parcel analysis", async ({ page }) => {
  const cookie = process.env.AGROMAX_BROWSER_UPGRADE_COOKIE!;
  await page.context().addCookies(cookie.split("; ").map(pair => {
    const separator = pair.indexOf("=");
    return { name: pair.slice(0, separator), value: pair.slice(separator + 1), url: "http://127.0.0.1:5182" };
  }));
  // Older demo reports omitted fieldChecks.
  await page.route("**/api/records/**/analysis", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const payload = await response.json();
    if (payload.analysis) payload.analysis.report = {
      interpretation: { overview: "Eski kayıt açıklaması", findings: [] },
    };
    await route.fulfill({ response, json: payload });
  });
  await page.goto("/#overview");
  await expect(page.getByRole("region", { name: "Tarla durumu" })).toContainText("belirgin düşüş yok");
  await page.getByRole("button", { name: "Anlaşılır analizi aç" }).click();
  await expect(page.getByRole("heading", { name: "Anlaşılır analiz" })).toBeVisible();
  await expect(page.getByText("Eski kayıt açıklaması", { exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "Karşılaştırmada kullanılan değerler" })).toContainText("+0,3");
  await page.getByRole("button", { name: "Uydu haritası ve teknik indeksler" }).click();
  await expect(page.getByRole("heading", { name: "EXPLICIT TEST PARCEL upgrade", exact: true })).toBeVisible();
  await expect(page.getByText("Eski kayıt açıklaması", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Anlaşılır analizi aç" }).click();
  await page.locator(".field-insights").getByRole("button", { name: "Analiz geçmişi" }).click();
  await page.getByRole("button", { name: "Sonucu aç" }).first().click();
  await page.getByRole("button", { name: "Anlaşılır analizi aç" }).click();
  await expect(page.getByText("Geçmiş analiz kaydı gösteriliyor.", { exact: false })).toBeVisible();
});
