import { useEffect, useMemo, useState } from "react";
import { api, apiBinaryResponse } from "../../api";
import { coverageFlight } from "../../../shared/qgc-plan";
import { metricFrame, polygons } from "../../../shared/spatial";
import "./qgc-plan.css";

const initial = {
  firmware: "px4",
  vehicle: "",
  firmwareVersion: "",
  longitude: "",
  latitude: "",
  homeAMSL: "",
  altitude: "35",
  speed: "5",
  endurance: "20",
  swath: "15",
  overlap: "20",
  bearing: "0",
};
const numeric = [
  "homeAMSL",
  "altitude",
  "speed",
  "endurance",
  "swath",
  "overlap",
  "bearing",
];
const fmt = (number, digits = 0) =>
  number.toLocaleString("tr-TR", { maximumFractionDigits: digits });

function usePreview(map, flight, target, active) {
  useEffect(() => {
    if (!map || !active || !flight) return;
    const source = "qgc-flight-preview";
    map.addSource(source, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: {}, geometry: target },
          {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: flight.route },
          },
        ],
      },
    });
    map.addLayer({
      id: source + "-target",
      source,
      type: "fill",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#f2ca83", "fill-opacity": 0.16 },
    });
    map.addLayer({
      id: source + "-route",
      source,
      type: "line",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": "#ffd087", "line-width": 3 },
    });
    return () => {
      if (!map.getStyle()) return;
      for (const suffix of ["-route", "-target"])
        if (map.getLayer(source + suffix)) map.removeLayer(source + suffix);
      if (map.getSource(source)) map.removeSource(source);
    };
  }, [map, flight, target, active]);
}

