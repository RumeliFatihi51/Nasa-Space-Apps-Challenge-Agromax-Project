import { z } from "zod";
import { containsPoint, metricFrame, polygons } from "./spatial.js";
import { segmentInside } from "./drone-mission.js";

const position = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-85).max(85),
]);
const id = z.string().regex(/^[a-f0-9]{32}$/);
const ring = z.array(position).min(4).max(1000);
const polygon = z.array(ring).min(1).max(20);
const geometry = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: polygon }).strict(),
  z
    .object({
      type: z.literal("MultiPolygon"),
      coordinates: z.array(polygon).min(1).max(20),
    })
    .strict(),
]);
export const flightPlanPayload = z
  .object({
    geometryHash: z.string().regex(/^[a-f0-9]{64}$/),
    firmware: z.enum(["px4", "ardupilot"]),
    vehicle: z.enum(["quad", "hexa", "octo"]),
    firmwareVersion: z.string().trim().max(80),
    home: position,
    homeAMSL: z.number().finite().min(-500).max(9000),
    altitude: z.number().finite().min(10).max(120),
    speed: z.number().finite().min(1).max(12),
    endurance: z.number().finite().min(5).max(60),
    swath: z.number().finite().min(2).max(100),
    overlap: z.number().finite().min(0).max(80),
    bearing: z.number().finite().min(0).max(179),
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("field") }).strict(),
      z
        .object({
          kind: z.literal("prescription"),
          recordId: id,
          version: z.number().int().positive(),
          zoneIndex: z.number().int().min(0).max(23),
        })
        .strict(),
      z
        .object({
          kind: z.literal("analysis_review"),
          analysisId: id,
          date: z.iso.date(),
          metric: z.string().min(1).max(20),
          geometry,
        })
        .strict(),
    ]),
  })
  .strict();

// A bounded, local scanline planner. It fails closed if straight connections
// cross holes/concavities; it never silently bridges disconnected parcels.
export function coverageFlight(field, target, input) {
  const config = flightPlanPayload.parse(input);
  if (!field || !target || !containsPoint(field, config.home))
    throw new Error("Kalkış noktası kayıtlı parselin içinde olmalı.");
  const frame = metricFrame(field);
  if (!Number.isFinite(frame.span) || frame.span > 5000)
    throw new Error(
      "Bu yerel rota planlayıcı en fazla 5 km genişliğindeki parseller içindir.",
    );
  const angle = (config.bearing * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const rotate = (point) => {
    const [x, y] = frame.local(point);
    return [x * c + y * s, -x * s + y * c];
  };
  const coordinate = ([x, y]) => frame.coordinate(x * c - y * s, x * s + y * c);
  const rings = polygons(target).flatMap((polygon) =>
    polygon.map((ring) => ring.map(rotate)),
  );
  const ys = rings.flat().map((point) => point[1]);
  const low = Math.min(...ys),
    high = Math.max(...ys),
    spacing = config.swath * (1 - config.overlap / 100);
  const count = Math.max(1, Math.ceil((high - low) / spacing));
  if (count > 140)
    throw new Error(
      "Çok fazla tarama hattı. Alanı ayrı uçuşlara böl veya hat aralığını artır.",
    );
  const route = [config.home],
    lanes = [];
  for (let row = 0; row < count; row++) {
    const y = low + ((row + 0.5) * (high - low)) / count,
      cuts = [];
    for (const ring of rings)
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i];
        if (a[1] > y !== b[1] > y)
          cuts.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    cuts.sort((a, b) => a - b);
    const segments = [];
    for (let i = 0; i + 1 < cuts.length; i += 2) {
      // One metre endpoint inset; this is not a swept-volume/obstacle clearance.
      if (cuts[i + 1] - cuts[i] <= 2) continue;
      segments.push([
        coordinate([cuts[i] + 1, y]),
        coordinate([cuts[i + 1] - 1, y]),
      ]);
    }
    if (row % 2) segments.reverse().forEach((segment) => segment.reverse());
    for (const segment of segments) {
      if (!segmentInside(target, ...segment))
        throw new Error(
          "Tarama hattı hedef sınırını aşıyor. Hedefi ayrı alanlara böl.",
        );
      lanes.push(segment);
      route.push(...segment);
    }
  }
  if (!lanes.length)
    throw new Error("Hedef bu hat aralığında taranamayacak kadar dar.");
  route.push(config.home);
  if (route.length > 290)
    throw new Error("Görev nokta sınırını aşıyor. Alanı ayrı uçuşlara böl.");
  let distance = 0;
  for (let i = 1; i < route.length; i++) {
    if (!segmentInside(field, route[i - 1], route[i]))
      throw new Error(
        "Bağlantı veya dönüş hattı parsel dışına/boşluğa taşıyor. Yönü ya da kalkış noktasını değiştir; gerekirse ayrı uçuş hazırla.",
      );
    const a = frame.local(route[i - 1]),
      b = frame.local(route[i]);
    distance += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  // Includes an assumed 2 m/s vertical motion and 2 s per turn. No wind/energy model.
  const seconds =
    distance / config.speed +
    config.altitude +
    Math.max(0, lanes.length - 1) * 2;
  if (seconds > config.endurance * 60 * 0.8)
    throw new Error(
      "Tahmini süre, girilen uçuş süresinin %80’ini aşıyor. Alanı ayrı uçuşlara böl.",
    );
  return {
    route,
    lanes,
    distance,
    seconds,
    spacing,
    method: "local-scanline-v1",
  };
}

export function qgcPlan(field, target, input) {
  const config = flightPlanPayload.parse(input),
    flight = coverageFlight(field, target, config);
  const items = [];
  const add = (command, frame, params, altitude = null) =>
    items.push({
      type: "SimpleItem",
      autoContinue: true,
      doJumpId: items.length + 1,
      command,
      frame,
      params,
      Altitude: altitude,
      AltitudeMode: 1,
      AMSLAltAboveTerrain: null,
    });
  const nav = (command, point, altitude) =>
    add(
      command,
      3,
      [0, command === 16 ? 1 : 0, 0, null, point[1], point[0], altitude],
      altitude,
    );
  nav(22, config.home, config.altitude);
  add(178, 2, [1, config.speed, -1, 0, 0, 0, 0]);
  for (const point of flight.route.slice(1)) nav(16, point, config.altitude);
  nav(21, config.home, 0);
  return {
    fileType: "Plan",
    version: 1,
    groundStation: "QGroundControl",
    geoFence: { circles: [], polygons: [], version: 2 },
    rallyPoints: { points: [], version: 2 },
    mission: {
      version: 2,
      firmwareType: config.firmware === "px4" ? 12 : 3,
      vehicleType: { quad: 2, hexa: 13, octo: 14 }[config.vehicle],
      globalPlanAltitudeMode: 1,
      cruiseSpeed: config.speed,
      hoverSpeed: config.speed,
      plannedHomePosition: [config.home[1], config.home[0], config.homeAMSL],
      items,
    },
  };
}
