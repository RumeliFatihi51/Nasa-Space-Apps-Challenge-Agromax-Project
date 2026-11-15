import { PNG } from "pngjs";
import { expect, test, type Page } from "@playwright/test";

test.use({ launchOptions: { args: ["--enable-webgl", "--enable-unsafe-swiftshader"] } });
test.skip(!process.env.AGROMAX_VERIFY_GOOGLE_3D, "Opt-in live Cesium/Google provider check; requires authorized ion token.");

async function openStudio(page: Page) {
  await page.goto("/?account=existing");
  await page.getByLabel("E-posta adresiniz").fill("upgrade@example.invalid");
  await page.getByLabel("Şifreniz", { exact: true }).fill("browser-fixture-password-123");
  await page.getByRole("button", { name: "Platforma giriş yap" }).click();
  await expect(page.locator(".fw-overview-section")).toBeVisible();
  await page.goto("/#field-studio");
  await page.reload();
  await expect(page.locator(".maplibregl-canvas").first()).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Google 3D", exact: true }).click();
}

test("real Google tiles, camera controls and Mapbox return", async ({ page }, info) => {
  test.setTimeout(120000);
  await page.setViewportSize(info.project.name === "mobile" ? {width:390,height:844} : {width:1440,height:941});
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openStudio(page);
  const view = page.getByRole("dialog", { name: "Google 3D arazi görünümü" });
  await expect(view.getByRole("status")).toContainText("Gerçek arazi görüntüsü", {timeout:60000});
  await view.getByRole("button", { name: "Üstten bak", exact: true }).click();
  await view.getByRole("button", { name: "Arazi açısı", exact: true }).click();
  await page.waitForTimeout(5000);
  const shot = PNG.sync.read(await view.screenshot({path:info.outputPath("google-3d-live.png")}));
  const pixels: number[] = [];
  for (let y = Math.floor(shot.height * .3); y < shot.height * .8; y += 8) for (let x = Math.floor(shot.width * .15); x < shot.width * .85; x += 8) {
    const i = (y * shot.width + x) * 4; pixels.push((shot.data[i] + shot.data[i+1] + shot.data[i+2]) / 3);
  }
  const mean = pixels.reduce((sum, x) => sum + x, 0) / pixels.length;
  expect(Math.sqrt(pixels.reduce((sum, x) => sum + (x-mean)**2, 0) / pixels.length), "Terrain must be visibly textured, not a blank provider canvas").toBeGreaterThan(8);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await view.getByRole("button", { name: "Mapbox görünümüne dön" }).click();
  await expect(view).toHaveCount(0);
  await expect(page.locator(".maplibregl-canvas").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("provider failure keeps the original map and selected field", async ({ page }) => {
  await page.route("https://api.cesium.com/v1/assets/2275207/endpoint**", route => route.fulfill({status:503,json:{message:"EXPLICIT PROVIDER FAILURE FIXTURE"}}));
  await openStudio(page);
  await expect(page.getByRole("dialog", {name:"Google 3D arazi görünümü"})).toHaveCount(0, {timeout:60000});
  await expect(page.getByRole("status").filter({hasText:"Mapbox görünümü korunuyor"})).toBeVisible();
  await expect(page.locator(".maplibregl-canvas").first()).toBeVisible();
});
