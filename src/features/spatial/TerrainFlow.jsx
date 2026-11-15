import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Compass, Droplets } from "lucide-react";
import { screenTerrainFlow } from "../../../shared/terrain-flow";
import { metricFrame, project } from "../../../shared/spatial";
import { useDroneTerrain } from "./DroneTerrain";
import { useDroneTerrainSource, useTerrainSample } from "./map-terrain";
import { SpatialBoundary, useMedia } from "./SpatialWorkbench";
import ParcelMap from "../fields/ParcelMap";
import "./terrain-flow.css";

const GeospatialMap = lazy(() => import("./GeospatialMap"));
const palette = [
  [37, 73, 68],
  [83, 161, 151],
  [222, 245, 173],
];
const fmt = (value) =>
  value.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

export default function TerrainFlow({ field, geometryHash, commercial }) {
  const frame = useMemo(() => metricFrame(field.geometry), [field.geometry]);
  const compact = useMedia("(max-width: 700px)"),
    reduced = useMedia("(prefers-reduced-motion: reduce)");
  const [retry, setRetry] = useState(0),
    [flat, setFlat] = useState(false),
    [failed, setFailed] = useState(false);
  const [command, setCommand] = useState(null),
    [point, setPoint] = useState(null),
    [map, setMap] = useState(null);
  const [showDirections, setShowDirections] = useState(true);
  const drone = useDroneTerrain(
    field.id,
    geometryHash,
    frame,
    !!commercial,
    true,
    false,
  );
  const dem = useTerrainSample(frame, true, retry);
  const terrainDefinition = useDroneTerrainSource(frame, drone.dtm, dem);
  // Use one DEM per calculation. Blending grids can create artificial slopes.
  const terrain = drone.dtm ?? (dem?.sample ? dem : null);
  const output = useMemo(
    () => terrain && screenTerrainFlow(frame, terrain, field.geometry),
    [frame, terrain, field.geometry],
  );
  const raster = useMemo(() => {
    if (!output) return null;
    const { origin, width, height, spacing, cells } = output;
    return {
      width,
      height,
      bounds: [
        ...project(frame.coordinate(origin[0], origin[1] + height * spacing)),
        ...project(frame.coordinate(origin[0] + width * spacing, origin[1])),
      ],
      values: cells.map((cell) => (cell ? Math.log1p(cell.cells) : null)),
    };
  }, [frame, output]);
  const scale = useMemo(
    () => (output ? { min: 0, max: Math.log1p(output.peak), palette } : null),
    [output],
  );
  useEffect(() => {
    if (!map || !output || !showDirections) return;
    const maxArrows = compact ? 90 : 180;
    const candidates = output.cells
      .filter(
        (cell) => cell?.downstream !== null && cell?.downstream !== undefined,
      )
      .sort((a, b) => b.cells - a.cells)
      .slice(0, maxArrows);
    const features = candidates.flatMap((cell) => {
      const next = output.cells[cell.downstream];
      const [x, y] = cell.local,
        [dx, dy] = [next.local[0] - x, next.local[1] - y];
      const head = frame.coordinate(x + dx * 0.8, y + dy * 0.8);
      return [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              frame.coordinate(
                x + dx * 0.4 - dy * 0.18,
                y + dy * 0.4 + dx * 0.18,
              ),
              head,
              frame.coordinate(
                x + dx * 0.4 + dy * 0.18,
                y + dy * 0.4 - dx * 0.18,
              ),
            ],
          },
        },
      ];
    });
    map.addSource("flow-arrows", {
      type: "geojson",
      data: { type: "FeatureCollection", features },
    });
    map.addLayer({
      id: "flow-arrows",
      type: "line",
      source: "flow-arrows",
      paint: {
        "line-color": "#e6faf4",
        "line-width": 1.2,
        "line-opacity": 0.75,
      },
    });
    return () => {
      if (!map.getStyle()) return;
      if (map.getLayer("flow-arrows")) map.removeLayer("flow-arrows");
      if (map.getSource("flow-arrows")) map.removeSource("flow-arrows");
    };
  }, [map, output, showDirections, frame, compact]);
  const selection =
    point &&
    output?.cells.find(
      (cell) =>
        cell &&
        Math.abs(cell.local[0] - point[0]) <= output.spacing / 2 &&
        Math.abs(cell.local[1] - point[1]) <= output.spacing / 2,
    );
  const fallback = (
    <ParcelMap geometry={field.geometry} height={compact ? 340 : 470} compact />
  );
  return (
    <section className="terrain-flow" aria-label="Topoğrafik su akışı">
      <header>
        <div>
          <small>
            <Droplets size={16} /> TOPOĞRAFYA
          </small>
          <h2>Yüzey akışı</h2>
          <p>Yüksekliğe göre aşağı yönü ve birikimi parsel içinde göster.</p>
        </div>
        <div className="terrain-flow-tools">
          {!failed && (
            <>
              <button
                aria-pressed={!flat}
                onClick={() => {
                  setFlat(false);
                  setCommand({ type: "tilt" });
                }}
              >
                3D
              </button>
              <button
                aria-pressed={flat}
                onClick={() => {
                  setFlat(true);
                  setCommand({ type: "top" });
                }}
              >
                2D
              </button>
              <button
                aria-label="Parseli kadrajla"
                onClick={() => setCommand({ type: "fit" })}
              >
                <Compass size={16} />
              </button>
            </>
          )}
          <button
            aria-pressed={showDirections}
            disabled={!output || failed}
            onClick={() => setShowDirections((v) => !v)}
          >
            Akış yönü
          </button>
        </div>
      </header>
      {drone.ready.some((dataset) => dataset.layers?.dtm) && (
        <label>
          Yükseklik kaynağı
          <select
            value={drone.selected?.id || "satellite"}
            onChange={(event) => {
              drone.choose(event.target.value);
              setPoint(null);
            }}
          >
            <option value="satellite">Bölgesel DEM</option>
            {drone.ready
              .filter((dataset) => dataset.layers?.dtm)
              .map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.capturedOn} · {dataset.source}
                </option>
              ))}
          </select>
        </label>
      )}
      {(drone.error || drone.loadError) && (
        <p role="alert">{drone.error || drone.loadError}</p>
      )}
      {drone.selected && !drone.dtm && !drone.error && !drone.loadError && (
        <p role="status">
          Drone yükseklik verisi bekleniyor. Bölgesel DEM görünümü
          kullanılabilir.
        </p>
      )}
      {!terrain && !dem?.error && (
        <p role="status">Yükseklik verileri alınıyor…</p>
      )}
      {!terrain && dem?.error && (
        <div role="alert">
          Yükseklik verisi alınamadı.{" "}
          <button onClick={() => setRetry((value) => value + 1)}>
            Tekrar dene
          </button>
        </div>
      )}
      {terrain && !output && (
        <p role="status">
          Bu parselde akış taraması için en az dokuz geçerli DEM hücresi
          gerekiyor.
        </p>
      )}
      <div className="terrain-flow-map">
        <SpatialBoundary fallback={fallback}>
          {failed ? (
            fallback
          ) : (
            <Suspense fallback={<p role="status">Harita açılıyor…</p>}>
              <GeospatialMap
                field={field}
                frame={frame}
                terrain={!flat && !!output}
                flat={flat}
                command={command}
                compact={compact}
                reduced={reduced}
                terrainDefinition={terrainDefinition}
                droneImagery={drone.imagery}
                raster={raster}
                scale={scale}
                opacity={0.65}
                onMapReady={setMap}
                onError={() => {
                  setFailed(true);
                  setMap(null);
                }}
                onPoint={({ coordinate }) => setPoint(frame.local(coordinate))}
              />
            </Suspense>
          )}
        </SpatialBoundary>
      </div>
      {output && (
        <dl className="terrain-flow-facts">
          <div>
            <dt>Kullanılan DEM</dt>
            <dd>
              {terrain.drone
                ? "Drone yükseklik modeli"
                : "Mapzen Terrain Tiles"}
            </dd>
          </div>
          <div>
            <dt>Örnekleme aralığı</dt>
            <dd>{fmt(output.spacing)} m</dd>
          </div>
          <div>
            <dt>İç akış sonu</dt>
            <dd>{output.interiorLows} hücre</dd>
          </div>
          <div>
            <dt>Seçili hücre</dt>
            <dd>
              {selection
                ? `${fmt(selection.elevation)} m yükseklik · %${fmt(selection.slope * 100)} en dik iniş · ${selection.cells} katkı hücresi`
                : "Haritada bir noktayı seç"}
            </dd>
          </div>
        </dl>
      )}
      <p>
        Koyu renkten açık renge doğru parsel içinden katkı yapan hücre sayısı
        artar. Tarama yağmur miktarını, debiyi, erozyonu veya parsel dışından
        gelen suyu hesaplamaz.
      </p>
    </section>
  );
}
