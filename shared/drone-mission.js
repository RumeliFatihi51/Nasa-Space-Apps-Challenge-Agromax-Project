import {
  changeOutliers,
  compareRasters,
  containsPoint,
  metricFrame,
  pixelBounds,
  polygons,
  unproject,
} from "./spatial.js";
import { parcelFootprints } from "./raster-footprints.js";

export const maximumWaypoints = 24;
const position = (point) =>
  Array.isArray(point) &&
  point.length === 2 &&
  point.every(Number.isFinite) &&
  Math.abs(point[0]) <= 180 &&
  Math.abs(point[1]) <= 85;
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const difference = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
const clamp = (t) => Math.max(0, Math.min(1, t));

export function segmentInside(geometry, a, b) {
  if (!containsPoint(geometry, a) || !containsPoint(geometry, b)) return false;
  const vector = difference(b, a),
    length2 = vector[0] ** 2 + vector[1] ** 2;
  if (!length2) return true;
  const cuts = [0, 1];
  for (const polygon of polygons(geometry))
    for (const ring of polygon)
      for (let i = 1; i < ring.length; i++) {
        const edge = difference(ring[i], ring[i - 1]),
          offset = difference(ring[i - 1], a);
        const scale = Math.max(
          Math.hypot(...vector) * Math.hypot(...edge),
          1e-22,
        );
        const determinant = cross(vector, edge);
        if (Math.abs(determinant) <= scale * 1e-10) {
          if (Math.abs(cross(offset, vector)) <= length2 * 1e-10) {
            for (const end of [ring[i - 1], ring[i]]) {
              const diff = difference(end, a);
              cuts.push(
                clamp((diff[0] * vector[0] + diff[1] * vector[1]) / length2),
              );
            }
          }
        } else {
          const t = cross(offset, edge) / determinant,
            u = cross(offset, vector) / determinant;
          if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
        }
      }
  cuts.sort((x, y) => x - y);
  return cuts
    .slice(1)
    .every((end, i) => containsPoint(geometry, mix(a, b, (end + cuts[i]) / 2)));
}

export function reviewTargets(newer, earlier, geometry) {
  if (!newer || !earlier) return null;
  const delta = compareRasters(newer, earlier);
  if (!delta) return null;
  const outliers = changeOutliers(delta);
  if (!outliers) return { delta, targets: [] };
  const frame = metricFrame(geometry);
  const spacing = Math.max(...(delta.resolution || [20])) * 2;
  const candidates = outliers.values
    .flatMap((value, i) => {
      if (!Number.isFinite(value) || value >= 0) return [];
      const [x1, y1, x2, y2] = pixelBounds(delta, i);
      const point = unproject([(x1 + x2) / 2, (y1 + y2) / 2]);
      if (!containsPoint(geometry, point)) return [];
      return [{ point, value, index: i }];
    })
    .sort((a, b) => a.value - b.value);
  const footprint = parcelFootprints(delta, geometry);
  const targets = [];
  for (const candidate of candidates) {
    const local = frame.local(candidate.point);
    if (
      targets.some(
        (item) =>
          Math.hypot(...difference(local, frame.local(item.point))) < spacing,
      )
    )
      continue;
    const clipped = footprint(candidate.index);
    if (clipped)
      targets.push({
        point: candidate.point,
        value: candidate.value,
        geometry: clipped.geometry,
        squareMeters: clipped.squareMeters,
      });
    if (targets.length === 8) break;
  }
  return { delta, targets };
}

export function suggestRoute(geometry, targets) {
  if (!targets.length) return [];
  const frame = metricFrame(geometry);
  const route = [targets[0].point],
    remaining = targets.slice(1);
  while (remaining.length) {
    const start = route.at(-1);
    remaining.sort(
      (a, b) =>
        Math.hypot(...difference(frame.local(a.point), frame.local(start))) -
        Math.hypot(...difference(frame.local(b.point), frame.local(start))),
    );
    const index = remaining.findIndex(
      ({ point }) =>
        Math.hypot(...difference(frame.local(point), frame.local(start))) >=
          1 &&
        segmentInside(geometry, start, point) &&
        segmentInside(geometry, point, route[0]),
    );
    if (index < 0) break;
    route.push(remaining.splice(index, 1)[0].point);
  }
  return route;
}

