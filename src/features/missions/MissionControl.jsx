import useWorkspaceSync from "../../sync/useWorkspaceSync";
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  Compass,
  Crosshair,
  Drone,
  FileCheck2,
  Layers3,
  MapPin,
  Maximize2,
  Minus,
  Mountain,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Route,
  Satellite,
  X,
} from "lucide-react";
import { api } from "../../api";
import { containsPoint, metricFrame } from "../../../shared/spatial";
import { indices } from "../../../shared/metrics";
import { mergeMissionRecords } from "../../../shared/mission-evidence";
import {
  maximumWaypoints,
  planSimulation,
  flightFrame,
  indexOutlook,
  reviewTargets,
  suggestRoute,
  segmentInside,
} from "../../../shared/drone-mission";
import { droneConnectionProfiles } from "../../../shared/contracts/drone-link";
import {
  SpatialBoundary,
  useMedia,
  useRaster,
} from "../spatial/SpatialWorkbench";
import { useDroneTerrain } from "../spatial/DroneTerrain";
import {
  useDroneTerrainSource,
  useTerrainSample,
} from "../spatial/map-terrain";
import { colorScale } from "../spatial/colors";
import {
  useAircraft,
  useAircraftMarker,
  useMissionCamera,
  useMissionOverlays,
  useMissionRoute,
  useWaypointHandles,
} from "./mission-map";
import MissionFallback from "./MissionFallback";
import RouteElevation from "./RouteElevation";
import MissionFeedback from "./MissionFeedback";
import MissionHud from "./MissionHud";
import QgcPlanPanel from "./QgcPlanPanel";
import useMissionClock from "./useMissionClock";
import "./mission.css";

const Terrain = lazy(() => import("../spatial/GeospatialMap"));
const LiveTelemetry = lazy(() => import("./LiveTelemetry"));
const empty = [];
const priorityMetrics = ["NDVI", "NDMI", "NDRE", "EVI"];
const defaults = { altitude: 35, speed: 5, endurance: 22 };
const fmt = (value, digits = 1) =>
  Number.isFinite(value)
    ? value.toLocaleString("tr-TR", { maximumFractionDigits: digits })
    : "—";
const coordinates = (point) =>
  point.map((value) => value.toFixed(6)).join(", ");
const comparable = (a, b) => a.provider === b.provider && a.method === b.method;
const missionPanels = [
  { id: "plan", label: "Görev planı", short: "Görev", icon: Route },
  {
    id: "qgc",
    label: "QGroundControl planı",
    short: ".plan",
    icon: ArrowDownToLine,
  },
  { id: "layers", label: "Harita katmanları", short: "Katman", icon: Layers3 },
  { id: "telemetry", label: "Telemetri", short: "Uçuş", icon: Activity },
  {
    id: "inspect",
    label: "İnceleme ve geçmiş",
    short: "İnceleme",
    icon: FileCheck2,
  },
];

