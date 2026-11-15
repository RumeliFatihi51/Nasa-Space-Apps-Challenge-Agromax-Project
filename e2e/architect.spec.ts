import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("Architect compares dated maps, saves linked revisions and reopens an older version", async ({
  page,
}, info) => {
  test.setTimeout(130000);
  await page.setViewportSize(
    info.project.name === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1440, height: 960 },
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const cookie = process.env.AGROMAX_BROWSER_UPGRADE_COOKIE!;
  await page.context().addCookies(
    cookie.split("; ").map((pair) => {
      const index = pair.indexOf("=");
      return {
        name: pair.slice(0, index),
        value: pair.slice(index + 1),
        url: "http://127.0.0.1:5182",
        httpOnly: true,
        sameSite: "Lax" as const,
      };
    }),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const field = "e".repeat(32);
  await page.goto("/#architect?field=" + field);
  const menu = page.getByRole("navigation", { name: "Ana gezinme" });
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Menüyü aç" }).click();
  await expect(menu.getByRole("button")).toHaveCount(6);
  if (info.project.name === "mobile")
    await page
      .locator("#workspace-sidebar")
      .getByRole("button", { name: "Menüyü kapat" })
      .click();
  await expect(
    page.getByRole("heading", { name: "Architect", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Architect parseli")).toHaveValue(field);
  await expect(page.getByLabel("Gözlem tarihi")).toHaveValue("2026-10-31");
  const reference = await page.evaluate(async (fieldId) => {
    const body = {
      fieldId,
      kind: "scenario",
      name: "Architect browser linked plan",
      payload: {
        waterM3: 120,
        waterUnitCost: 2,
        fertilizerKg: 0,
        fertilizerUnitCost: 0,
        laborHours: 1,
        laborHourlyCost: 100,
        otherCost: 0,
        currency: "TRY",
      },
    };
    const r = await fetch("/api/platform/records", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
    return { status: r.status, ...(await r.json()) };
  }, field);
  expect(reference.status).toBe(201);
  await page.reload();
  await page.getByRole("button", { name: "Karşılaştır", exact: true }).click();
  await expect(page.getByLabel("Önceki tarih")).toHaveValue("2026-10-28");
  await expect(page.locator(".architect-map")).toHaveCount(2);
  await page.getByText("Bağlı planlar ve kayıtlar").click();
  await page
    .getByRole("checkbox", { name: /Architect browser linked plan/ })
    .first()
    .check();
  await page
    .getByLabel("Proje adı")
    .fill("Architect saha kontrolü " + info.project.name);
  await page.getByLabel("Çalışma notu").fill("İlk sürüm notu");
  await page
    .getByRole("button", { name: "Projeyi kaydet", exact: true })
    .click();
  await expect(page.getByText("Proje kaydedildi · v1")).toBeVisible();
  await expect(page.getByRole("region",{name:"Proje kaynakları"}).getByText("120 m³")).toBeVisible();
  const project = await page.getByLabel("Kayıtlı proje").inputValue();
  await page.getByLabel("Çalışma notu").fill("İkinci sürüm notu");
  await page
    .getByRole("button", { name: "Yeni sürüm kaydet", exact: true })
    .click();
  await expect(page.getByText("Proje kaydedildi · v2")).toBeVisible();
  await page.reload();
  await page.getByLabel("Kayıtlı proje").selectOption(project);
  await expect(page.getByLabel("Çalışma notu")).toHaveValue(
    "İkinci sürüm notu",
  );
  await page.getByRole("button", { name: "Proje sürümleri" }).click();
  const versions = page.getByRole("region", {
    name: "Proje sürüm karşılaştırması",
  });
  await expect(versions.getByText("İlk sürüm notu")).toBeVisible();
  await versions
    .getByRole("button", { name: "Bu sürümü çalışma alanına al" })
    .click();
  await expect(page.getByLabel("Çalışma notu")).toHaveValue("İlk sürüm notu");
  await page
    .getByRole("button", { name: "Yeni sürüm kaydet", exact: true })
    .click();
  await expect(page.getByText("Proje kaydedildi · v3")).toBeVisible();
  await mkdir("data/architect-qa", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "data/architect-qa/" + info.project.name + ".png",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page
    .getByRole("navigation", { name: "Architect araçları" })
    .getByRole("button", { name: "Kanıtlar", exact: true })
    .click();
  await expect(page).toHaveURL(/#evidence\?field=e{32}/);
  await page.goto("/#history?field=" + field);
  await expect(
    page.getByRole("heading", { name: "Analiz geçmişi", exact: true }),
  ).toBeVisible();
  await page.goto("/#architect?field="+field);
  await page.getByLabel("Kayıtlı proje").selectOption(project);
  await page.locator(".architect-signature").click();
  await expect(page).toHaveURL(/#field-studio\?field=e{32}&metric=NDVI&date=2026-10-31/);
  expect(errors).toEqual([]);
});
