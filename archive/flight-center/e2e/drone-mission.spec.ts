import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { rasterGrid } from "../shared/spatial.js";
import { telemetryPackets } from "../server/fixtures/mavlink.mjs";
import { createRequire } from "node:module";

test.use({
  launchOptions: {
    args: [
      "--enable-webgl",
      "--enable-unsafe-swiftshader",
      ...(process.env.AGROMAX_GPU_QA === "true" ? ["--enable-gpu"] : []),
    ],
  },
  video:
    process.env.AGROMAX_GPU_QA === "true" &&
    process.env.AGROMAX_RECORD_MISSION === "true"
      ? { mode: "on", size: { width: 1440, height: 1000 } }
      : "off",
});
const { PNG } = createRequire(import.meta.url)("pngjs");

async function openMissions(page: Page) {
  const cookies = process.env.AGROMAX_BROWSER_UPGRADE_COOKIE;
  if (!cookies) throw new Error("Expected isolated browser login cookie.");
  await page.context().addCookies(
    cookies.split("; ").map((pair) => {
      const separator = pair.indexOf("=");
      return {
        name: pair.slice(0, separator),
        value: pair.slice(separator + 1),
        url: "http://127.0.0.1:5182",
        httpOnly: true,
        sameSite: "Lax" as const,
      };
    }),
  );
  await page.goto("/#flight");
  const mission = page.getByRole("region", { name: "Drone Görev Kontrolü" });
  await mission.getByLabel("Platform parseli").selectOption("e".repeat(32));
  return mission;
}