const ObservationHistory = memo(function ObservationHistory({
  observations,
  metric,
  onNavigate,
  fieldId,
}) {
  const latest = observations.find((item) =>
    Number.isFinite(item.metrics[metric]),
  );
  const series = latest
    ? observations
        .filter(
          (item) =>
            comparable(item, latest) && Number.isFinite(item.metrics[metric]),
        )
        .slice(0, 24)
        .toReversed()
    : [];
  const outlook = indexOutlook(series, metric);
  const min = Math.min(...series.map((item) => item.metrics[metric])),
    max = Math.max(...series.map((item) => item.metrics[metric]));
  const start = Date.parse(series[0]?.date),
    span = Math.max(1, Date.parse(series.at(-1)?.date) - start);
  const points = series.map((item) => [
    22 + (410 * (Date.parse(item.date) - start)) / span,
    91 - (71 * (item.metrics[metric] - min)) / Math.max(0.003, max - min),
  ]);
  return (
    <section className="mission-history">
      <div>
        <h3>Tarla geçmişi · {metric}</h3>
        <p>
          {latest?.source || "Kayıtlı ölçüm yok."} · Aynı sağlayıcı ve yöntem
        </p>
      </div>
      {series.length > 1 ? (
        <>
          <svg
            viewBox="0 0 454 111"
            role="img"
            aria-label={metric + " gözlem geçmişi"}
          >
            {[20, 56, 91].map((y) => (
              <line key={y} x1="22" y1={y} x2="432" y2={y} />
            ))}
            <polyline
              points={points.map((point) => point.join(",")).join(" ")}
            />
            {points.map(([x, y], i) => (
              <circle key={series[i].date} cx={x} cy={y} r="3">
                <title>
                  {series[i].date} · {fmt(series[i].metrics[metric], 3)}
                </title>
              </circle>
            ))}
            <text x="22" y="107">
              {series[0].date}
            </text>
            <text x="432" y="107" textAnchor="end">
              {series.at(-1).date}
            </text>
          </svg>
          <details>
            <summary>Ölçüm tablosu</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Tarih</th>
                  <th scope="col">{metric}</th>
                </tr>
              </thead>
              <tbody>
                {series.map((item) => (
                  <tr key={item.date}>
                    <th scope="row">{item.date}</th>
                    <td>{fmt(item.metrics[metric], 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        <p>Zaman grafiği için en az iki uyumlu kayıt gerekir.</p>
      )}
      {outlook ? (
        <details>
          <summary>Kısa vadeli indeks senaryosu · {outlook.date}</summary>
          <p>
            {metric} {fmt(outlook.value, 3)} · geçmiş hata aralığı{" "}
            {fmt(outlook.low, 3)} – {fmt(outlook.high, 3)}
          </p>
          <p>
            Son değer sabit kalır varsayımı. Aralık, benzer aralıklı{" "}
            {outlook.checks} geçmiş adımın mutlak hata dağılımından hesaplandı.
            Kalibre güven aralığı veya verim tahmini içermez.
          </p>
        </details>
      ) : (
        <p>Kısa vadeli indeks senaryosu için yeterli ve düzenli gözlem yok.</p>
      )}
      <button
        className="mission-link"
        onClick={() => onNavigate("temporal", fieldId)}
      >
        Arazi hafızasını aç
      </button>
    </section>
  );
});

export default function MissionControl({
  field,
  fields = [field],
  onField,
  context,
  onNavigate,
  canWrite,
  droneEnabled,
  records = empty,
  initialSelection,
  externalDevice,
  onExternalTelemetry,
}) {
  const geometry = field.geometry;
  const compact = useMedia("(max-width: 760px)"),
    reduced = useMedia("(prefers-reduced-motion: reduce)");
  const frame = useMemo(() => metricFrame(geometry), [geometry]);
  const [map, setMap] = useState(null),
    [failed, setFailed] = useState(false);
  const [flat, setFlat] = useState(false),
    [command, setCommand] = useState({
      type: "mission-overview",
      instant: true,
    });
  const [panel, setPanel] = useState(null),
    [heading, setHeading] = useState(334),
    [pitch, setPitch] = useState(69);
  const [inspectionView, setInspectionView] = useState("review");
  const [basemap, setBasemap] = useState("");
  const panelButtons = useRef({}),
    stage = useRef(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [quality, setQuality] = useState("auto");
  const drone = useDroneTerrain(
    field.id,
    context.geometryHash,
    frame,
    !!droneEnabled && sourceMode,
    sourceMode,
    false,
  );
  const baseElevation = useTerrainSample(
    frame,
    sourceMode && !!drone.dtm && !flat,
  );
  const terrainDefinition = useDroneTerrainSource(
    frame,
    drone.dtm,
    baseElevation,
  );
  const [pointMode, setPointMode] = useState(false),
    [selectedPoint, setSelectedPoint] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [points, setPoints] = useState(empty),
    [settings, setSettings] = useState(defaults);
  const [provenance, setProvenance] = useState(null);
  const [catalog, setCatalog] = useState(null),
    [catalogError, setCatalogError] = useState("");
  const [metric, setMetric] = useState(initialSelection?.metric || "NDVI"),
    [scan, setScan] = useState(false),
    [showChange, setShowChange] = useState(true);
  const [layerMode, setLayerMode] = useState("difference");
  const [earlierDate, setEarlierDate] = useState(initialSelection?.earlier || "");
  const [primaryDate,setPrimaryDate] = useState(initialSelection?.date || "");
  const [notice, setNotice] = useState(""),
    [approved, setApproved] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const [aircraft, setAircraft] = useState("idle");
  const [cameraMode, setCameraMode] = useState("free"),
    [showFootprint, setShowFootprint] = useState(false);
  const [live, setLive] = useState(false),
    [device, setDevice] = useState(null),
    [sampledPoint, setSampledPoint] = useState(null);
  const [focusMode, setFocusMode] = useState(false),
    [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null),
    [saveError, setSaveError] = useState("");
  const syncRevision=useWorkspaceSync();
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [localRecords, setLocalRecords] = useState(empty);
  const allRecords = useMemo(
    () => mergeMissionRecords(records, localRecords),
    [records, localRecords],
  );
  const acceptRecords = useCallback(
    (items) =>
      setLocalRecords((previous) => mergeMissionRecords(previous, items)),
    [],
  );
  const refreshCatalog = useCallback(
    () => setCatalogRevision((value) => value + 1),
    [],
  );
  const savedReviews = allRecords.filter(
    (record) =>
      record.kind === "investigation" &&
      record.status !== "archived" &&
      record.payload.simulationReview?.geometryHash === context.geometryHash,
  );
  useEffect(() => {
    const controller = new AbortController();
    const query=new URLSearchParams();
    for(const id of new Set([initialSelection?.analysis,initialSelection?.priorAnalysis].filter(Boolean)))query.append("analysis",id);
    api("platform/fields/" + field.id + "/spatial" + (query.size?"?"+query:""), undefined, "GET", {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setCatalogError("");
          setCatalog(
            data.geometryHash === context.geometryHash
              ? data
              : { observations: [] },
          );
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setCatalogError(error.message);
      });
    return () => controller.abort();
  }, [field.id, context.geometryHash, catalogRevision, syncRevision,initialSelection?.analysis,initialSelection?.priorAnalysis]);
  const observations = catalog?.observations || empty;
  const metrics = useMemo(() => {
    const names = new Set(
      observations.flatMap((item) => [
        ...Object.keys(item.metrics),
        ...(item.available || empty),
      ]),
    );
    return [
      ...priorityMetrics,
      ...indices
        .map((item) => item.id)
        .filter((id) => names.has(id) && !priorityMetrics.includes(id)),
    ];
  }, [observations]);
  const available = observations.filter(
    (item) =>
      Number.isFinite(item.metrics[metric]) || item.available?.includes(metric),
  );
  const pinned=catalog?.pinnedObservations||empty;
  const newer = pinned.find(item=>item.date===primaryDate&&item.id===initialSelection?.analysis&&Number.isFinite(item.metrics[metric])) ||
    available.find(item=>item.date===primaryDate) || available[0];
  const earlierOptions = available.filter(
    (item) => item.date < newer.date && comparable(item, newer),
  );
  const earlier =
    pinned.find(item=>item.date===earlierDate&&item.id===initialSelection?.priorAnalysis&&item.date<newer?.date&&comparable(item,newer)&&Number.isFinite(item.metrics[metric])) ||
    earlierOptions.find((item) => item.date === earlierDate) ||
    earlierOptions[0];
  const latestRaster = useRaster(
    field.id,
    context.geometryHash,
    newer,
    metric,
    scan && !!earlier,
  );
  const priorRaster = useRaster(
    field.id,
    context.geometryHash,
    earlier,
    metric,
    scan && !!earlier,
  );
  const findings = useMemo(
    () => reviewTargets(latestRaster.data, priorRaster.data, geometry),
    [latestRaster.data, priorRaster.data, geometry],
  );
  const raster =
    scan && showChange
      ? {
          difference: findings?.delta,
          current: latestRaster.data,
          previous: priorRaster.data,
        }[layerMode]
      : null;
  const palette = useMemo(
    () =>
      raster
        ? colorScale(
            raster,
            layerMode === "difference"
              ? null
              : priorRaster.data === raster
                ? latestRaster.data
                : priorRaster.data,
            layerMode === "difference",
          )
        : null,
    [raster, layerMode, latestRaster.data, priorRaster.data],
  );
  const zones = useMemo(
    () =>
      findings?.targets.map((target, index) => ({
        id: "review-" + index,
        geometry: target.geometry,
      })) ?? empty,
    [findings],
  );
  const plan = useMemo(
    () =>
      planSimulation(
        geometry,
        points,
        Object.fromEntries(
          Object.entries(settings).map(([key, value]) => [key, Number(value)]),
        ),
      ),
    [geometry, points, settings],
  );
  const { elapsed, playing, rate, setElapsed, setPlaying, setRate, clock } =
    useMissionClock(plan.error ? 0 : plan.duration);
  const telemetry = plan.error ? null : flightFrame(plan, elapsed);
  const route = useMemo(
    () => plan.route ?? (points.length > 1 ? [...points, points[0]] : empty),
    [plan, points],
  );
  useMissionRoute(
    map,
    panel === "qgc" ? empty : route,
    panel === "qgc" ? empty : points,
  );
  useWaypointHandles(
    map,
    route,
    points,
    pointMode && !playing && !saving && !live,
    (index, point) => {
      const next = points.map((value, i) => (i === index ? point : value));
      if (
        !containsPoint(geometry, point) ||
        (next.length > 1 &&
          (!segmentInside(
            geometry,
            next[(index + next.length - 1) % next.length],
            point,
          ) ||
            !segmentInside(geometry, point, next[(index + 1) % next.length])))
      ) {
        setNotice(
          "Nokta ve bağlantıları parsel sınırının içinde kalmalı. Önceki konum korundu.",
        );
        return false;
      }
      setSelectedPoint(null);
      setRoute(next);
      setNotice(
        `Nokta ${index + 1} taşındı. Değişen rotayı yeniden simüle et.`,
      );
      return true;
    },
  );
  const simulation = live || externalDevice?.state === "ready" || panel === "qgc" ? null : telemetry;
  const shownDevice = externalDevice || device;
  const devicePosition = shownDevice?.state === 'ready' ? shownDevice.position : null;
  const liveMarker = useMemo(
    () =>
      devicePosition && {
        point: [devicePosition.longitude, devicePosition.latitude],
        heading: devicePosition.headingDegrees,
        live: true,
      },
    [devicePosition],
  );
  useMissionOverlays(map, frame, plan, simulation, elapsed, showFootprint);
  useMissionCamera(map, plan, simulation, elapsed, cameraMode, reduced, flat);
  useAircraft(
    map,
    simulation,
    !flat && !!simulation,
    setAircraft,
    cameraMode === "chase",
    reduced ? 0 : elapsed,
    clock,
    plan,
    reduced,
  );
  useAircraftMarker(
    map,
    live ? liveMarker : simulation,
    live ? !!liveMarker : !!simulation && (flat || aircraft !== "ready"),
  );
  const [longitude, setLongitude] = useState("");
  const [latitude, setLatitude] = useState("");

  useEffect(() => {
    if (!plan.error && elapsed >= plan.duration) {
      setPlaying(false);
      setReviewed(true);
    }
  }, [elapsed, plan]);

  useEffect(() => {
    if (!focusMode && !panel) return;
    const close = (event) => {
      if (event.defaultPrevented || event.key !== "Escape") return;
      if (focusMode) setFocusMode(false);
      else {
        setPanel(null);
        if (stage.current?.contains(document.activeElement))
          panelButtons.current[panel]?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [focusMode, panel]);
  useEffect(() => {
    if (!focusMode) return;
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    const exit = stage.current?.querySelector('[aria-label="Odaktan çık"]');
    exit?.focus();
    const contain = (event) => {
      if (event.key !== "Tab") return;
      const items = [
        ...stage.current.querySelectorAll(
          "button,select,input,textarea,summary,a[href],[tabindex]",
        ),
      ].filter(
        (node) =>
          !node.disabled && node.tabIndex >= 0 && node.getClientRects().length,
      );
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", contain);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", contain);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [focusMode]);

  function resetFlight() {
    setPlaying(false);
    setElapsed(0);
    setApproved(false);
    setReviewed(false);
    setSaved(null);
    setSaveError("");
  }
  function setRoute(next, source = null) {
    setPoints(next);
    setProvenance(source);
    resetFlight();
  }
  function editMap(point, fromForm = false) {
    if ((!pointMode && !fromForm) || playing || saving || live) return;
    if (!containsPoint(geometry, point)) {
      setNotice("Noktayı parsel sınırının içine yerleştir.");
      return;
    }
    if (selectedPoint !== null) {
      setRoute(
        points.map((previous, index) =>
          index === selectedPoint ? point : previous,
        ),
      );
      setSelectedPoint(null);
    } else if (points.length < maximumWaypoints) setRoute([...points, point]);
    setNotice("");
  }
  function generateRoute() {
    const candidates =
      points.length === 1
        ? [{ point: points[0] }, ...findings.targets]
        : findings.targets;
    const proposed = suggestRoute(geometry, candidates);
    if (proposed.length < 2) {
      setNotice(
        "Birbirine parsel içinde bağlanabilen en az iki inceleme noktası bulunamadı. Haritada elle nokta ekleyebilirsin.",
      );
      return;
    }
    setSelectedPoint(null);
    setRoute(proposed, {
      metric,
      current: { analysisId: newer.id, date: newer.date },
      previous: { analysisId: earlier.id, date: earlier.date },
      provider: newer.provider,
      method: newer.method,
    });
    setNotice(proposed.length + " uydu inceleme noktası rotaya eklendi.");
  }
  function exportReview() {
    if (!approved || !reviewed || plan.error) return;
    const file = {
      schema: "agromax.drone-review.v1",
      usage: "simulation-review",
      machineExecution: false,
      fieldId: field.id,
      geometryVersion: context.geometryHash,
      crs: "EPSG:4326",
      route: { type: "LineString", coordinates: plan.route },
      assumptions: {
        heightM: plan.altitude,
        speedMps: plan.speed,
        enduranceMinutes: plan.endurance,
      },
      batteryReservePercent: plan.reserve,
      ...(provenance && { satelliteContext: provenance }),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "agromax-gorev-inceleme.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function saveReview() {
    if (
      !canWrite ||
      !approved ||
      !reviewed ||
      plan.error ||
      saving ||
      saved ||
      playing
    )
      return;
    setSaving(true);
    setSaveError("");
    try {
      const response = await api("platform/records", {
        fieldId: field.id,
        kind: "investigation",
        name: "Drone simülasyonu · saha incelemesi",
        status: "draft",
        payload: {
          priority: "normal",
          region: "Parsel içi simülasyon rotası",
          state: "open",
          requestedData:
            "Uydu değişimini saha fotoğrafları ve mümkünse tarihli ölçümlerle doğrula.",
          notes: "Bu kayıt simülasyon incelemesidir.",
          coordinate: points[0],
          analysisId: provenance?.current.analysisId,
          simulationReview: {
            geometryHash: context.geometryHash,
            waypoints: points,
            settings: {
              altitude: plan.altitude,
              speed: plan.speed,
              endurance: plan.endurance,
            },
            satellite: provenance ?? undefined,
          },
        },
      });
      setSaved(response.record.id);
      acceptRecords([response.record]);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  }
  function restoreReview(id) {
    const record = savedReviews.find((item) => item.id === id);
    if (!record) return;
    const {
      waypoints,
      settings: previous,
      satellite,
    } = record.payload.simulationReview;
    setSettings(previous);
    setSelectedPoint(null);
    setRoute(waypoints, satellite ?? null);
    setNotice("Kayıtlı simülasyon rotası tekrar açıldı.");
  }
  function switchMode(next) {
    if (live === next) return;
    setPlaying(false);
    setPointMode(false);
    setSelectedPoint(null);
    setDevice(null);
    setLive(next);
    openPanel("telemetry", true);
  }
  function openPanel(id, keepOpen = false) {
    if (id === "qgc") {
      setPlaying(false);
      setPointMode(false);
      setSelectedPoint(null);
    }
    const open = keepOpen || panel !== id;
    setPanel(open ? id : null);
    if (compact && open) {
      requestAnimationFrame(() => {
        document
          .getElementById("mission-panel-" + id)
          ?.parentElement?.scrollIntoView({
            block: "nearest",
            behavior: "instant",
          });
      });
    }
  }
  function view(type) {
    if (!["in", "out"].includes(type)) setCameraMode("free");
    if (type === "top") setFlat(true);
    else if (type === "mission-overview" || type === "slope") setFlat(false);
    setCommand({ type });
  }
  function play() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (elapsed >= plan.duration) resetFlight();
    setPointMode(false);
    setSelectedPoint(null);
    setPlaying(true);
  }
  const fallback = (
    <MissionFallback
      geometry={geometry}
      points={panel === "qgc" ? empty : points}
      route={panel === "qgc" ? empty : route}
      telemetry={live ? liveMarker : simulation}
      onPoint={editMap}
    />
  );
  return (
    <section className="mission-control" aria-label="Drone Görev Kontrolü">
      <header className="mission-heading">
        <div className="mission-title">
          <span className="mission-insignia">
            <Drone size={22} />
          </span>
          <div>
            <small>AGROMAX / HAVACILIK</small>
            <h1>Drone Görev Kontrolü</h1>
          </div>
        </div>
        <label className="mission-parcel">
          <MapPin size={16} />
          <span>Görev parseli</span>
          <select
            aria-label="Platform parseli"
            value={field.id}
            onChange={(event) => onField?.(event.target.value)}
          >
            {fields.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mission-badges" role="group" aria-label="Görev modu">
          <button aria-pressed={!live} onClick={() => switchMode(false)}>
            <Drone size={16} /> Simülasyon
          </button>
          <button aria-pressed={live} onClick={() => switchMode(true)}>
            <Radio size={16} /> Canlı cihaz
          </button>
        </div>
      </header>
      <div
        className={`mission-flightdeck ${focusMode ? "mission-theatre" : ""}`}
        ref={stage}
        data-panel={panel || "closed"}
      >
        <nav className="mission-panel-rail" aria-label="Görev panelleri">
          {missionPanels.map(({ id, label, short, icon: Icon }) => (
            <button
              key={id}
              ref={(node) => {
                panelButtons.current[id] = node;
              }}
              aria-label={label}
              aria-expanded={panel === id}
              aria-controls={`mission-panel-${id}`}
              onClick={() => openPanel(id)}
            >
              <Icon size={17} />
              <span>{short}</span>
            </button>
          ))}
        </nav>
        <div className="mission-drawer" hidden={!panel}>
          {panel && (
            <div className="mission-drawer-heading">
              <h2>{missionPanels.find((item) => item.id === panel).label}</h2>
              <button
                aria-label="Paneli kapat"
                onClick={() => {
                  setPanel(null);
                  panelButtons.current[panel]?.focus();
                }}
              >
                <X size={17} />
              </button>
            </div>
          )}
          <div
            className="mission-drawer-body"
            id="mission-panel-qgc"
            hidden={panel !== "qgc"}
          >
            <QgcPlanPanel
              key={field.id + context.geometryHash}
              field={field}
              geometryHash={context.geometryHash}
              map={map}
              active={panel === "qgc"}
              records={allRecords}
              points={points}
              findings={findings}
              newer={newer}
              metric={metric}
              canWrite={canWrite}
              onRecords={acceptRecords}
            />
          </div>
          <div
            className="mission-drawer-body"
            id="mission-panel-plan"
            hidden={panel !== "plan"}
          >
            <section className="mission-tools">
              <label>
                Uydu indeksi
                <select
                  value={metric}
                  onChange={(event) => {
                    setMetric(event.target.value);
                    setPrimaryDate("");
                    setEarlierDate("");
                    setScan(false);
                  }}
                >
                  {metrics.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              {earlier && (
                <label>
                  Önceki çekim
                  <select
                    value={earlier.date}
                    onChange={(event) => {
                      setEarlierDate(event.target.value);
                      setScan(false);
                    }}
                  >
                    {earlierOptions.map((item) => (
                      <option key={item.date}>{item.date}</option>
                    ))}
                  </select>
                </label>
              )}
              <button
                onClick={() => setScan(true)}
                disabled={
                  !earlier || latestRaster.loading || priorRaster.loading
                }
              >
                <Satellite size={16} /> Uydu farkını incele
              </button>
              {catalogError && (
                <p role="alert">
                  {catalogError}{" "}
                  <button
                    onClick={() => {
                      setCatalogError("");
                      setCatalogRevision((value) => value + 1);
                    }}
                  >
                    Tekrar dene
                  </button>
                </p>
              )}
              {catalog && (
                <button
                  onClick={() => {
                    setScan(false);
                    setCatalogRevision((value) => value + 1);
                  }}
                >
                  Çekimleri yenile
                </button>
              )}
              {catalog && !earlier && (
                <p>
                  {metric} için aynı yöntemle alınmış iki kayıtlı çekim gerekir.
                </p>
              )}
              {(latestRaster.loading || priorRaster.loading) && (
                <p role="status">Uydu pikselleri alınıyor…</p>
              )}
              {(latestRaster.error || priorRaster.error) && (
                <p role="alert">
                  {latestRaster.error || priorRaster.error}{" "}
                  <button
                    onClick={() => {
                      latestRaster.retry();
                      priorRaster.retry();
                    }}
                  >
                    Tekrar dene
                  </button>
                </p>
              )}
              {latestRaster.data && priorRaster.data && !findings && (
                <p role="status">
                  Uydu ızgaraları karşılaştırmaya uygun değil.
                </p>
              )}
              {scan && findings && (
                <div className="mission-findings">
                  <strong>{findings.targets.length} inceleme noktası</strong>
                  <small>
                    {earlier.date} → {newer.date} · {metric} azalışı. Saha
                    kontrolüyle doğrulanmalı.
                  </small>
                  {findings.targets.length === 1 && points.length !== 1 && (
                    <small>Tek hedef için önce bir kalkış noktası ekle.</small>
                  )}
                  <button
                    onClick={generateRoute}
                    disabled={
                      findings.targets.length + (points.length === 1 ? 1 : 0) <
                        2 ||
                      playing ||
                      saving ||
                      live
                    }
                  >
                    Önerilen rotayı oluştur
                  </button>
                </div>
              )}
              <button
                aria-pressed={pointMode}
                disabled={playing || saving || live}
                onClick={() => {
                  setPointMode(!pointMode);
                  setSelectedPoint(null);
                  if (!pointMode) {
                    setPanel(null);
                    stage.current?.scrollIntoView({ block: "nearest" });
                  }
                }}
              >
                <Crosshair size={16} /> Haritada nokta düzenle
              </button>
              <div className="mission-settings">
                {[
                  ["altitude", "İrtifa · m", 5, 120],
                  ["speed", "Hız · m/sn", 1, 15],
                  ["endurance", "Batarya bütçesi · dk", 5, 60],
                ].map(([key, label, min, max]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min={min}
                      max={max}
                      step="any"
                      disabled={saving || live}
                      value={settings[key]}
                      onChange={(event) => {
                        setSettings({ ...settings, [key]: event.target.value });
                        resetFlight();
                      }}
                    />
                  </label>
                ))}
              </div>
              {plan.error && (
                <p role="status" className="mission-plan-note">
                  {plan.error}
                </p>
              )}
              {notice && <p role="status">{notice}</p>}
            </section>
            <div className="mission-route-editor mission-side">
              <section>
                <h3>Rota noktaları</h3>
                {savedReviews.length > 0 && (
                  <label>
                    Kayıtlı simülasyonu aç
                    <select
                      value=""
                      disabled={playing || saving || live}
                      onChange={(event) => restoreReview(event.target.value)}
                    >
                      <option value="">Bir inceleme seç</option>
                      {savedReviews.map((record) => (
                        <option value={record.id} key={record.id}>
                          {new Date(record.updatedAt).toLocaleString("tr-TR")} ·{" "}
                          {record.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <details open={selectedPoint !== null || undefined}>
                  <summary>Koordinat gir</summary>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      editMap([Number(longitude), Number(latitude)], true);
                    }}
                  >
                    <label>
                      Boylam
                      <input
                        type="number"
                        step="any"
                        min="-180"
                        max="180"
                        required
                        value={longitude}
                        onChange={(event) => setLongitude(event.target.value)}
                      />
                    </label>
                    <label>
                      Enlem
                      <input
                        type="number"
                        step="any"
                        min="-85"
                        max="85"
                        required
                        value={latitude}
                        onChange={(event) => setLatitude(event.target.value)}
                      />
                    </label>
                    <button
                      disabled={
                        playing ||
                        saving ||
                        live ||
                        (selectedPoint === null &&
                          points.length >= maximumWaypoints)
                      }
                    >
                      {selectedPoint === null
                        ? "Koordinatı ekle"
                        : "Noktayı güncelle"}
                    </button>
                  </form>
                </details>
                {points.length ? (
                  <ol>
                    {points.map((point, index) => (
                      <li key={index}>
                        <strong>{index === 0 ? "Kalkış" : index + 1}</strong>
                        <small>{coordinates(point)}</small>
                        <div>
                          <button
                            disabled={playing || saving || live}
                            onClick={() => {
                              setPointMode(true);
                              setSelectedPoint(index);
                              setLongitude(String(point[0]));
                              setLatitude(String(point[1]));
                            }}
                          >
                            Taşı
                          </button>
                          <button
                            disabled={playing || saving || live}
                            onClick={() => {
                              setSelectedPoint(null);
                              setRoute(points.filter((_, i) => i !== index));
                            }}
                          >
                            Sil
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>Haritadan ekle veya uydu farkından rota oluştur.</p>
                )}
              </section>
            </div>
          </div>
          <div
            className="mission-drawer-body"
            id="mission-panel-layers"
            hidden={panel !== "layers"}
          >
            <label>
              Görüntü kalitesi
              <select
                value={quality}
                onChange={(event) => setQuality(event.target.value)}
              >
                <option value="auto">Otomatik</option>
                <option value="high">Yüksek</option>
                <option value="economy">Düşük güç tüketimi</option>
              </select>
            </label>
            <div className="mission-views">
              <button
                aria-pressed={showFootprint && !live}
                disabled={!simulation || failed}
                onClick={() => setShowFootprint((value) => !value)}
              >
                Kamera görüş alanı
              </button>
              {droneEnabled && (
                <button
                  aria-pressed={sourceMode}
                  onClick={() => setSourceMode((value) => !value)}
                >
                  Drone görüntüleri
                </button>
              )}
              {sourceMode && (
                <label>
                  Harita kaynağı
                  <select
                    value={drone.selected?.id || "satellite"}
                    onChange={(event) => drone.choose(event.target.value)}
                  >
                    <option value="satellite">Uydu ve standart DEM</option>
                    {drone.ready.map((dataset) => (
                      <option key={dataset.id} value={dataset.id}>
                        {dataset.capturedOn} · {dataset.source}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {sourceMode && !drone.catalog && (
                <small>Drone veri setleri yükleniyor…</small>
              )}
              {sourceMode && drone.catalog && !drone.ready.length && (
                <small>
                  {drone.catalog.error ||
                    "Bu sınır için hazır drone veri seti yok."}
                </small>
              )}
              {sourceMode && (drone.error || drone.loadError) && (
                <small role="status">{drone.error || drone.loadError}</small>
              )}
              {showFootprint && simulation && (
                <small>
                  Düz zemin varsayımı · 66° × 48° · simülasyon kamerası
                </small>
              )}
            </div>
            {scan && findings && !failed && (
              <div className="mission-layer">
                <label>
                  Uydu katmanı
                  <select
                    value={showChange ? layerMode : "none"}
                    onChange={(event) => {
                      const next = event.target.value;
                      setShowChange(next !== "none");
                      if (next !== "none") setLayerMode(next);
                    }}
                  >
                    <option value="difference">
                      {metric} farkı · {newer.date} − {earlier.date}
                    </option>
                    <option value="current">
                      {metric} · {newer.date}
                    </option>
                    <option value="previous">
                      {metric} · {earlier.date}
                    </option>
                    <option value="none">Sadece uydu görüntüsü</option>
                  </select>
                </label>
                {palette && (
                  <div className="mission-legend">
                    <span>{fmt(palette.min, 3)}</span>
                    <i
                      aria-hidden="true"
                      style={{
                        background: `linear-gradient(90deg,${palette.palette.map((rgb) => "rgb(" + rgb.join(",") + ")").join(",")})`,
                      }}
                    />
                    <span>{fmt(palette.max, 3)}</span>
                  </div>
                )}
                {raster && sampledPoint?.raster === raster && (
                  <small>
                    Seçilen piksel ·{" "}
                    {Number.isFinite(sampledPoint.value)
                      ? fmt(sampledPoint.value, 3)
                      : "Veri yok"}
                  </small>
                )}
              </div>
            )}
          </div>
          <div
            className="mission-drawer-body mission-side"
            id="mission-panel-telemetry"
            hidden={panel !== "telemetry"}
          >
            {live ? (
              <Suspense
                fallback={<p role="status">Telemetri paneli açılıyor…</p>}
              >
                <LiveTelemetry onSample={setDevice} />
              </Suspense>
            ) : (
              <section>
                <h3>Simülasyon telemetrisi</h3>
                {telemetry ? (
                  <>
                    <strong className="mission-phase">{telemetry.phase}</strong>
                    <dl>
                      {[
                        ["İrtifa · AGL", fmt(telemetry.altitude) + " m"],
                        ["Yer hızı", fmt(telemetry.speed) + " m/sn"],
                        ["Yön", fmt(telemetry.heading, 0) + "°"],
                        ["Batarya varsayımı", "%" + fmt(telemetry.battery, 0)],
                        ["Rota uzunluğu", fmt(plan.distance, 0) + " m"],
                        ["WGS84 · boylam, enlem", coordinates(telemetry.point)],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <meter
                      min="0"
                      max="100"
                      value={telemetry.battery}
                      aria-label="Tahmini batarya"
                    />
                  </>
                ) : (
                  <p>İki geçerli nokta ekleyince telemetri açılır.</p>
                )}
              </section>
            )}
            <details>
              <summary>
                <Radio size={16} /> Cihaz bağlantıları
              </summary>
              {droneConnectionProfiles.map((profile) => (
                <p key={profile.name}>
                  <strong>{profile.name}</strong>
                  <br />
                  {profile.need}
                </p>
              ))}
              <p>
                USB üzerinden MAVLink ve yerel video alıcısı açılabilir.
                Üreticiye özel kamera ve uçuş aktarımı cihaz doğrulaması
                bekliyor.
              </p>
            </details>
          </div>
          <div
            className="mission-drawer-body mission-side"
            id="mission-panel-inspect"
            hidden={panel !== "inspect"}
          >
            <div
              className="mission-inspect-tabs"
              role="group"
              aria-label="İnceleme alanları"
            >
              {[
                ["review", "Görev dosyası", "Dosya"],
                ["field", "Saha geri bildirimi", "Saha"],
                ["history", "Uydu gözlem geçmişi", "Geçmiş"],
              ].map(([id, label, short]) => (
                <button
                  key={id}
                  aria-label={label}
                  aria-pressed={inspectionView === id}
                  aria-controls={"mission-inspect-" + id}
                  onClick={() => setInspectionView(id)}
                >
                  {short}
                </button>
              ))}
            </div>
            <div
              id="mission-inspect-review"
              className="mission-inspect-page"
              hidden={inspectionView !== "review"}
            >
              {live && (
                <p>
                  Görev dosyası simülasyon modunda hazırlanır. Saha kayıtları ve
                  uydu geçmişi yukarıdaki alanlardan açılır.
                </p>
              )}
              {!live && (
                <section>
                  <h3>İnceleme dosyası</h3>
                  <p>
                    Sınır ve tahmini süre kontrol edilir. Engel, hava sahası,
                    rüzgâr ve cihaz güvenliği operatör tarafından doğrulanmalı.
                  </p>
                  <label>
                    <input
                      type="checkbox"
                      disabled={!reviewed || !!plan.error || playing || saving}
                      checked={approved}
                      onChange={(event) => setApproved(event.target.checked)}
                    />{" "}
                    Simülasyon rotasını inceledim
                  </label>
                  <div className="mission-review-actions">
                    <button
                      disabled={!approved || !reviewed || !!plan.error}
                      onClick={exportReview}
                    >
                      <ArrowDownToLine size={16} /> İnceleme JSON’u
                    </button>
                    {canWrite && (
                      <button
                        disabled={
                          !approved ||
                          !reviewed ||
                          !!plan.error ||
                          saving ||
                          !!saved ||
                          playing
                        }
                        onClick={saveReview}
                      >
                        {saving
                          ? "Kaydediliyor…"
                          : saved
                            ? "İnceleme kaydedildi"
                            : "Saha incelemesine kaydet"}
                      </button>
                    )}
                  </div>
                  {saved && (
                    <button
                      onClick={() => onNavigate("investigation", field.id)}
                    >
                      Parsel incelemelerini aç
                    </button>
                  )}
                  {saveError && <p role="alert">{saveError}</p>}
                </section>
              )}
              {!live && !plan.error && (
                <section>
                  <button
                    aria-pressed={showProfile}
                    onClick={() => setShowProfile((value) => !value)}
                  >
                    <Mountain size={16} /> Zemin profili
                  </button>
                  {showProfile && (
                    <RouteElevation
                      plan={plan}
                      frame={frame}
                      droneTerrain={sourceMode ? drone.dtm : null}
                    />
                  )}
                </section>
              )}
            </div>
            <div
              id="mission-inspect-history"
              hidden={inspectionView !== "history"}
            >
              <ObservationHistory
                observations={observations}
                metric={metric}
                onNavigate={onNavigate}
                fieldId={field.id}
              />
            </div>
            <div id="mission-inspect-field" hidden={inspectionView !== "field"}>
              <MissionFeedback
                fieldId={field.id}
                geometryHash={context.geometryHash}
                records={allRecords}
                observations={observations}
                canWrite={canWrite}
                onRecords={acceptRecords}
                onRefresh={refreshCatalog}
                onNavigate={onNavigate}
              />
            </div>
          </div>
        </div>
        <div
          className="mission-map"
          aria-label="Görev sahnesi"
          data-aircraft={aircraft}
          data-camera={cameraMode}
          data-pitch={pitch}
          data-heading={Math.round(heading)}
          data-dimension={flat ? "2d" : "3d"}
        >
          <SpatialBoundary fallback={fallback}>
            {failed ? (
              fallback
            ) : (
              <Suspense fallback={<p role="status">Arazi açılıyor…</p>}>
                <Terrain
                  mission
                  quality={quality}
                  field={field}
                  frame={frame}
                  command={command}
                  flat={flat}
                  terrain={!flat}
                  compact={compact}
                  reduced={reduced}
                  onHeading={setHeading}
                  onBasemap={setBasemap}
                  onCamera={setPitch}
                  onMapReady={setMap}
                  onError={() => {
                    setFailed(true);
                    setMap(null);
                  }}
                  onPoint={({ coordinate, value }) => {
                    if (pointMode) editMap(coordinate);
                    else setSampledPoint({ raster, value });
                  }}
                  droneImagery={sourceMode ? drone.imagery : null}
                  terrainDefinition={sourceMode ? terrainDefinition : null}
                  raster={raster}
                  scale={palette}
                  opacity={layerMode === "difference" ? 0.34 : 0.52}
                  zones={
                    scan && showChange && layerMode === "difference"
                      ? zones
                      : empty
                  }
                />
              </Suspense>
            )}
          </SpatialBoundary>
          {!pointMode && (
            <MissionHud
              map={map}
              simulation={simulation}
              live={live || externalDevice?.state === "ready"}
              device={shownDevice}
              onOpen={() => externalDevice ? onExternalTelemetry?.() : openPanel("telemetry", true)}
            />
          )}
        </div>
        <div className="mission-map-tools" aria-label="Harita görünümü">
          {!failed && (
            <>
              <div className="mission-view-pair">
                <button
                  aria-pressed={!flat}
                  onClick={() => view("mission-overview")}
                >
                  3D
                </button>
                <button aria-pressed={flat} onClick={() => view("top")}>
                  2D
                </button>
              </div>
              <button
                aria-label="Parseli kadrajla"
                title="Parseli kadrajla"
                onClick={() => view(flat ? "fit" : "mission-overview")}
              >
                <Crosshair size={17} />
              </button>
              <button
                aria-label="Kuzeyi göster"
                title="Kuzeyi göster"
                onClick={() => view("north")}
              >
                <Compass
                  size={18}
                  style={{ transform: `rotate(${-heading}deg)` }}
                />
              </button>
              <button
                aria-label="Yakınlaştır"
                title="Yakınlaştır"
                onClick={() => view("in")}
              >
                <Plus size={18} />
              </button>
              <button
                aria-label="Uzaklaştır"
                title="Uzaklaştır"
                onClick={() => view("out")}
              >
                <Minus size={18} />
              </button>
            </>
          )}
          <button
            aria-label={focusMode ? "Odaktan çık" : "Odak modu"}
            title={focusMode ? "Odaktan çık" : "Odak modu"}
            aria-pressed={focusMode}
            onClick={() => {
              setPanel(null);
              setFocusMode((value) => !value);
            }}
          >
            {focusMode ? <X size={18} /> : <Maximize2 size={17} />}
          </button>
        </div>
        {focusMode && !live && (
          <div className="mission-focus-playback">
            <button disabled={!!plan.error || saving} onClick={play}>
              {playing ? <Pause size={17} /> : <Play size={17} />}{" "}
              {playing ? "Duraklat" : "Oynat"}
            </button>
            <input
              type="range"
              aria-label="Tam ekran görev zamanı"
              min="0"
              max={plan.duration || 1}
              step="any"
              value={elapsed}
              disabled={!!plan.error || saving}
              onChange={(event) => {
                setPlaying(false);
                setElapsed(Number(event.target.value));
              }}
            />
            <strong>{fmt(elapsed, 0)} sn</strong>
          </div>
        )}
        <div className="mission-map-readout">
          <span className="mission-map-source">
            <span />
            {basemap === "mapbox"
              ? "Mapbox Satellite"
              : basemap === "archive"
                ? "Sentinel-2 · 2016 mozaiği"
                : basemap === "road"
                  ? "Yol altlığı"
                  : "Harita kaynağı"}{" "}
            · {failed || flat ? "2D" : "3D"}
          </span>
          {palette && panel !== "layers" && (
            <span
              className="mission-legend-mini"
              aria-label={metric + " renk ölçeği"}
            >
              <strong>
                {metric}
                {layerMode === "difference" ? " Δ" : ""}
              </strong>
              <span>{fmt(palette.min, 2)}</span>
              <i
                aria-hidden="true"
                style={{
                  background: `linear-gradient(90deg,${palette.palette.map((rgb) => "rgb(" + rgb.join(",") + ")").join(",")})`,
                }}
              />
              <span>{fmt(palette.max, 2)}</span>
            </span>
          )}
          {pointMode && (
            <div className="mission-edit-instruction">
              <p role="status">
                {selectedPoint === null
                  ? "Nokta eklemek için parselin içine dokun. Noktaları sürükle veya odaklayıp yön tuşlarıyla taşı."
                  : "Noktanın yeni konumunu seç."}
              </p>
              <button
                onClick={() => {
                  setPointMode(false);
                  setSelectedPoint(null);
                }}
              >
                Bitir
              </button>
            </div>
          )}
          {pointMode && notice && (
            <span role="status" className="mission-map-caption">
              {notice}
            </span>
          )}
          {simulation && panel !== "qgc" && (
            <span className="mission-map-caption">
              {simulation.phase} · {fmt(simulation.altitude)} m AGL
              {!flat &&
                !failed &&
                aircraft === "ready" &&
                " · Model görünürlük için büyütüldü"}
            </span>
          )}
          {liveMarker && (
            <span className="mission-map-caption">
              Cihaz konumu · {fmt(devicePosition.altitudeMslM)} m deniz
              seviyesine göre
            </span>
          )}
          {simulation && aircraft === "error" && !flat && !failed && (
            <span role="status" className="mission-map-caption">
              3D model alınamadı. Rota ve telemetri kullanılabilir.
            </span>
          )}
          {liveMarker && map && (
            <button
              onClick={() =>
                setCommand({ type: "focus", coordinate: liveMarker.point })
              }
            >
              Cihazı kadrajla
            </button>
          )}
          {!live && device?.state !== "ready" && (
            <span className="mission-offline-label">
              Canlı cihaz bağlı değil
            </span>
          )}
        </div>
      </div>
      <div className="mission-flight-strip">
        {panel === "qgc" ? (
          <div className="mission-flight-facts">
            <strong className="mission-phase">
              QGroundControl rota önizlemesi
            </strong>
            <span>
              Kaydetme ve .plan indirme işlemleri panelde. Bu görünüm araca uçuş
              komutu göndermez.
            </span>
          </div>
        ) : !live ? (
          <>
            <div className="mission-playback">
              <button
                className="mission-start"
                disabled={!!plan.error || saving}
                onClick={play}
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
                <span>
                  {playing
                    ? "Duraklat"
                    : elapsed > 0 && elapsed < plan.duration
                      ? "Devam et"
                      : "Simülasyonu başlat"}
                </span>
              </button>
              <button
                aria-label="Başa dön"
                disabled={!!plan.error || saving}
                onClick={resetFlight}
              >
                <RotateCcw size={17} />
              </button>
              <input
                type="range"
                aria-label="Görev zamanı"
                min="0"
                max={plan.duration || 1}
                step="any"
                value={elapsed}
                disabled={!!plan.error || saving}
                aria-valuetext={fmt(elapsed, 0) + " saniye"}
                onKeyDown={(event) => {
                  if (!["Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  setPlaying(false);
                  setElapsed(event.key === "End" ? plan.duration : 0);
                }}
                onChange={(event) => {
                  setPlaying(false);
                  setElapsed(Number(event.target.value));
                }}
              />
              <strong>
                {fmt(elapsed, 0)} / {fmt(plan.duration, 0)} sn
              </strong>
              <select
                aria-label="Oynatma hızı"
                value={rate}
                onChange={(event) => setRate(Number(event.target.value))}
              >
                {[1, 2, 4, 8].map((value) => (
                  <option key={value} value={value}>
                    {value}×
                  </option>
                ))}
              </select>
            </div>
            <div className="mission-flight-facts">
              <strong className="mission-phase">
                {telemetry?.phase || "Rota bekleniyor"}
              </strong>
              <span>{points.length} nokta</span>
              {telemetry && (
                <>
                  <span>{fmt(plan.distance, 0)} m rota</span>
                  <span>{fmt(telemetry.speed)} m/sn</span>
                  <span>%{fmt(telemetry.battery, 0)} batarya</span>
                </>
              )}
              <div
                className="mission-camera-buttons"
                role="group"
                aria-label="Kamera"
              >
                <button
                  aria-pressed={cameraMode === "follow"}
                  disabled={!simulation || failed}
                  onClick={() =>
                    setCameraMode((mode) =>
                      mode === "follow" ? "free" : "follow",
                    )
                  }
                >
                  Drone’u takip et
                </button>
                <button
                  aria-pressed={cameraMode === "chase"}
                  disabled={!simulation || failed || flat}
                  onClick={() =>
                    setCameraMode((mode) =>
                      mode === "chase" ? "free" : "chase",
                    )
                  }
                >
                  Takip kamerası
                </button>
                <button disabled={failed || flat} onClick={() => view("slope")}>
                  Ufuk
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="mission-live-strip">
            <Radio size={17} />
            <strong>
              {device?.state === "ready"
                ? "Cihaz sinyali alınıyor"
                : "Canlı cihaz bağlı değil"}
            </strong>
            <span>MAVLink · salt okunur</span>
            <button onClick={() => openPanel("telemetry")}>
              Bağlantıyı aç
            </button>
          </div>
        )}
        {!live && !points.length && (
          <button
            className="mission-configure"
            onClick={() => openPanel("plan")}
          >
            Görevi hazırla <Route size={16} />
          </button>
        )}
        {notice && !panel && <p role="status">{notice}</p>}
      </div>
    </section>
  );
}