export function planSimulation(
  geometry,
  points,
  { altitude, speed, endurance },
) {
  if (points.length < 2 || points.length > maximumWaypoints)
    return { error: "En az 2, en çok 24 rota noktası ekle." };
  if (
    ![altitude, speed, endurance].every(Number.isFinite) ||
    altitude < 5 ||
    altitude > 120 ||
    speed < 1 ||
    speed > 15 ||
    endurance < 5 ||
    endurance > 60
  )
    return {
      error:
        "Simülasyon irtifası 5–120 m, hız 1–15 m/sn ve süre bütçesi 5–60 dk olmalı.",
    };
  if (
    points.some((point) => !position(point) || !containsPoint(geometry, point))
  )
    return { error: "Tüm rota noktaları parsel sınırının içinde olmalı." };
  const route = [...points, points[0]],
    frame = metricFrame(geometry);
  if (
    route.slice(1).some((point, i) => !segmentInside(geometry, route[i], point))
  )
    return {
      error: "Bir rota parçası parselden çıkıyor veya iç boşluktan geçiyor.",
    };
  let clock = altitude / 1.8,
    distance = 0;
  const legs = [];
  for (let i = 1; i < route.length; i++) {
    const [east, south] = difference(
      frame.local(route[i]),
      frame.local(route[i - 1]),
    );
    const metres = Math.hypot(east, south);
    if (metres < 1)
      return { error: "Ardışık rota noktaları arasında en az 1 metre olmalı." };
    const heading = ((Math.atan2(east, -south) * 180) / Math.PI + 360) % 360;
    const previous = legs.at(-1);
    const turn = previous
      ? ((heading - previous.heading + 540) % 360) - 180
      : 0;
    const turnTime = Math.abs(turn) / 60;
    const seconds = metres / speed;
    const travel = seconds + Math.min(2, seconds);
    legs.push({
      from: route[i - 1],
      to: route[i],
      heading,
      turn,
      start: clock,
      turnTime,
      travel,
      metres,
    });
    clock += travel + turnTime;
    distance += metres;
  }
  const duration = clock + altitude / 1.4,
    reserve = 100 - (duration / (endurance * 60)) * 100;
  if (reserve < 20)
    return {
      error:
        "Tahmini süre bütçesi %20 batarya rezervini korumuyor. Rotayı kısalt veya varsayımı değiştir.",
    };
  return {
    route,
    legs,
    altitude,
    speed,
    endurance,
    duration,
    distance,
    reserve,
    landing: clock,
  };
}

export function flightFrame(plan, seconds) {
  const t = Math.max(0, Math.min(plan.duration, seconds));
  const leg = plan.legs.find(
    (item) => t <= item.start + item.turnTime + item.travel,
  );
  let point = plan.route[0],
    heading = leg?.heading ?? plan.legs.at(-1).heading;
  let altitude = 0,
    speed = 0,
    vertical = 0,
    phase = "Tamamlandı";
  if (t < plan.legs[0].start) {
    phase = "Kalkış";
    altitude = t * 1.8;
    vertical = 1.8;
  } else if (t >= plan.landing) {
    altitude = Math.max(0, (plan.duration - t) * 1.4);
    if (t < plan.duration) {
      phase = "İniş";
      vertical = -1.4;
    }
  } else if (leg) {
    altitude = plan.altitude;
    point = leg.from;
    const offset = t - leg.start - leg.turnTime;
    if (offset < 0) {
      phase = "Dönüş";
      heading =
        (leg.heading -
          leg.turn * (1 - clamp((t - leg.start) / leg.turnTime)) +
          360) %
        360;
    } else {
      phase = leg.to === plan.route[0] ? "Eve dönüş" : "Saha taraması";
      const ramp = Math.min(2, leg.travel / 2),
        cruise = leg.travel - ramp;
      const progress =
        offset < ramp
          ? offset ** 2 / (2 * ramp * cruise)
          : offset > cruise
            ? 1 - (leg.travel - offset) ** 2 / (2 * ramp * cruise)
            : (offset - ramp / 2) / cruise;
      point = mix(leg.from, leg.to, clamp(progress));
      speed =
        (leg.metres / cruise) *
        Math.min(1, offset / ramp, (leg.travel - offset) / ramp);
    }
  }
  return {
    point,
    heading,
    altitude,
    speed: Math.max(0, speed),
    vertical,
    phase,
    battery: 100 - (t / (plan.endurance * 60)) * 100,
  };
}
export function indexOutlook(observations, metric) {
  if (!["NDVI", "NDMI", "NDRE"].includes(metric) || observations.length < 16)
    return null;
  const series = observations
    .slice(-24)
    .map((item) => [Date.parse(item.date) / 86400000, item.metrics[metric]]);
  const gaps = series.slice(1).map(([time], i) => time - series[i][0]);
  if (
    gaps.some((gap) => gap < 1 || gap > 22) ||
    series.at(-1)[0] - series[0][0] < 35
  )
    return null;
  const step = Math.round(
    gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)],
  );
  const held = series
    .slice(6)
    .map(([time, value], index) => {
      const prior = series[index + 5];
      return time - prior[0] <= step * 1.5 ? Math.abs(value - prior[1]) : null;
    })
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (held.length < 10) return null;
  const [time, value] = series.at(-1);
  const error = held[Math.ceil(held.length * 0.9) - 1];
  return {
    date: new Date((time + step) * 86400000).toISOString().slice(0, 10),
    value,
    low: Math.max(-1, value - error),
    high: Math.min(1, value + error),
    checks: held.length,
  };
}

