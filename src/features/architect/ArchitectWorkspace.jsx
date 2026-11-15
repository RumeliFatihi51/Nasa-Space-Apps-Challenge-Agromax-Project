import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Box,
  ChevronDown,
  CirclePlus,
  Clock3,
  GitCompareArrows,
  Layers3,
  MapPin,
  Save,
  X,
} from "lucide-react";
import { api } from "../../api";
import useWorkspaceSync from "../../sync/useWorkspaceSync";
import { indices } from "../../../shared/metrics";
import { containsPoint } from "../../../shared/spatial";
import { coverageFlight } from "../../../shared/qgc-plan";
import {
  architectRecordKinds,
  scenarioTotals,
} from "../../../shared/platform-contracts";
import { useRaster } from "../spatial/SpatialWorkbench";
import { colorScale, rgb } from "../spatial/colors";
import { rasterImage } from "../spatial/raster-image";
import ParcelMap from "../fields/ParcelMap";
import SceneFilm from "../cinema/SceneFilm";
import { filmForScene } from "../cinema/sceneFilms";
import "./architect.css";

const empty = [];
const names = {
  scenario: "Senaryo",
  prescription: "Reçete",
  investigation: "İnceleme",
  flight_plan: "Uçuş planı",
};
const format = (value) =>
  Number.isFinite(value)
    ? value.toLocaleString("tr-TR", { maximumFractionDigits: 3 })
    : "—";
const sameCapture = (a, b) =>
  a?.date === b?.date && a?.analysisId === b?.analysisId;
const capture = (item) =>
  item ? { date: item.date, analysisId: item.id } : null;
const initial = () => ({
  name: "",
  metric: "NDVI",
  primary: null,
  comparison: null,
  mode: "map",
  opacity: 0.78,
  notes: "",
  pins: [],
  references: [],
});

function referenceDetails(row) {
  if (row.kind === "scenario") {
    const totals = scenarioTotals(row.payload);
    return [
      [
        "Toplam",
        new Intl.NumberFormat("tr-TR", {
          style: "currency",
          currency: totals.currency,
        }).format(totals.totalMinor / 100),
      ],
      ["Su", format(row.payload.waterM3) + " m³"],
      ["Gübre", format(row.payload.fertilizerKg) + " kg"],
    ];
  }
  if (row.kind === "prescription")
    return [
      ["Bölge", row.payload.zones?.length || 0],
      ["Taslak doz", format(row.payload.rate) + " " + row.payload.unit],
    ];
  if (row.kind === "investigation")
    return [
      ["Bölge", row.payload.region],
      ["İstenen veri", row.payload.requestedData],
    ];
  return [
    ["Profil", row.payload.firmware],
    ["İrtifa", format(row.payload.altitude) + " m · kalkışa göre"],
  ];
}

function mapImage(raster, geometry, scale, opacity) {
  if (!raster || !scale || !raster.values.some(Number.isFinite)) return null;
  const { url, coordinates } = rasterImage(raster, geometry, scale);
  const [west, north] = coordinates[0],
    [east, south] = coordinates[2];
  return { url, bounds: [west, south, east, north], opacity };
}

