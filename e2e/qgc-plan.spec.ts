import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";

test("operator prepares, saves, downloads and reopens a flight-only QGC plan", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize(
    info.project.name === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const cookies = process.env.AGROMAX_BROWSER_UPGRADE_COOKIE!;
  await page.context().addCookies(
    cookies.split("; ").map((pair) => {
      const i = pair.indexOf("=");
      return {
        name: pair.slice(0, i),
        value: pair.slice(i + 1),
        url: "http://127.0.0.1:5182",
        httpOnly: true,
        sameSite: "Lax" as const,
      };
    }),
  );
  await page.goto("/#flight");
  await page.getByLabel("Parsel seç", {exact:true}).selectOption("e".repeat(32));
  const mission = page.locator(".flight-planner");
  await expect(mission.getByRole("link", { name: "Masaüstünde aç" })).toHaveAttribute("href", "agromax-qgc://open");
  const panel = mission.getByRole("region", {name:"QGroundControl uçuş dosyası"});
  await mission.getByRole("button", {name:"Parsel merkezini başlangıç seç"}).click();
  await expect(panel.getByText(/Haritadan seçildi/)).toBeVisible();
  await expect(panel.getByLabel("Kalkış boylamı", {exact:true})).toHaveCount(0);
  await expect(page.getByRole("button", {name:"Canlı cihaz",exact:true})).toHaveCount(0);
  await expect(
    panel.getByText(/Pompa veya dağıtıcı bağlı değil/),
  ).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Drone tipi", exact: true })
    .selectOption("quad");
  await panel
    .getByLabel("Kalkış yüksekliği · AMSL (m)", { exact: true })
    .fill("120");
  await panel
    .getByRole("button", { name: "Tarama rotasını oluştur", exact: true })
    .click();
  const result = panel.getByRole("region", { name: "Uçuş planı önizlemesi" });
  await expect(result).toBeVisible();
  const save = panel.getByRole("button", { name: "Planı kaydet", exact: true });
  await expect(save).toBeDisabled();
  await panel.getByRole("checkbox").check();
  await save.click();
  const exportButton = panel.getByRole("button", {
    name: ".plan dosyasını indir",
    exact: true,
  });
  await expect(exportButton).toBeEnabled();
  const pending = page.waitForEvent("download");
  await exportButton.click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(
    /^agromax-[a-f0-9]{32}-v1\.plan$/,
  );
  const path = await download.path();
  const plan = JSON.parse(await readFile(path!, "utf8"));
  expect(plan.fileType).toBe("Plan");
  expect(plan.mission.plannedHomePosition[0]).toBeCloseTo(38.5005, 5);
  expect(plan.mission.plannedHomePosition[1]).toBeCloseTo(27.5005, 5);
  expect(plan.mission.plannedHomePosition[2]).toBe(120);
  expect(plan.mission.items[0].command).toBe(22);
  expect(plan.mission.items.at(-1).command).toBe(21);
  expect(
    plan.mission.items.every((item: { command: number }) =>
      [16, 21, 22, 178].includes(item.command),
    ),
  ).toBeTruthy();
  await panel.getByLabel("Kalkışa göre irtifa (m)", { exact: true }).fill("45");
  await expect(exportButton).toHaveCount(0);
  await expect(result).toHaveCount(0);
  await page.reload();
  await panel.getByText(/Kayıtlı uçuş planları/).click();
  await panel
    .getByRole("button", { name: /Tarla tarama uçuşu · v1/ })
    .first()
    .click();
  await expect(
    panel.getByLabel("Kalkışa göre irtifa (m)", { exact: true }),
  ).toHaveValue("35");
  await expect(exportButton).toBeDisabled();
  await panel.getByRole("checkbox").check();
  await expect(exportButton).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
  ).toBeFalsy();
  expect(errors).toEqual([]);
  await mkdir("outputs/qgc-plan", { recursive: true });
  await exportButton.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `outputs/qgc-plan/${info.project.name}.png` });
  await download.saveAs(`outputs/qgc-plan/${info.project.name}-fixture.plan`);
});