// Geographic geometry for a nadir camera over a local horizontal reference plane.
// This model does not project over terrain or produce an orthophoto.
export function cameraFootprint(
  frame,
  telemetry,
  fov = { horizontal: 66, vertical: 48 },
) {
  if (!telemetry || telemetry.altitude <= 0.5) return null;
  const [east, south] = frame.local(telemetry.point);
  const heading = (telemetry.heading * Math.PI) / 180;
  const halfWidth =
    telemetry.altitude * Math.tan((fov.horizontal * Math.PI) / 360);
  const halfLength =
    telemetry.altitude * Math.tan((fov.vertical * Math.PI) / 360);
  const corners = [
    [-halfWidth, -halfLength],
    [halfWidth, -halfLength],
    [halfWidth, halfLength],
    [-halfWidth, halfLength],
  ].map(([x, y]) =>
    frame.coordinate(
      east + Math.cos(heading) * x - Math.sin(heading) * y,
      south + Math.sin(heading) * x + Math.cos(heading) * y,
    ),
  );
  return { type: "Polygon", coordinates: [[...corners, corners[0]]] };
}

export function simulationTrace(plan, seconds, point) {
  if (!plan || plan.error) return [];
  const trace = [
    plan.route[0],
    ...plan.legs
      .filter((leg) => leg.start + leg.turnTime + leg.travel <= seconds)
      .map((leg) => leg.to),
  ];
  if (Math.hypot(...difference(trace.at(-1), point)) > 1e-10) trace.push(point);
  return trace;
}

export function routeGroundProfile(plan, frame, terrain) {
  if (
    plan?.error ||
    !plan?.legs?.length ||
    typeof terrain?.sample !== "function" ||
    !Number.isFinite(terrain.resolution) ||
    terrain.resolution <= 0
  )
    return null;
  const spacing = Math.max(terrain.resolution, plan.distance / 180);
  let distance = 0;
  const samples = plan.legs.flatMap((leg, index) => {
    const start = frame.local(leg.from),
      end = frame.local(leg.to);
    const divisions = Math.max(1, Math.ceil(leg.metres / spacing));
    const offset = distance;
    distance += leg.metres;
    return Array.from({ length: divisions + (index === 0 ? 1 : 0) }, (_, i) => {
      const progress = (i + (index === 0 ? 0 : 1)) / divisions;
      const elevation = terrain.sample(...mix(start, end, progress));
      return {
        distance: offset + leg.metres * progress,
        elevation: Number.isFinite(elevation) ? elevation : null,
      };
    });
  });
  const heights = samples.map((item) => item.elevation).filter(Number.isFinite);
  return {
    samples,
    spacing,
    coverage: heights.length / samples.length,
    minimum: heights.length ? Math.min(...heights) : null,
    maximum: heights.length ? Math.max(...heights) : null,
  };
}