test("drone mission uses saved observations, simulates a route and exports review only", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize(
    info.project.name === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  const dem = new PNG({ width: 256, height: 256 });
  for (let y = 0; y < dem.height; y++)
    for (let x = 0; x < dem.width; x++) {
      const encoded = (32768 + 120 + x * 0.18 + y * 0.25) * 256;
      dem.data.set(
        [(encoded >> 16) & 255, (encoded >> 8) & 255, encoded & 255, 255],
        (y * dem.width + x) * 4,
      );
    }
  const fixtureDem = PNG.sync.write(dem);
  await page.route("**/terrarium/**", (route) =>
    route.fulfill({
      body: fixtureDem,
      contentType: "image/png",
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  const geometry = {
    type: "Polygon",
    coordinates: [
      [
        [27.5, 38.5],
        [27.501, 38.5],
        [27.501, 38.501],
        [27.5, 38.501],
        [27.5, 38.5],
      ],
    ],
  };
  const grid = rasterGrid(geometry, 10);
  const size = grid.width * grid.height;
  await page.route(
    "**/api/records/" + "e".repeat(32) + "/image",
    async (route) => {
      const { date } = route.request().postDataJSON();
      const values = Array.from({ length: size }, (_, i) =>
        date === "2026-10-28"
          ? 0.5
          : i === grid.width * 2 + 2 || i === grid.width * 7 + 5
            ? 0.2
            : 0.5 + (i % 7) * 0.002,
      );
      await route.fulfill({
        json: {
          ...grid,
          metric: "NDVI",
          provider: "cdse",
          unit: "ratio",
          method: "s2-l2a-v3",
          geometryHash: "explicit-fixture",
          values,
        },
      });
    },
  );
  const mission = await openMissions(page);
  await expect(mission.getByText("Canlı cihaz bağlı değil")).toBeVisible();
  const map = mission.locator(".mission-map");
  const rail = mission.getByRole("navigation", { name: "Görev panelleri" });
  await expect(
    rail.getByRole("button", { name: "Görev planı" }),
  ).toHaveAttribute("aria-expanded", "false");
  const sizeOnScreen = await map.evaluate((element) => {
    return {
      width: element.clientWidth,
      height: element.clientHeight,
      windowWidth: innerWidth,
      windowHeight: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  expect(sizeOnScreen.overflow).toBe(false);
  expect(sizeOnScreen.width / sizeOnScreen.windowWidth).toBeGreaterThan(0.7);
  expect(sizeOnScreen.height / sizeOnScreen.windowHeight).toBeGreaterThan(
    info.project.name === "mobile" ? 0.45 : 0.68,
  );
  await writeFile(
    info.outputPath("mission-map-layout.json"),
    JSON.stringify(
      {
        ...sizeOnScreen,
        viewportShare:
          (sizeOnScreen.width * sizeOnScreen.height) /
          (sizeOnScreen.windowWidth * sizeOnScreen.windowHeight),
      },
      null,
      2,
    ),
  );
  await rail.getByRole("button", { name: "Görev planı" }).click();
  await mission.getByRole("button", { name: "Uydu farkını incele" }).click();
  await expect(mission.getByText("2 inceleme noktası")).toBeVisible();
  await rail.getByRole("button", { name: "Harita katmanları" }).click();
  const layer = mission.getByLabel("Uydu katmanı");
  await layer.selectOption("previous");
  await expect(mission.locator(".mission-legend")).toBeVisible();
  await layer.selectOption("none");
  await expect(mission.locator(".mission-legend")).toHaveCount(0);
  await layer.selectOption("difference");
  await rail.getByRole("button", { name: "Görev planı" }).click();
  await mission
    .getByRole("button", { name: "Önerilen rotayı oluştur" })
    .click();
  await expect(
    mission.getByRole("button", { name: "Simülasyonu başlat" }),
  ).toBeEnabled();
  await rail.getByRole("button", { name: "İnceleme ve geçmiş" }).click();
  await mission
    .getByRole("button", { name: "Zemin profili", exact: true })
    .click();
  const profile = mission.getByRole("region", {
    name: "Rota boyunca zemin profili",
  });
  await expect(
    profile.getByRole("img", {
      name: "Rota mesafesine göre DEM zemin profili",
    }),
  ).toBeVisible({ timeout: 17000 });
  await mission.getByRole("button", { name: "Odak modu", exact: true }).click();
  await expect(mission.locator(".mission-theatre")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mission.locator(".mission-theatre")).toHaveCount(0);
  await rail.getByRole("button", { name: "Görev planı" }).click();
  const pointList = mission
    .getByRole("heading", { name: "Rota noktaları" })
    .locator("..");
  await pointList.getByRole("button", { name: "Taşı" }).last().click();
  await pointList.getByLabel("Boylam").fill("27.50075");
  await pointList.getByLabel("Enlem").fill("38.50032");
  await pointList.getByRole("button", { name: "Noktayı güncelle" }).click();
  await expect(pointList).toContainText("27.500750, 38.500320");
  await rail.getByRole("button", { name: "Görev planı" }).click();
  await expect(mission.locator(".mission-map")).toHaveAttribute(
    "data-aircraft",
    "ready",
    { timeout: 15000 },
  );
  await mission.getByRole("button", { name: "2D", exact: true }).click();
  await expect(
    mission.getByRole("button", { name: "2D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(map).toHaveAttribute("data-pitch", "0");
  await expect(mission.locator(".mission-aircraft-marker")).toBeVisible();
  await mission.getByRole("button", { name: "3D", exact: true }).click();
  await mission.getByRole("button", { name: "Simülasyonu başlat" }).click();
  await expect(
    mission.locator(".mission-flight-facts .mission-phase"),
  ).toHaveText("Kalkış");
  await mission.getByRole("button", { name: "Duraklat" }).click();
  const timeline = mission.getByRole("slider", { name: "Görev zamanı" });
  await timeline.evaluate((input: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, String(Number(input.max) / 2));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(mission.locator(".mission-map-caption").first()).toContainText(
    "35 m AGL",
  );
  await rail.getByRole("button", { name: "Harita katmanları" }).click();
  await mission
    .getByRole("button", { name: "Kamera görüş alanı", exact: true })
    .click();
  await expect(mission.getByText(/Düz zemin varsayımı/)).toBeVisible();
  await mission.getByRole("button", { name: "Paneli kapat" }).click();
  await mission
    .getByRole("button", { name: "Takip kamerası", exact: true })
    .click();
  await expect(map).toHaveAttribute("data-camera", "chase");
  await expect(map).toHaveAttribute("data-pitch", "63");
  await mission
    .getByRole("button", { name: "Drone’u takip et", exact: true })
    .click();
  await expect(
    mission.getByRole("button", { name: "Drone’u takip et", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await mission
    .getByRole("button", { name: "Parseli kadrajla", exact: true })
    .click();
  await expect(map).toHaveAttribute("data-camera", "free");
  await expect(map.locator(".spatial-map")).toHaveAttribute(
    "data-basemap-loaded",
    "true",
  );
  await mission.locator(".mission-map").screenshot({
    path: info.outputPath("drone-scene.png"),
    animations: "disabled",
  });
  await mission.screenshot({
    path: info.outputPath("drone-mission.png"),
    animations: "disabled",
  });
  await timeline.press("End");
  await expect(
    mission.locator(".mission-flight-facts .mission-phase"),
  ).toHaveText("Tamamlandı");
  await rail.getByRole("button", { name: "İnceleme ve geçmiş" }).click();
  await expect(
    mission.getByRole("button", { name: "İnceleme JSON’u" }),
  ).toBeDisabled();
  await mission.getByLabel("Simülasyon rotasını inceledim").check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    mission.getByRole("button", { name: "İnceleme JSON’u" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("agromax-gorev-inceleme.json");
  const file = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(file.machineExecution).toBe(false);
  expect(file.route.coordinates).toContainEqual([27.50075, 38.50032]);
  expect(file.satelliteContext).toBeUndefined();
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/platform/records") &&
        r.request().method() === "POST",
    ),
    mission.getByRole("button", { name: "Saha incelemesine kaydet" }).click(),
  ]);
  expect(response.status(), await response.text()).toBe(201);
  const { record } = await response.json();
  expect(record.payload.simulationReview.waypoints).toContainEqual([
    27.50075, 38.50032,
  ]);
  await mission
    .getByRole("button", { name: "Parsel incelemelerini aç" })
    .click();
  await expect(
    page
      .getByRole("heading", { name: "Drone simülasyonu · saha incelemesi" })
      .first(),
  ).toBeVisible();
  await page.goto("/#flight");
  await rail.getByRole("button", { name: "Görev planı" }).click();
  await expect(mission.getByLabel("Kayıtlı simülasyonu aç")).toBeVisible();
  await mission.getByLabel("Kayıtlı simülasyonu aç").selectOption(record.id);
  await expect(mission.getByText("27.500750, 38.500320")).toBeVisible();
  expect(failures).toEqual([]);
});

test("mission field findings persist with the reviewed version and recheck a later compatible satellite capture", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const mission = await openMissions(page);
  const fieldId = "e".repeat(32),
    analysisId = "f".repeat(32);
  const data = await (
    await page.request.get(`/api/platform/fields/${fieldId}`)
  ).json();
  const response = await page.request.post("/api/platform/records", {
    data: {
      fieldId,
      kind: "investigation",
      name: "EXPLICIT FIELD FEEDBACK FIXTURE",
      payload: {
        priority: "normal",
        region: "Explicit fixture parcel",
        requestedData: "Record on-site reading",
        state: "open",
        analysisId,
        simulationReview: {
          geometryHash: data.context.geometryHash,
          waypoints: [
            [27.5002, 38.5002],
            [27.5008, 38.5008],
          ],
          settings: { altitude: 35, speed: 5, endurance: 22 },
          satellite: {
            metric: "NDVI",
            provider: "cdse",
            method: "s2-l2a-v3",
            current: { analysisId, date: "2026-10-31" },
            previous: { analysisId, date: "2026-10-28" },
          },
        },
      },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const { record: review } = await response.json();
  await page.reload();
  const rail = mission.getByRole("navigation", { name: "Görev panelleri" });
  await rail.getByRole("button", { name: "İnceleme ve geçmiş" }).click();
  await mission
    .getByRole("button", { name: "Saha geri bildirimi", exact: true })
    .click();
  const feedback = mission.getByRole("region", {
    name: "Göreve bağlı saha bulguları",
  });
  await feedback
    .getByRole("combobox", { name: "İnceleme görevi", exact: true })
    .selectOption(review.id);
  await feedback.getByText("Saha bulgusu ekle", { exact: true }).click();
  await feedback
    .getByRole("combobox", { name: "İnceleme noktası", exact: true })
    .selectOption("1");
  const notes = feedback.getByLabel("Ne gözlemledin?");
  await notes.fill("EXPLICIT TEST: cihazla saha kontrolü yapıldı.");
  await mission.getByRole("button", { name: "Paneli kapat" }).click();
  await rail.getByRole("button", { name: "İnceleme ve geçmiş" }).click();
  await expect(notes).toHaveValue(
    "EXPLICIT TEST: cihazla saha kontrolü yapıldı.",
  );
  await feedback.getByLabel("Cihazla ölçüm yaptım").check();
  await feedback
    .getByLabel("Ölçüm cihazı", { exact: true })
    .fill("EXPLICIT TEST METER");
  await feedback.getByLabel("Ölçüm değeri", { exact: false }).fill("0");
  await feedback.getByText("Gözlemin konumu", { exact: true }).click();
  await feedback.getByLabel("Gözlem boylamı", { exact: true }).fill("27.52");
  const [invalid] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/platform/records") &&
        r.request().method() === "POST",
    ),
    feedback.getByRole("button", { name: "Saha bulgusunu kaydet" }).click(),
  ]);
  expect(invalid.status()).toBe(400);
  await expect(feedback.getByRole("alert")).toContainText(
    "parsel sınırının içinde",
  );
  await expect(notes).toHaveValue(
    "EXPLICIT TEST: cihazla saha kontrolü yapıldı.",
  );
  await feedback.getByLabel("Gözlem boylamı", { exact: true }).fill("27.5008");
  const [save] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/platform/records") &&
        r.request().method() === "POST",
    ),
    feedback.getByRole("button", { name: "Saha bulgusunu kaydet" }).click(),
  ]);
  expect(save.status(), await save.text()).toBe(201);
  const { record: finding } = await save.json();
  expect(finding.payload.missionFinding).toEqual({
    reviewId: review.id,
    reviewVersion: 1,
    waypointIndex: 1,
    observedChange: "uncertain",
  });
  expect(finding.payload.sensor.value).toBe(0);
  expect(finding.payload.coordinate).toEqual([27.5008, 38.5008]);
  await expect(
    feedback.getByText("1/2 nokta kontrolü", { exact: true }),
  ).toBeVisible();
  await expect(
    feedback.getByText(/Aynı kaynak ve yöntemden daha yeni/),
  ).toBeVisible();
  await page.reload();
  await rail.getByRole("button", { name: "İnceleme ve geçmiş" }).click();
  await mission
    .getByRole("button", { name: "Saha geri bildirimi", exact: true })
    .click();
  await feedback
    .getByRole("combobox", { name: "İnceleme görevi", exact: true })
    .selectOption(review.id);
  await feedback.getByText("1 saha kaydı", { exact: true }).click();
  await expect(
    feedback.getByText("EXPLICIT TEST: cihazla saha kontrolü yapıldı."),
  ).toBeVisible();
  await expect(
    feedback.getByText("Kullanıcı kaydı · görev v1 · gözlem v1"),
  ).toBeVisible();
  // This later observation is an isolated HTTP fixture, not a provider verification.
  await page.route(
    `**/api/platform/fields/${fieldId}/spatial`,
    async (route) => {
      const original = await route.fetch(),
        catalog = await original.json();
      catalog.observations.unshift({
        id: "1".repeat(32),
        date: "2026-11-05",
        metrics: { NDVI: 0.45 },
        coverage: { NDVI: 0.9 },
        minimumCoverage: 0.7,
        provider: "cdse",
        method: "s2-l2a-v3",
        source: "EXPLICIT LATER OBSERVATION FIXTURE",
        period: {
          from: "2026-11-05T00:00:00.000Z",
          to: "2026-11-06T00:00:00.000Z",
        },
      });
      await route.fulfill({ response: original, json: catalog });
    },
  );
  await feedback
    .getByRole("button", { name: "Saha ve uydu kayıtlarını yenile" })
    .click();
  await expect(
    feedback.getByRole("cell", { name: "+0,15", exact: true }),
  ).toBeVisible();
  await expect(
    feedback.getByText(/İndeks farkı parsel geneline aittir/),
  ).toBeVisible();
  await expect(
    feedback.getByText("Yeni uydu çekimi", { exact: true }),
  ).toBeVisible();
  await mission
    .locator("#mission-panel-inspect")
    .evaluate((element) => (element.scrollTop = 0));
  await mission.screenshot({
    path: info.outputPath("mission-field-feedback.png"),
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
  ).toBe(false);
});

test("waypoint handles support keyboard and pointer edits without leaving the parcel", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const mission = await openMissions(page),
    rail = mission.getByRole("navigation", { name: "Görev panelleri" });
  await mission.getByRole("button", { name: "2D", exact: true }).click();
  await rail.getByRole("button", { name: "Görev planı" }).click();
  await mission.getByText("Koordinat gir", { exact: true }).click();
  for (const [longitude, latitude] of [
    ["27.5003", "38.5003"],
    ["27.5007", "38.5007"],
  ]) {
    await mission
      .getByRole("spinbutton", { name: "Boylam", exact: true })
      .fill(longitude);
    await mission
      .getByRole("spinbutton", { name: "Enlem", exact: true })
      .fill(latitude);
    await mission.getByRole("button", { name: "Koordinatı ekle" }).click();
  }
  await mission.getByRole("button", { name: "Haritada nokta düzenle" }).click();
  const handle = mission.getByRole("button", {
    name: "Nokta 1 · sürükle veya yön tuşlarıyla taşı",
    exact: true,
  });
  await expect(handle).toBeVisible();
  await handle.press("ArrowRight");
  await expect(mission.locator(".mission-map-readout")).toContainText(
    "Nokta 1 taşındı",
  );
  const second = mission.getByRole("button", {
    name: "Nokta 2 · sürükle veya yön tuşlarıyla taşı",
    exact: true,
  });
  const box = await second.boundingBox();
  if (!box) throw new Error("Expected visible waypoint handle");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 6, box.y + box.height / 2 + 4, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(mission.locator(".mission-map-readout")).toContainText(
    "Nokta 2 taşındı",
  );
  await expect(mission.locator(".mission-waypoint-handle")).toHaveCount(2);
  const retained = await handle.boundingBox(),
    mapBox = await mission.locator(".mission-map").boundingBox();
  if (!retained || !mapBox) throw new Error("Expected geographic edit surface");
  await page.mouse.move(
    retained.x + retained.width / 2,
    retained.y + retained.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(mapBox.x + 10, mapBox.y + mapBox.height * 0.6, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(mission.locator(".mission-map-readout")).toContainText(
    "Önceki konum korundu.",
  );
  const restored = await handle.boundingBox();
  expect(Math.abs(restored!.x - retained.x)).toBeLessThan(1);
  expect(Math.abs(restored!.y - retained.y)).toBeLessThan(1);
  await mission.getByRole("button", { name: "Bitir", exact: true }).click();
  await expect(mission.locator(".mission-waypoint-handle")).toHaveCount(0);
  await rail.getByRole("button", { name: "Görev planı" }).click();
  await expect(
    mission.getByRole("button", { name: "Simülasyonu başlat" }),
  ).toBeEnabled();
  await mission.screenshot({
    path: info.outputPath("mission-waypoint-edit.png"),
    animations: "disabled",
  });
});

test("live mode displays real wire fields and clears them when the source stops", async ({
  page,
}) => {
  await page.addInitScript(
    ({ packets }) => {
      let output: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          output = controller;
        },
      });
      Object.defineProperty(window, "fixtureStopSerial", {
        value: () => output.close(),
      });
      Object.defineProperty(navigator, "serial", {
        value: {
          requestPort: async () => ({
            open: async () => {
              for (const frame of packets)
                output.enqueue(Uint8Array.from(frame));
            },
            readable: stream,
            close: async () => {},
          }),
        },
      });
    },
    { packets: telemetryPackets().map((packet) => Array.from(packet)) },
  );
  const mission = await openMissions(page);
  await mission
    .getByRole("button", { name: "Canlı cihaz", exact: true })
    .click();
  const panel = mission.getByRole("region", {
    name: "Canlı cihaz telemetrisi",
  });
  await expect(panel.getByText("Port kapalı")).toBeVisible();
  await panel.getByRole("button", { name: "USB portu seç" }).click();
  await expect(panel.getByText("PX4 · Sistem 17")).toBeVisible();
  await expect(panel.getByText("Etkin · Sıra 7")).toBeVisible();
  await expect(panel.getByText("WGS84 · 27.500500, 38.500500")).toBeVisible();
  await expect(
    mission.getByText("Cihaz konumu · 160 m deniz seviyesine göre"),
  ).toBeVisible();
  await page.evaluate(() => Reflect.get(window, "fixtureStopSerial")());
  await expect(
    panel.getByText("Bağlantı kesildi", { exact: true }),
  ).toBeVisible();
  await expect(
    mission.getByText("Cihaz konumu ·", { exact: false }),
  ).toHaveCount(0);
  await mission
    .getByRole("button", { name: "Simülasyon", exact: true })
    .click();
  await expect(
    mission.getByRole("heading", { name: "Simülasyon telemetrisi" }),
  ).toBeVisible();
});

test("mission control renders a real agricultural landscape and retains compact controls", async ({
  page,
}, info) => {
  const testStarted = Date.now();
  test.setTimeout(
    process.env.AGROMAX_RECORD_MISSION === "true" ||
      process.env.AGROMAX_PROFILE_MISSION === "true"
      ? 180_000
      : 100_000,
  );
  await page.setViewportSize(
    info.project.name === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openMissions(page);
  const created = await page.request.post("/api/records", {
    data: {
      kind: "field",
      name: "Trakya · örnek inceleme alanı",
      crop: "Buğday",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [27.153, 41.114],
            [27.155, 41.114],
            [27.155, 41.116],
            [27.153, 41.116],
            [27.153, 41.114],
          ],
        ],
      },
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { id } = await created.json();
  await page.reload();
  const mission = page.getByRole("region", { name: "Drone Görev Kontrolü" });
  await mission.getByLabel("Platform parseli").selectOption(id);
  await expect(mission.locator(".spatial-map")).toHaveAttribute(
    "data-basemap-loaded",
    "true",
    { timeout: 20000 },
  );
  await mission
    .getByRole("button", { name: "Görev planı", exact: true })
    .click();
  const points = mission
    .getByRole("heading", { name: "Rota noktaları" })
    .locator("..");
  await points.getByText("Koordinat gir", { exact: true }).click();
  for (const [lon, lat] of [
    [27.15335, 41.1144],
    [27.1546, 41.11555],
  ]) {
    await points.getByLabel("Boylam").fill(String(lon));
    await points.getByLabel("Enlem").fill(String(lat));
    await points
      .getByRole("button", { name: "Koordinatı ekle", exact: true })
      .click();
  }
  await mission.getByRole("button", { name: "Paneli kapat" }).click();
  const timeline = mission.getByRole("slider", { name: "Görev zamanı" });
  await mission.getByRole("button", { name: "Simülasyonu başlat" }).click();
  await expect(
    mission.getByRole("button", { name: "Duraklat", exact: true }),
  ).toBeVisible();
  await mission.getByRole("button", { name: "Duraklat", exact: true }).click();
  await timeline.evaluate((element: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(element, Number(element.max) * 0.45);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await mission
    .getByRole("button", { name: "Parseli kadrajla", exact: true })
    .click();
  await expect(mission.locator(".mission-map")).toHaveAttribute(
    "data-aircraft",
    "ready",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  if (info.project.name === "mobile") {
    const caption = await mission.locator(".mission-map-caption").boundingBox();
    const tools = await mission.locator(".mission-map-tools").boundingBox();
    expect(caption!.x + caption!.width).toBeLessThan(tools!.x);
    const hud = await mission.locator(".mission-hud").boundingBox();
    const attribution = await mission
      .locator(".maplibregl-ctrl-bottom-right")
      .boundingBox();
    expect(hud!.y + hud!.height).toBeLessThan(attribution!.y - 4);
  }
  await page.screenshot({
    path: info.outputPath("agromax-mission-landscape.png"),
  });
  if (
    process.env.AGROMAX_RECORD_MISSION === "true" ||
    process.env.AGROMAX_PROFILE_MISSION === "true"
  ) {
    const native = process.env.AGROMAX_GPU_QA === "true";
    const renderer = await mission
      .locator("canvas.maplibregl-canvas")
      .evaluate((canvas: HTMLCanvasElement) => {
        const gl = canvas.getContext("webgl2"),
          extension = gl?.getExtension("WEBGL_debug_renderer_info");
        return extension && gl?.getParameter(extension.UNMASKED_RENDERER_WEBGL);
      });
    if (native) expect(renderer).not.toMatch(/swiftshader|llvmpipe|software/i);
    const frames: { file: string; time: number }[] = [];
    const recordingStarted = Date.now();
    await page.evaluate(() => {
      const state = { running: true, previous: 0, frames: [] as number[] };
      Reflect.set(window, "missionFrameProbe", state);
      const tick = (time: number) => {
        if (!state.running) return;
        if (state.previous) state.frames.push(time - state.previous);
        state.previous = time;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await mkdir(info.outputPath("frames"), { recursive: true });
    const capture = async (milliseconds: number) => {
      if (native) {
        await page.waitForTimeout(milliseconds);
        return;
      }
      const end = Date.now() + milliseconds;
      do {
        const start = Date.now(),
          file = `capture-${String(frames.length).padStart(4, "0")}.jpg`;
        await page.screenshot({
          path: info.outputPath("frames", file),
          type: "jpeg",
          quality: 85,
        });
        frames.push({ file, time: (Date.now() - recordingStarted) / 1000 });
        const remaining = 250 - (Date.now() - start);
        if (remaining > 0) await page.waitForTimeout(remaining);
      } while (Date.now() < end);
    };
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await mission
      .getByRole("combobox", { name: "Oynatma hızı" })
      .selectOption("2");
    await mission
      .getByRole("button", { name: "Devam et", exact: true })
      .click();
    await capture(3500);
    await mission
      .getByRole("button", { name: "Drone’u takip et", exact: true })
      .click();
    await capture(3500);
    await mission
      .getByRole("button", { name: "Duraklat", exact: true })
      .click();
    await mission
      .getByRole("button", { name: "Telemetri", exact: true })
      .click();
    await capture(2500);
    await mission
      .getByRole("button", { name: "Paneli kapat", exact: true })
      .click();
    await mission.getByRole("button", { name: "2D", exact: true }).click();
    await capture(2000);
    await mission.getByRole("button", { name: "3D", exact: true }).click();
    await capture(2000);
    const intervals: number[] = await page.evaluate(() => {
      const state = Reflect.get(window, "missionFrameProbe");
      state.running = false;
      return state.frames;
    });
    const sorted = intervals.toSorted((a, b) => a - b),
      percentile = (fraction: number) =>
        sorted[
          Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
        ] ?? null;
    await writeFile(
      info.outputPath("mission-frame-profile.json"),
      JSON.stringify(
        {
          renderer,
          native,
          video: process.env.AGROMAX_RECORD_MISSION === "true",
          viewport: page.viewportSize(),
          samples: intervals.length,
          p50Ms: percentile(0.5),
          p95Ms: percentile(0.95),
          p99Ms: percentile(0.99),
          over50Ms: intervals.filter((time) => time > 50).length,
          scope:
            "Browser RAF cadence during actual simulation, follow camera and 2D/3D controls. Not a phone or drone hardware benchmark.",
        },
        null,
        2,
      ),
    );
    await writeFile(
      info.outputPath("recording-timing.json"),
      JSON.stringify({
        frames,
        from: Math.max(0, (recordingStarted - testStarted) / 1000 - 0.3),
        native,
        duration: (Date.now() - recordingStarted) / 1000,
        capture: native
          ? process.env.AGROMAX_RECORD_MISSION === "true"
            ? "Native browser video with verified hardware WebGL. Frame cadence recorded separately."
            : "Browser frame cadence probe without video recording."
          : "Actual browser screenshots, target 4 Hz; elapsed frame times retained. Not a rendering performance benchmark.",
      }),
    );
  }
  await mission.getByRole("button", { name: "Telemetri", exact: true }).click();
  await expect(
    mission.getByRole("heading", { name: "Simülasyon telemetrisi" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("agromax-mission-telemetry.png"),
  });
  await mission
    .getByRole("button", { name: "Paneli kapat", exact: true })
    .click();
  if (info.project.name === "desktop") {
    await page.setViewportSize({ width: 768, height: 1024 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("agromax-mission-tablet.png"),
    });
  } else {
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});

test("topographic screening uses actual DEM samples and refuses transparent missing data", async ({
  page,
}) => {
  const dem = new PNG({ width: 256, height: 256 });
  let missing = false;
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const encoded = (32768 + 110 + x * 0.1 + y * 0.4) * 256;
      dem.data.set(
        [(encoded >> 16) & 255, (encoded >> 8) & 255, encoded & 255, 255],
        (y * 256 + x) * 4,
      );
    }
  const bytes = PNG.sync.write(dem),
    empty = PNG.sync.write(new PNG({ width: 256, height: 256 }));
  await page.route("**/terrarium/**", (route) =>
    route.fulfill({ body: missing ? empty : bytes, contentType: "image/png" }),
  );
  await openMissions(page);
  await page.goto("/#twin");
  await page
    .getByRole("button", { name: "Yüzey akışını aç", exact: true })
    .click();
  const flow = page.getByRole("region", { name: "Topoğrafik su akışı" });
  await expect(flow.getByText("İç akış sonu")).toBeVisible({ timeout: 18000 });
  await expect(
    flow.getByRole("button", { name: "Akış yönü", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await flow.getByRole("button", { name: "Akış yönü", exact: true }).click();
  await expect(
    flow.getByRole("button", { name: "Akış yönü", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await flow.getByRole("button", { name: "2D", exact: true }).click();
  await expect(flow.locator(".spatial-map")).toHaveAttribute(
    "data-terrain",
    "flat",
  );
  missing = true;
  await page.reload();
  await page
    .getByRole("button", { name: "Yüzey akışını aç", exact: true })
    .click();
  await expect(
    flow.getByText(/en az dokuz geçerli DEM hücresi gerekiyor/),
  ).toBeVisible({ timeout: 18000 });
  await expect(flow.getByText("İç akış sonu")).toHaveCount(0);
});