export default function ArchitectWorkspace({
  fields,
  initialFieldId,
  canWrite,
  onNavigate,
  commercial,
  onFieldChange,
}) {
  const drawn = useMemo(
    () => fields.filter((field) => field.geometry),
    [fields],
  );
  const [selection, setSelection] = useState(initialFieldId);
  const field = drawn.find((item) => item.id === selection) || drawn[0];
  const [hasChanges, setHasChanges] = useState(false);
  useEffect(() => {
    if (initialFieldId) setSelection(initialFieldId);
  }, [initialFieldId]);
  return (
    <article className="architect">
      <header className="architect-hero">
        <SceneFilm film={filmForScene("architect")} priority />
        <div className="architect-hero-content">
          <small>AGROMAX / PROJELER</small>
          <h1>Architect</h1>
          <p>Parseli, gözlemleri ve saha planını bir haritada birleştir.</p>
        </div>
        {!!drawn.length && (
          <label className="architect-parcel">
            <MapPin size={16} /> <span>Çalışılan parsel</span>
            <select
              aria-label="Architect parseli"
              value={field.id}
              onChange={(event) => {
                if (
                  hasChanges &&
                  !window.confirm(
                    "Kaydedilmeyen proje düzenlemeleri var. Parsel değiştirilsin mi?",
                  )
                )
                  return;
                setSelection(event.target.value);
                onFieldChange?.(event.target.value);
              }}
            >
              {drawn.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>
      {field ? (
        <ProjectDesk
          key={field.id}
          field={field}
          canWrite={canWrite}
          onNavigate={onNavigate}
          commercial={commercial}
          onDirty={setHasChanges}
        />
      ) : (
        <div className="architect-empty">
          <h2>Parselini haritaya ekle</h2>
          <p>Bir sınır çizdikten sonra bu alan için proje açabilirsin.</p>
          <button onClick={() => onNavigate("fields")}>
            Parsellere git <ArrowUpRight size={16} />
          </button>
        </div>
      )}
    </article>
  );
}

function ProjectDesk({ field, canWrite, onNavigate, commercial, onDirty }) {
  const revision = useWorkspaceSync();
  const [bundle, setBundle] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState(initial);
  const [sourceVersion, setSourceVersion] = useState(null);
  const [geometryVersion, setGeometryVersion] = useState(null);
  const [savedId, setSavedId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const [inspectVersion, setInspectVersion] = useState("");
  const [viewport, setViewport] = useState(null);
  const [pinMode, setPinMode] = useState(false);
  const [pinnedRecords, setPinnedRecords] = useState(empty);
  const [referenceError, setReferenceError] = useState("");
  const [editRevision, setEditRevision] = useState(0);
  const [savedEditRevision, setSavedEditRevision] = useState(0);
  const dirty = editRevision !== savedEditRevision;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const pinsQuery = new URLSearchParams();
  for (const id of new Set(
    [draft.primary?.analysisId, draft.comparison?.analysisId].filter(Boolean),
  ))
    pinsQuery.append("analysis", id);
  const catalogQuery = pinsQuery.size ? "?" + pinsQuery : "";
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      ["", "/spatial" + catalogQuery].map((suffix) =>
        api("platform/fields/" + field.id + suffix, undefined, "GET", {
          signal: controller.signal,
        }),
      ),
    )
      .then(([context, spatial]) => {
        if (controller.signal.aborted) return;
        if (context.context.geometryHash !== spatial.geometryHash) {
          setLoadError("Parsel sınırı sorgu sırasında değişti. Yeniden yükle.");
          return;
        }
        setBundle(context);
        setCatalog(spatial);
        setLoadError("");
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(err.message);
      });
    return () => controller.abort();
  }, [field.id, revision, retry, catalogQuery]);
  const geometryHash = bundle?.context.geometryHash;
  const boundaryChanged = !!(
    geometryVersion && geometryHash !== geometryVersion
  );
  const rows = bundle?.records || empty;
  const projects = rows.filter(
    (row) => row.kind === "architect_project" && row.status !== "archived",
  );
  const currentProject = projects.find((row) => row.id === savedId);
  const observations = catalog?.observations || empty;
  const pinnedObservations = catalog?.pinnedObservations || empty;
  const findCapture = (pin, source) =>
    [...source, ...pinnedObservations].find((item) =>
      sameCapture(capture(item), pin),
    );
  // Resolve a pinned analysis by both date and id. Never silently select a
  // different revision after the catalog changes.
  const primary = draft.primary
    ? findCapture(draft.primary, observations)
    : observations[0];
  const metrics = indices.filter((index) =>
    Number.isFinite(primary?.metrics[index.id]),
  );
  const metric = draft.primary
    ? draft.metric
    : metrics.some((index) => index.id === draft.metric)
      ? draft.metric
      : metrics[0]?.id || draft.metric;
  const earlierOptions = [
    ...observations,
    ...pinnedObservations.filter((item) =>
      sameCapture(capture(item), draft.comparison),
    ),
  ].filter(
    (item) =>
      primary &&
      item.date < primary.date &&
      item.provider === primary.provider &&
      item.method === primary.method &&
      Number.isFinite(item.metrics[metric]),
  );
  const secondary = draft.comparison
    ? earlierOptions.find((item) =>
        sameCapture(capture(item), draft.comparison),
      )
    : earlierOptions[0];
  const left = useRaster(
    field.id,
    geometryHash,
    primary,
    metric,
    !!primary && Number.isFinite(primary.metrics[metric]) && !boundaryChanged,
  );
  const right = useRaster(
    field.id,
    geometryHash,
    secondary,
    metric,
    draft.mode === "compare" && !boundaryChanged,
  );

  const referencesKey = JSON.stringify(draft.references);
  useEffect(() => {
    const controller = new AbortController();
    const refs = JSON.parse(referencesKey);
    setReferenceError("");
    setPinnedRecords(empty);
    if (!refs.length) {
      return;
    }
    Promise.all(
      refs.map(async (ref) => {
        const { revisions } = await api(
          "platform/records/" + ref.id + "/revisions",
          undefined,
          "GET",
          { signal: controller.signal },
        );
        const record = revisions.find(
          (item) =>
            item.version === ref.version &&
            item.kind === ref.kind &&
            item.fieldId === field.id,
        );
        if (!record)
          throw new Error("Bir bağlı kaydın kayıtlı sürümü bulunamadı.");
        return record;
      }),
    )
      .then((records) => {
        if (!controller.signal.aborted) setPinnedRecords(records);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setPinnedRecords(empty);
          setReferenceError(err.message);
        }
      });
    return () => controller.abort();
  }, [referencesKey, field.id, revision]);

  const pins = draft.pins;
  const referenceNames = new Map(rows.map((row) => [row.id, row.name]));
  const listRefs = (refs) =>
    refs
      .map(
        (ref) =>
          (referenceNames.get(ref.id) || names[ref.kind]) +
          " · v" +
          ref.version,
      )
      .join(", ") || "—";
  const layers = useMemo(() => {
    if (boundaryChanged) return empty;
    const result = pins.map((pin) => ({
      name: pin.label,
      color: "#f5d28d",
      geometry: { type: "Point", coordinates: pin.coordinate },
    }));
    const sameField = pinnedRecords.filter(
      (row) => row.fieldSnapshot.geometryHash === geometryHash,
    );
    for (const row of sameField) {
      if (row.kind === "prescription") {
        result.push(
          ...(row.payload.zones || []).map((zone) => ({
            geometry: zone.geometry,
            name: zone.name,
            color: "#9dedbc",
          })),
        );
      } else if (row.kind === "investigation" && row.payload.coordinate) {
        result.push({
          geometry: { type: "Point", coordinates: row.payload.coordinate },
          name: row.name,
          color: "#c9dfff",
        });
      } else if (row.kind === "flight_plan") {
        try {
          const { target } = row.payload;
          const recipe = sameField.find(
            (item) =>
              item.id === target.recordId && item.version === target.version,
          );
          const area =
            target.kind === "field"
              ? field.geometry
              : target.kind === "analysis_review"
                ? target.geometry
                : recipe?.payload.zones?.[target.zoneIndex]?.geometry;
          if (area)
            result.push({
              geometry: {
                type: "LineString",
                coordinates: coverageFlight(field.geometry, area, row.payload)
                  .route,
              },
              name: row.name,
              color: "#f5d28d",
            });
        } catch {
          /* Reference remains visible if the route cannot be previewed. */
        }
      }
    }
    return result;
  }, [pins, pinnedRecords, geometryHash, field.geometry, boundaryChanged]);
  const mapFields = useMemo(
    () => [field],
    [field.id, field.name, field.geometry && JSON.stringify(field.geometry)],
  );
  const scale = useMemo(
    () => (left.data ? colorScale(left.data, right.data) : null),
    [left.data, right.data],
  );
  const imageA = useMemo(
    () => mapImage(left.data, field.geometry, scale, draft.opacity),
    [left.data, field.geometry, scale, draft.opacity],
  );
  const imageB = useMemo(
    () => mapImage(right.data, field.geometry, scale, draft.opacity),
    [right.data, field.geometry, scale, draft.opacity],
  );
  const options = rows.filter(
    (row) =>
      architectRecordKinds.includes(row.kind) &&
      row.status !== "archived" &&
      row.fieldSnapshot.geometryHash === geometryHash,
  );
  const older = history?.find((row) => String(row.version) === inspectVersion);
  const invalid =
    boundaryChanged ||
    (draft.primary &&
      (!primary || !Number.isFinite(primary.metrics[metric]))) ||
    (draft.mode === "compare" && !secondary);
  function edit(patch) {
    setDraft((previous) => ({ ...previous, ...patch }));
    if (geometryHash && !geometryVersion) setGeometryVersion(geometryHash);
    setEditRevision((value) => value + 1);
    setError("");
    setNotice("");
  }
  function newProject() {
    setDraft(initial());
    setSavedId("");
    setSourceVersion(null);
    setGeometryVersion(geometryHash);
    setHistory(null);
    setInspectVersion("");
    setPinMode(false);
    setSavedEditRevision(editRevision);
    setError("");
    setNotice("");
  }
  function load(row, version = row) {
    setSavedId(row.id);
    setSourceVersion(row.version);
    setGeometryVersion(version.payload.geometryHash);
    setDraft({ ...version.payload, name: version.name });
    setPinMode(false);
    setError("");
    setNotice("");
    setSavedEditRevision(editRevision);
    if (version.version !== row.version) {
      setEditRevision((value) => value + 1);
      setNotice(
        "Önceki sürüm çalışma alanına alındı. Kaydedersen yeni sürüm oluşur.",
      );
    }
  }
  async function openProject(event) {
    const row = projects.find((item) => item.id === event.target.value);
    if (
      dirty &&
      !window.confirm(
        "Kaydedilmeyen düzenlemeler var. Projeyi değiştirmek istiyor musun?",
      )
    ) {
      event.target.value = savedId;
      return;
    }
    setHistory(null);
    setInspectVersion("");
    if (row) load(row);
    else newProject();
  }
  async function save(event) {
    event.preventDefault();
    if (!canWrite || invalid || busy) return;
    const versionAtSubmit = editRevision;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        geometryHash,
        metric,
        primary: capture(primary),
        comparison: draft.mode === "compare" ? capture(secondary) : null,
        mode: draft.mode,
        opacity: draft.opacity,
        notes: draft.notes,
        pins: draft.pins,
        references: draft.references,
      };
      const value = await api(
        savedId ? "platform/records/" + savedId : "platform/records",
        {
          fieldId: field.id,
          kind: "architect_project",
          name: draft.name,
          payload,
          ...(savedId ? { version: sourceVersion } : {}),
        },
        savedId ? "PATCH" : "POST",
      );
      const row = value.record;
      setSavedId(row.id);
      setSourceVersion(row.version);
      setGeometryVersion(geometryHash);
      setSavedEditRevision(versionAtSubmit);
      setHistory(null);
      setInspectVersion("");
      setBundle((previous) => ({
        ...previous,
        records: [
          row,
          ...previous.records.filter((item) => item.id !== row.id),
        ],
      }));
      setNotice("Proje kaydedildi · v" + row.version);
    } catch (err) {
      setError(
        err.status === 409
          ? "Kayıt başka bir oturumda değişti veya sınır güncellendi. Projeyi yeniden aç."
          : err.message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function readHistory() {
    try {
      const { revisions } = await api(
        "platform/records/" + savedId + "/revisions",
      );
      setHistory(revisions);
      setInspectVersion(
        String(
          revisions.find((row) => row.version !== sourceVersion)?.version ||
            revisions[0]?.version ||
            "",
        ),
      );
    } catch (err) {
      setError(err.message);
    }
  }
  function addPin(coordinate) {
    if (!pinMode || !canWrite || pins.length >= 20) return;
    if (!containsPoint(field.geometry, coordinate)) {
      setError("Noktayı parsel sınırının içine yerleştir.");
      return;
    }
    edit({
      pins: [
        ...pins,
        { coordinate, label: "Kontrol noktası " + (pins.length + 1) },
      ],
    });
    setPinMode(false);
  }
  function compare() {
    if (!secondary) return;
    edit({
      mode: "compare",
      primary: capture(primary),
      comparison: capture(secondary),
      metric,
    });
  }
  const entry = ({ id, label, icon: Icon, extra }) => (
    <button onClick={() => onNavigate(id, field.id, extra)} type="button">
      <Icon size={16} />
      {label}
      <ArrowUpRight size={14} />
    </button>
  );
  const navigationProps = primary
    ? {
        metric,
        date: primary.date,
        analysis: primary.id,
        priorAnalysis: draft.mode === "compare" ? secondary?.id : undefined,
        earlier: draft.mode === "compare" ? secondary?.date : undefined,
      }
    : undefined;

  return (
    <>
      {loadError && (
        <div className="architect-alert" role="alert">
          {loadError}{" "}
          <button onClick={() => setRetry((value) => value + 1)}>
            Yeniden dene
          </button>
        </div>
      )}
      {!bundle ? (
        !loadError && (
          <p className="architect-empty" role="status">
            Parsel kayıtları yükleniyor…
          </p>
        )
      ) : (
        <>
          <div className="architect-toolbar">
            <label>
              Proje
              <select
                aria-label="Kayıtlı proje"
                value={savedId}
                onChange={openProject}
                disabled={busy}
              >
                <option value="">Yeni proje</option>
                {projects.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · v{row.version}
                  </option>
                ))}
              </select>
            </label>
            <div
              className="architect-modes"
              aria-label="Harita görünümü"
              role="group"
            >
              <button
                aria-pressed={draft.mode === "map"}
                onClick={() => edit({ mode: "map", comparison: null })}
              >
                <Layers3 size={16} /> Harita
              </button>
              <button
                aria-pressed={draft.mode === "compare"}
                disabled={!secondary}
                onClick={compare}
              >
                <GitCompareArrows size={16} /> Karşılaştır
              </button>
            </div>
            <button
              className="architect-signature"
              disabled={boundaryChanged}
              onClick={() =>
                onNavigate("field-studio", field.id, navigationProps)
              }
            >
              <Box size={17} /> İmza 3D <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="architect-desk">
            <div className="architect-visual">
              <div
                className={
                  "architect-maps " +
                  (draft.mode === "compare" ? "is-compare" : "")
                }
              >
                {[
                  [primary, imageA, left, "Güncel"],
                  ...(draft.mode === "compare"
                    ? [[secondary, imageB, right, "Önceki"]]
                    : []),
                ].map(([item, image, layer, label], index) => (
                  <section key={label} className="architect-map">
                    <div className="architect-map-tag">
                      {draft.mode === "compare" && label + " · "}
                      {item?.date || "Parsel sınırı"}{" "}
                      {item && (
                        <strong>
                          {metric} {format(item.metrics[metric])}
                        </strong>
                      )}
                    </div>
                    <ParcelMap
                      fields={mapFields}
                      activeFieldId={field.id}
                      image={image}
                      projectLayers={layers}
                      height={draft.mode === "compare" ? 400 : 480}
                      compact
                      workbench
                      mapId={label}
                      sharedViewport={viewport}
                      onViewport={
                        draft.mode === "compare" ? setViewport : undefined
                      }
                      onMapPoint={!index && pinMode ? addPin : undefined}
                    />
                    {(layer.error || layer.loading) && (
                      <p
                        className="architect-map-status"
                        role={layer.error ? "alert" : "status"}
                      >
                        {layer.error || "İndeks katmanı yükleniyor…"}
                      </p>
                    )}
                  </section>
                ))}
              </div>
              {draft.mode === "compare" && primary && secondary && (
                <div className="architect-comparison">
                  <span>{primary.source}</span>
                  <strong>
                    {metric} farkı{" "}
                    <b>
                      {format(
                        primary.metrics[metric] - secondary.metrics[metric],
                      )}
                    </b>
                  </strong>
                  <span>Güncel − önceki parsel ortalaması</span>
                </div>
              )}
              {scale && (
                <div
                  className="architect-legend"
                  aria-label="İndeks renk ölçeği"
                >
                  <span>{format(scale.min)}</span>
                  <i
                    style={{
                      background: `linear-gradient(90deg,${scale.palette.map(rgb).join(",")})`,
                    }}
                  />
                  <span>{format(scale.max)}</span>
                  <small>
                    {metric}{" "}
                    {draft.mode === "compare"
                      ? "· iki tarih için ortak ölçek"
                      : ""}
                  </small>
                </div>
              )}
              {!primary && (
                <div className="architect-comparison">
                  <span>Bu proje için kayıtlı indeks katmanı bulunamadı.</span>
                  <button onClick={() => onNavigate("fields", field.id)}>
                    Parsel analizine git <ArrowUpRight size={14} />
                  </button>
                </div>
              )}
              {primary && draft.mode !== "compare" && (
                <div className="architect-comparison">
                  <span>{primary.source}</span>
                  <small>{primary.method}</small>
                </div>
              )}
            </div>
            <aside className="architect-inspector" aria-label="Proje ayarları">
              <form onSubmit={save}>
                <div className="architect-inspector-title">
                  <h2>Proje ayrıntıları</h2>
                  {sourceVersion && <span>v{sourceVersion}</span>}
                </div>
                <fieldset disabled={busy}>
                  <label>
                    Proje adı
                    <input
                      required
                      maxLength={150}
                      value={draft.name}
                      onChange={(event) => edit({ name: event.target.value })}
                      placeholder="Örn. Kuzey bölgesi incelemesi"
                    />
                  </label>
                  <div className="architect-input-pair">
                    <label>
                      Tarih
                      <select
                        aria-label="Gözlem tarihi"
                        value={primary?.date || ""}
                        onChange={(event) => {
                          const item = observations.find(
                            (row) => row.date === event.target.value,
                          );
                          const nextMetric = Number.isFinite(
                            item?.metrics[metric],
                          )
                            ? metric
                            : indices.find((index) =>
                                Number.isFinite(item?.metrics[index.id]),
                              )?.id || metric;
                          edit({
                            primary: capture(item),
                            comparison: null,
                            metric: nextMetric,
                            mode: "map",
                          });
                        }}
                      >
                        <option value="" disabled>
                          Gözlem yok
                        </option>
                        {observations.map((item) => (
                          <option key={item.date}>{item.date}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      İndeks
                      <select
                        value={metric}
                        disabled={!metrics.length}
                        onChange={(event) =>
                          edit({
                            primary: capture(primary),
                            metric: event.target.value,
                            comparison: null,
                            mode: "map",
                          })
                        }
                      >
                        {!metrics.length && (
                          <option value={metric}>{metric}</option>
                        )}
                        {metrics.map((item) => (
                          <option key={item.id}>{item.id}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {draft.mode === "compare" && (
                    <label>
                      Önceki tarih
                      <select
                        value={secondary?.date || ""}
                        onChange={(event) =>
                          edit({
                            comparison: capture(
                              earlierOptions.find(
                                (item) => item.date === event.target.value,
                              ),
                            ),
                          })
                        }
                      >
                        {!secondary && (
                          <option value="">Kaynak bulunamadı</option>
                        )}
                        {earlierOptions.map((item) => (
                          <option key={item.date}>{item.date}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Katman opaklığı · %{Math.round(draft.opacity * 100)}
                    <input
                      type="range"
                      min=".15"
                      max="1"
                      step=".01"
                      value={draft.opacity}
                      onChange={(event) =>
                        edit({ opacity: Number(event.target.value) })
                      }
                    />
                  </label>
                  <details>
                    <summary>
                      Bağlı planlar ve kayıtlar{" "}
                      <span>{draft.references.length}</span>
                      <ChevronDown size={15} />
                    </summary>
                    {!options.length && (
                      <p>Bu sınır sürümüne bağlı çalışma dosyası yok.</p>
                    )}
                    {options.map((row) => {
                      const ref = draft.references.find(
                        (item) => item.id === row.id,
                      );
                      return (
                        <div className="architect-ref" key={row.id}>
                          <label>
                            <input
                              type="checkbox"
                              checked={!!ref}
                              disabled={!ref && draft.references.length >= 12}
                              onChange={(event) =>
                                edit({
                                  references: event.target.checked
                                    ? [
                                        ...draft.references,
                                        {
                                          id: row.id,
                                          version: row.version,
                                          kind: row.kind,
                                        },
                                      ]
                                    : draft.references.filter(
                                        (item) => item.id !== row.id,
                                      ),
                                })
                              }
                            />
                            <span>
                              {row.name}
                              <small>
                                {names[row.kind]} · v
                                {ref?.version || row.version}
                              </small>
                            </span>
                          </label>
                          {ref && ref.version !== row.version && (
                            <button
                              type="button"
                              onClick={() =>
                                edit({
                                  references: draft.references.map((item) =>
                                    item.id === row.id
                                      ? { ...item, version: row.version }
                                      : item,
                                  ),
                                })
                              }
                            >
                              v{row.version} seç
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {draft.references
                      .filter(
                        (ref) => !options.some((row) => row.id === ref.id),
                      )
                      .map((ref) => (
                        <button
                          key={ref.id}
                          type="button"
                          onClick={() =>
                            edit({
                              references: draft.references.filter(
                                (item) => item.id !== ref.id,
                              ),
                            })
                          }
                        >
                          <X size={14} /> Kullanılamayan bağlantıyı kaldır
                        </button>
                      ))}
                    {referenceError && <p role="alert">{referenceError}</p>}
                  </details>
                  <details>
                    <summary>
                      Saha noktaları <span>{pins.length}</span>
                      <ChevronDown size={15} />
                    </summary>
                    <button
                      type="button"
                      disabled={
                        !canWrite || boundaryChanged || pins.length >= 20
                      }
                      aria-pressed={pinMode}
                      onClick={() => setPinMode(!pinMode)}
                    >
                      <MapPin size={15} />{" "}
                      {pinMode
                        ? "Konum seçimini iptal et"
                        : "Haritaya nokta bırak"}
                    </button>
                    {pinMode && (
                      <p role="status">Güncel haritada parselin içine dokun.</p>
                    )}
                    {pins.map((pin, index) => (
                      <div className="architect-pin" key={index}>
                        <input
                          aria-label={"Nokta " + (index + 1) + " adı"}
                          maxLength={100}
                          value={pin.label}
                          onChange={(event) =>
                            edit({
                              pins: pins.map((item, i) =>
                                i === index
                                  ? { ...item, label: event.target.value }
                                  : item,
                              ),
                            })
                          }
                        />
                        <button
                          type="button"
                          aria-label={"Nokta " + (index + 1) + " sil"}
                          onClick={() =>
                            edit({ pins: pins.filter((_, i) => i !== index) })
                          }
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </details>
                  <label>
                    Çalışma notu
                    <textarea
                      rows="3"
                      maxLength={4000}
                      value={draft.notes}
                      onChange={(event) => edit({ notes: event.target.value })}
                      placeholder="Sahada neyi kontrol edeceksin?"
                    />
                  </label>
                </fieldset>
                {invalid && (
                  <p role="alert">
                    Seçili gözlem, karşılaştırma veya parsel sınırı güncel
                    değil. Tarihi yeniden seç ya da güncel sınırla yeni proje
                    aç.
                  </p>
                )}
                {error && <p role="alert">{error}</p>}
                {notice && <p role="status">{notice}</p>}
                {!canWrite && <p>Görüntüleme yetkisi</p>}
                <div className="architect-save-row">
                  <button
                    className="architect-save"
                    disabled={
                      busy || !canWrite || invalid || !draft.name.trim()
                    }
                    type="submit"
                  >
                    <Save size={16} />{" "}
                    {busy
                      ? "Kaydediliyor…"
                      : savedId
                        ? "Yeni sürüm kaydet"
                        : "Projeyi kaydet"}
                  </button>
                  {savedId && (
                    <button
                      aria-label="Proje sürümleri"
                      type="button"
                      onClick={readHistory}
                    >
                      <Clock3 size={17} />
                    </button>
                  )}
                  {savedId && (
                    <button
                      aria-label="Yeni proje"
                      type="button"
                      onClick={() => {
                        if (
                          !dirty ||
                          window.confirm(
                            "Kaydedilmeyen düzenlemeler silinsin mi?",
                          )
                        )
                          newProject();
                      }}
                    >
                      <CirclePlus size={17} />
                    </button>
                  )}
                </div>
              </form>
              {older && (
                <section
                  className="architect-versions"
                  aria-label="Proje sürüm karşılaştırması"
                >
                  <h3>Sürümler</h3>
                  <label>
                    Karşılaştırılan sürüm
                    <select
                      value={inspectVersion}
                      onChange={(event) =>
                        setInspectVersion(event.target.value)
                      }
                    >
                      {history.map((row) => (
                        <option key={row.version} value={row.version}>
                          v{row.version} ·{" "}
                          {new Date(row.updatedAt).toLocaleDateString("tr-TR")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <table>
                    <thead>
                      <tr>
                        <th>Alan</th>
                        <th>v{older.version}</th>
                        <th>Çalışma</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th>İndeks</th>
                        <td>{older.payload.metric}</td>
                        <td>{metric}</td>
                      </tr>
                      <tr>
                        <th>Tarih</th>
                        <td>{older.payload.primary?.date || "—"}</td>
                        <td>{primary?.date || "—"}</td>
                      </tr>
                      <tr>
                        <th>Önceki</th>
                        <td>{older.payload.comparison?.date || "—"}</td>
                        <td>
                          {draft.mode === "compare"
                            ? secondary?.date || "—"
                            : "—"}
                        </td>
                      </tr>
                      <tr>
                        <th>Bağlar</th>
                        <td>{listRefs(older.payload.references)}</td>
                        <td>{listRefs(draft.references)}</td>
                      </tr>
                      <tr>
                        <th>Noktalar</th>
                        <td>{older.payload.pins.length}</td>
                        <td>{pins.length}</td>
                      </tr>
                      <tr>
                        <th>Not</th>
                        <td>{older.payload.notes || "—"}</td>
                        <td>{draft.notes || "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                  {currentProject && (
                    <button
                      type="button"
                      disabled={
                        busy || older.payload.geometryHash !== geometryHash
                      }
                      onClick={() => {
                        if (
                          !dirty ||
                          window.confirm(
                            "Düzenlemeler seçili sürümle değiştirilsin mi?",
                          )
                        )
                          load(currentProject, older);
                      }}
                    >
                      Bu sürümü çalışma alanına al
                    </button>
                  )}
                </section>
              )}
            </aside>
          </div>
          {!!pinnedRecords.length && !boundaryChanged && (
            <section className="architect-linked" aria-label="Proje kaynakları">
              <h2>Proje kaynakları</h2>
              {pinnedRecords.map((row) => (
                <article key={row.id}>
                  <div>
                    <strong>{row.name}</strong>
                    <small>
                      {names[row.kind]} · v{row.version}
                    </small>
                  </div>
                  <dl>
                    {referenceDetails(row).map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </section>
          )}
          <nav
            className="architect-next"
            aria-label="Aynı parselin diğer araçları"
          >
            {entry({ id: "twin", label: "Dijital ikiz", icon: Box })}
            {entry({
              id: "temporal",
              label: "Arazi hafızası",
              icon: Clock3,
              extra: navigationProps,
            })}
            {entry({
              id: "drones",
              label: "Drone",
              icon: MapPin,
              extra: navigationProps,
            })}
            {entry({ id: "assistant", label: "Filiz", icon: Layers3 })}
            {commercial &&
              entry({ id: "reports", label: "Raporlar", icon: ArrowUpRight })}
          </nav>
        </>
      )}
    </>
  );
}
