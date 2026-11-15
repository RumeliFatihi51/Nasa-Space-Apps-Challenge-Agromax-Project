import { test, expect } from "@playwright/test";

test("flight center separates aircraft state from simulation and survives bridge loss", async ({ page }) => {
  const cookie = process.env.AGROMAX_BROWSER_UPGRADE_COOKIE!;
  await page.context().addCookies(cookie.split("; ").map(pair => {
    const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), url: "http://127.0.0.1:5182" };
  }));
  let reachable = true;
  await page.route("http://127.0.0.1:5189/**", async route => {
    if (!reachable) return route.abort("connectionfailed");
    await route.fulfill({ contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:5182" },
      body: JSON.stringify({ schema: 1, mode: "live", commandsEnabled: false, connected: true,
        epoch: 1, verified: null, uncertain: false, events: [],
        telemetry: { armed: false, position: { longitude: 27.5, latitude: 38.5, altitudeAboveHomeM: 0 } } }) });
  });
  await page.goto("/#flight?field=" + "e".repeat(32));
  await expect(page.getByRole("heading", { name: "Tarladan uçuşa." })).toBeVisible();
  await page.locator(".flight-connection > summary").click();
  await page.getByLabel("Eşleştirme anahtarı").fill("EXPLICIT-TEST-PAIRING-TOKEN");
  await page.getByRole("button", { name: "Köprüye bağlan", exact: true }).click();
  await expect(page.locator(".flight-link-badge")).toContainText("Salt okunur telemetri");
  await expect(page.locator(".flight-transfer").getByRole("button", { name: "Görevi başlat" })).toBeDisabled();
  await expect(page.locator(".flight-transfer").getByRole("button", { name: "Eve dön" })).toBeDisabled();
  reachable = false;
  await expect(page.locator(".flight-link-badge")).toContainText("Köprüye ulaşılamıyor", { timeout: 10000 });
  await expect(page.locator(".flight-facts")).toContainText("Veri yok");
  await expect(page.locator(".flight-transfer").getByRole("button", { name: "Görevi başlat" })).toBeDisabled();
  expect(await page.locator(".flight-deck").evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
});