export default function QgcPlanPanel({
  field,
  geometryHash,
  map,
  active,
  records,
  points,
  findings,
  newer,
  metric,
  canWrite,
  onRecords,
  homePoint,
  onPreview,
}) {
  const [form, setForm] = useState(initial),
    [selection, setSelection] = useState("field");
  const [preview, setPreview] = useState(null),
    [saved, setSaved] = useState(null),
    [ack, setAck] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState("Tarla tarama uçuşu");
  const targets = useMemo(
    () => [
      {
        id: "field",
        label: "Tüm parsel · gözlem taraması",
        geometry: field.geometry,
        target: { kind: "field" },
      },
      ...records
        .filter(
          (record) =>
            record.kind === "prescription" &&
            record.fieldId === field.id &&
            record.fieldSnapshot.geometryHash === geometryHash &&
            record.status !== "archived",
        )
        .flatMap((record) =>
          (record.payload.zones || []).map((zone, index) => ({
            id: record.id + ":" + index,
            label: record.name + " / " + zone.name,
            geometry: zone.geometry,
            target: {
              kind: "prescription",
              recordId: record.id,
              version: record.version,
              zoneIndex: index,
            },
            preparation:
              zone.rate +
              " " +
              record.payload.unit +
              " · hazırlık bilgisi; uygulanmaz",
          })),
        ),
      ...(newer
        ? (findings?.targets || []).map((item, index) => ({
            id: "analysis:" + index,
            label: metric + " değişimi · inceleme bölgesi " + (index + 1),
            geometry: item.geometry,
            target: {
              kind: "analysis_review",
              analysisId: newer.id,
              date: newer.date,
              metric,
              geometry: item.geometry,
            },
          }))
        : []),
    ],
    [records, field, geometryHash, findings, newer, metric],
  );
  const selected = targets.find((item) => item.id === selection);
  const files = records.filter(
    (record) =>
      record.kind === "flight_plan" &&
      record.fieldId === field.id &&
      record.status !== "archived",
  );
  const frame = useMemo(() => metricFrame(field.geometry), [field.geometry]);
  const project = (point) => {
    const [x, y] = frame.local(point);
    return [160 + (270 * x) / frame.span, 95 + (155 * y) / frame.span].join(
      ",",
    );
  };
  usePreview(map, preview?.flight, preview?.geometry, active);
  useEffect(() => { onPreview?.(preview); }, [preview, onPreview]);
  useEffect(() => {
    if (!homePoint) return;
    invalidate();
    setForm(previous => ({ ...previous, longitude: String(homePoint[0]), latitude: String(homePoint[1]) }));
  }, [homePoint]);
  function invalidate() {
    setPreview(null);
    setSaved(null);
    setAck(false);
    setError("");
  }
  function change(key, value) {
    invalidate();
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  function generate(event) {
    event.preventDefault();
    invalidate();
    try {
      if (!selected) throw new Error("Hedef artık mevcut değil. Yeniden seç.");
      if (!form.vehicle) throw new Error("Drone tipini seç.");
      if (
        [
          form.longitude,
          form.latitude,
          ...numeric.map((key) => form[key]),
        ].some((value) => value.trim() === "")
      )
        throw new Error(
          "Kalkış koordinatı ve deniz seviyesine göre yüksekliği dahil tüm sayısal alanları doldur.",
        );
      const payload = {
        geometryHash,
        firmware: form.firmware,
        vehicle: form.vehicle,
        firmwareVersion: form.firmwareVersion,
        home: [Number(form.longitude), Number(form.latitude)],
        ...Object.fromEntries(numeric.map((key) => [key, Number(form[key])])),
        target: selected.target,
      };
      const flight = coverageFlight(field.geometry, selected.geometry, payload);
      setPreview({
        payload,
        flight,
        geometry: selected.geometry,
        label: selected.label,
        preparation: selected.preparation,
      });
    } catch (cause) {
      setError(
        cause.name === "ZodError"
          ? "Koordinat veya uçuş ayarları desteklenen aralıkta değil."
          : cause.message,
      );
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const { record } = await api("platform/records", {
        fieldId: field.id,
        kind: "flight_plan",
        name,
        payload: preview.payload,
      });
      onRecords([record]);
      setSaved(record);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await apiBinaryResponse(
        `platform/records/${saved.id}/qgc-plan?version=${saved.version}`,
      );
      const url = URL.createObjectURL(await response.blob()),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `agromax-${field.demo === true ? "ORNEK-" : ""}${saved.id}-v${saved.version}.plan`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  function restore(record) {
    invalidate();
    if (record.fieldSnapshot.geometryHash !== geometryHash) {
      setError("Bu dosyanın parsel sınırı değişmiş. Yeni plan oluştur.");
      return;
    }
    try {
      const p = record.payload;
      const match = targets.find(
        (item) => JSON.stringify(item.target) === JSON.stringify(p.target),
      );
      const target =
        match?.geometry ||
        (p.target.kind === "analysis_review" ? p.target.geometry : null);
      if (!target)
        throw new Error(
          "Hedef sürümü bu ekranda yok. Kaynak reçeteyi aç veya yeni plan oluştur.",
        );
      const flight = coverageFlight(field.geometry, target, p);
      setForm({
        ...p,
        longitude: String(p.home[0]),
        latitude: String(p.home[1]),
        ...Object.fromEntries(numeric.map((key) => [key, String(p[key])])),
      });
      setSelection(match?.id || "field");
      setPreview({
        payload: p,
        flight,
        geometry: target,
        label: match?.label || "Kayıtlı inceleme alanı",
      });
      setSaved(record);
      setName(record.name);
    } catch (cause) {
      setError(cause.message);
    }
  }
  return (
    <section className="qgc-plan" aria-label="QGroundControl uçuş dosyası">
      <p className="qgc-mode">
        Pixhawk 2.4.8 · cihaz doğrulanmadı · yalnızca uçuş
      </p>
      <h3>Tarladan uçuş planına</h3>
      <p>
        Pompa veya dağıtıcı bağlı değil. Bu dosya sulama, gübreleme ya da
        ilaçlama yapmaz. İndeks değişimi yalnızca saha kontrolü hedefidir.
      </p>
      <form onSubmit={generate}>
        <fieldset disabled={busy} aria-label="Uçuş planı ayarları">
          {onPreview && <div className="qgc-home-selection">
            <strong>Kalkış noktası</strong>
            <p>{form.longitude && form.latitude
              ? "Haritadan seçildi · " + Number(form.latitude).toFixed(6) + ", " + Number(form.longitude).toFixed(6)
              : "Haritada kalkış yerine dokun veya önerilen parsel merkezini seç."}</p>
          </div>}
          <label>
            Plan adı
            <input
              value={name}
              required
              maxLength={150}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(null);
                setAck(false);
              }}
            />
          </label>
          <label>
            Tarama hedefi
            <select
              value={selection}
              onChange={(event) => {
                invalidate();
                setSelection(event.target.value);
              }}
            >
              {targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {selected?.preparation && <p>{selected.preparation}</p>}
          {!findings?.targets?.length && (
            <p>
              Uydu hedefleri için Görev panelinde tarihli değişim taramasını aç.
              Kayıtlı reçete bölgeleri de burada seçilebilir.
            </p>
          )}
          <details open>
            <summary>Uçuş ve kalkış noktası</summary>
            <div className="qgc-input-grid">
              <label>
                Yazılım varsayımı
                <select
                  value={form.firmware}
                  onChange={(event) => change("firmware", event.target.value)}
                >
                  <option value="px4">PX4 · doğrulanmadı</option>
                  <option value="ardupilot">ArduCopter · doğrulanmadı</option>
                </select>
              </label>
              <label>
                Drone tipi
                <select
                  required
                  value={form.vehicle}
                  onChange={(event) => change("vehicle", event.target.value)}
                >
                  <option value="">Seçiniz</option>
                  <option value="quad">4 motor</option>
                  <option value="hexa">6 motor</option>
                  <option value="octo">8 motor</option>
                </select>
              </label>
              <label>
                Yazılım sürümü (biliniyorsa)
                <input
                  value={form.firmwareVersion}
                  maxLength={80}
                  onChange={(event) =>
                    change("firmwareVersion", event.target.value)
                  }
                />
              </label>
              {[
                ["longitude", "Kalkış boylamı", -180, 180, "0.000001"],
                ["latitude", "Kalkış enlemi", -85, 85, "0.000001"],
                ["homeAMSL", "Kalkış yüksekliği · AMSL (m)", -500, 9000, "0.1"],
                ["altitude", "Kalkışa göre irtifa (m)", 10, 120, "1"],
                ["speed", "Uçuş hızı (m/sn)", 1, 12, "0.5"],
                ["endurance", "Kullanılabilir uçuş süresi (dk)", 5, 60, "1"],
                ["swath", "Gözlem şeridi genişliği (m)", 2, 100, "1"],
                ["overlap", "Şerit örtüşmesi (%)", 0, 80, "1"],
                ["bearing", "Hat yönü · doğuya göre (°)", 0, 179, "1"],
              ].filter(([key]) => !onPreview || !["longitude", "latitude"].includes(key)).map(([key, label, min, max, step]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    required
                    inputMode="decimal"
                    value={form[key]}
                    min={min}
                    max={max}
                    step={step}
                    onChange={(event) => change(key, event.target.value)}
                  />
                </label>
              ))}
            </div>
            {!onPreview && <button
              type="button"
              disabled={!points?.length}
              onClick={() => {
                invalidate();
                setForm((previous) => ({
                  ...previous,
                  longitude: String(points[0][0]),
                  latitude: String(points[0][1]),
                }));
              }}
            >
              Mevcut rotanın ilk noktasını kalkış seç
            </button>}
            <p>
              AMSL: deniz seviyesine göre ölçülmüş yükseklik. İrtifa araziyi
              takip etmez; kamera ayarlarına uygun gözlem genişliğini operatör
              belirler.
            </p>
          </details>
          <button type="submit" disabled={busy}>
            Tarama rotasını oluştur
          </button>
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
    {field.demo === true && <p>Örnek planı indirebilirsin. Örnek parsel ve rota içerir, QGroundControl simülasyonunda incele.</p>}
      {preview && (
        <section className="qgc-result" aria-label="Uçuş planı önizlemesi">
          <h3>{preview.label}</h3>
          <svg
            viewBox="0 0 320 190"
            role="img"
            aria-label="QGroundControl tarama rotası, kalkış ve dönüş"
          >
            {polygons(field.geometry).map((polygon, index) => (
              <path
                key={index}
                d={polygon
                  .map((ring) => "M" + ring.map(project).join("L") + "Z")
                  .join("")}
                fillRule="evenodd"
                className="qgc-outline"
              />
            ))}
            <polyline
              points={preview.flight.route.map(project).join(" ")}
              className="qgc-route"
            />
            <circle
              cx={project(preview.payload.home).split(",")[0]}
              cy={project(preview.payload.home).split(",")[1]}
              r="4"
              fill="#e9f7b4"
            />
          </svg>
          <dl>
            <div>
              <dt>Tarama hattı</dt>
              <dd>{preview.flight.lanes.length}</dd>
            </div>
            <div>
              <dt>Gidiş ve dönüş</dt>
              <dd>{fmt(preview.flight.distance)} m</dd>
            </div>
            <div>
              <dt>Tahmini süre</dt>
              <dd>{fmt(preview.flight.seconds / 60, 1)} dk</dd>
            </div>
            <div>
              <dt>Hat aralığı</dt>
              <dd>{fmt(preview.flight.spacing, 1)} m</dd>
            </div>
          </dl>
          <p>
            Süre: sabit hız, 2 m/sn dikey hareket ve dönüş başına 2 sn
            varsayımı. %20 süre payı bırakılır. Rüzgâr/batarya modeli ve engel
            kontrolü içermez; kenarlarda tam görüntü kapsamı garanti edilmez.
          </p>
          <p>
            {preview.payload.altitude} m kalkışa göre irtifa ·{" "}
            {preview.payload.firmware.toUpperCase()}{" "}
            {preview.payload.firmwareVersion || "sürüm bilinmiyor"} · fiziksel
            cihazda doğrulanmadı.
          </p>
          {preview.preparation && <p>{preview.preparation}</p>}
          <label className="qgc-ack">
            <input
              type="checkbox"
              checked={ack}
              onChange={(event) => setAck(event.target.checked)}
            />{" "}
            Bunun çalıştırılabilir bir uçuş dosyası olduğunu; QGroundControl’de
            yazılım, kalkış, irtifa, engel, dönüş/iniş ve uçuş güvenliği
            kontrolü gerektiğini biliyorum.
          </label>
          {!saved ? (
            <button
              disabled={!canWrite || !ack || busy || !name.trim()}
              onClick={save}
            >
              {busy ? "Kaydediliyor…" : "Planı kaydet"}
            </button>
          ) : (
            <button disabled={!ack || busy} onClick={download}>
              {busy ? "Hazırlanıyor…" : ".plan dosyasını indir"}
            </button>
          )}
          {!canWrite && <p>Plan kaydetmek için düzenleme yetkisi gerekli.</p>}
          <p>
            QGroundControl → Plan → dosyadan aç. Ardından desteklenen
            bağlantıyla görev araca yüklenir. Dosyayı karta kopyalamak uçuş
            başlatmaz. Bu ekrandan araca komut gönderilmez. Geofence ve
            kamera/pompa komutu eklenmez.
          </p>
        </section>
      )}
      {!!files.length && (
        <details>
          <summary>Kayıtlı uçuş planları ({files.length})</summary>
          {files.map((record) => (
            <button
              key={record.id}
              disabled={busy}
              onClick={() => restore(record)}
            >
              {record.name} · v{record.version}
              {record.fieldSnapshot.geometryHash !== geometryHash
                ? " · eski sınır"
                : ""}
            </button>
          ))}
        </details>
      )}
    </section>
  );
}
