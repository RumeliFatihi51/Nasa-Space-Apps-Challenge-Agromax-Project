import { memo, useRef, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { api } from "../../api";
import { sensorMetrics } from "../../../shared/field-observations";
import {
  changeLabels,
  missionEvidence,
} from "../../../shared/mission-evidence";

const fmt = (value, digits = 3) =>
  Number.isFinite(value)
    ? value.toLocaleString("tr-TR", { maximumFractionDigits: digits })
    : "Veri yok";
const today = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
const messages = {
  no_source: "Bu rota elle hazırlandı. Bağlı uydu dayanağı bulunmuyor.",
  awaiting_capture:
    "Aynı kaynak ve yöntemden daha yeni bir uydu gözlemi bekleniyor.",
  baseline_missing:
    "Yeni çekim var. Görevin başlangıç ölçümü mevcut katalogda bulunamadığı için fark hesaplanmadı.",
  periods_overlap:
    "Yeni çekim var. Ölçüm dönemleri eksik veya örtüşüyor. Karşılaştırma için ayrı dönemler gerekli.",
  coverage_insufficient:
    "Yeni çekim var. Geçerli piksel kapsamı bilinmiyor veya kaynağın kalite eşiğini karşılamıyor. Fark hesaplanmadı.",
};

export default memo(function MissionFeedback({
  fieldId,
  geometryHash,
  records,
  observations,
  canWrite,
  onRecords,
  onRefresh,
  onNavigate,
}) {
  const [selected, setSelected] = useState(""),
    [waypoint, setWaypoint] = useState(0);
  const [measurement, setMeasurement] = useState(false),
    [metric, setMetric] = useState("soilMoisture");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const editor = useRef(null);
  const reviews = records.filter(
    (record) =>
      record.kind === "investigation" &&
      record.status !== "archived" &&
      record.fieldId === fieldId &&
      record.fieldSnapshot.geometryHash === geometryHash &&
      record.payload.simulationReview,
  );
  const review = reviews.find((record) => record.id === selected) || reviews[0];
  const evidence = review && missionEvidence(review, records, observations);
  const point =
    review?.payload.simulationReview.waypoints[waypoint] ||
    review?.payload.simulationReview.waypoints[0];
  async function refresh() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api(`platform/fields/${fieldId}`, undefined, "GET");
      if (data.context.geometryHash !== geometryHash)
        throw new Error(
          "Parsel sınırı değişti. Görev ekranını güncel sınırla yeniden aç.",
        );
      onRecords(data.records);
      onRefresh();
      setNotice("Saha kayıtları yenilendi. Uydu kataloğu kontrol ediliyor.");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(event) {
    event.preventDefault();
    if (!canWrite || busy || !review) return;
    const form = event.currentTarget,
      input = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    const coordinate = [
      Number(input.get("longitude")),
      Number(input.get("latitude")),
    ];
    try {
      const { record } = await api("platform/records", {
        fieldId,
        kind: "observation",
        name: `Görev bulgusu · nokta ${waypoint + 1}`,
        payload: {
          category: measurement ? "sensor" : "crop",
          observedAt: input.get("observedAt"),
          notes: input.get("notes"),
          coordinate,
          missionFinding: {
            reviewId: review.id,
            reviewVersion: review.version,
            waypointIndex: waypoint,
            observedChange: input.get("observedChange"),
          },
          ...(measurement && {
            sensor: {
              device: input.get("device"),
              metric,
              value: Number(input.get("reading")),
            },
          }),
        },
      });
      onRecords([record]);
      form.reset();
      setMeasurement(false);
      if (editor.current) editor.current.open = false;
      setNotice(
        "Saha bulgusu görevin bu sürümüne bağlandı ve parsel geçmişine kaydedildi.",
      );
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mission-feedback"
      aria-label="Göreve bağlı saha bulguları"
    >
      <header>
        <div>
          <small>GÖREV → SAHA → YENİ GÖZLEM</small>
          <h3>Sahada ne gördün?</h3>
        </div>
        <button
          onClick={refresh}
          disabled={busy}
          aria-label="Saha ve uydu kayıtlarını yenile"
          title="Saha ve uydu kayıtlarını yenile"
        >
          <RefreshCw size={16} />
        </button>
      </header>
      {review ? (
        <>
          <label>
            İnceleme görevi
            <select
              value={review.id}
              onChange={(event) => {
                setSelected(event.target.value);
                setWaypoint(0);
                setError("");
                setNotice("");
              }}
            >
              {reviews.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name} · v{item.version}
                </option>
              ))}
            </select>
          </label>
          <ol
            className="mission-evidence-steps"
            aria-label="Saha doğrulama durumu"
          >
            <li data-complete="true">
              <b>01</b>
              <span>Rota kayıtlı</span>
            </li>
            <li data-complete={evidence.checked > 0}>
              <b>02</b>
              <span>
                {evidence.checked}/
                {review.payload.simulationReview.waypoints.length} nokta
                kontrolü
              </span>
            </li>
            <li data-complete={!!evidence.comparison}>
              <b>03</b>
              <span>
                {evidence.newer ? "Yeni uydu çekimi" : "Yeni çekim bekleniyor"}
              </span>
            </li>
          </ol>
          {canWrite && (
            <details className="mission-finding-editor" ref={editor}>
              <summary>Saha bulgusu ekle</summary>
              <form key={review.id + ":" + waypoint} onSubmit={save}>
                <label>
                  İnceleme noktası
                  <select
                    value={waypoint}
                    onChange={(event) =>
                      setWaypoint(Number(event.target.value))
                    }
                  >
                    {review.payload.simulationReview.waypoints.map(
                      (p, index) => (
                        <option key={index} value={index}>
                          {index === 0
                            ? "Kalkış / nokta 1"
                            : `Nokta ${index + 1}`}{" "}
                          · {p.map((v) => v.toFixed(5)).join(", ")}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Saha gözlemi tarihi
                  <input
                    name="observedAt"
                    type="date"
                    required
                    defaultValue={today()}
                    max={today()}
                  />
                </label>
                <label>
                  Gözlem sonucu
                  <select name="observedChange" defaultValue="uncertain">
                    {Object.entries(changeLabels).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ne gözlemledin?
                  <textarea
                    name="notes"
                    required
                    maxLength={4000}
                    rows={3}
                    placeholder="Bitkinin ve toprağın durumunu, ölçüm koşullarını kaydet."
                  />
                </label>
                <details>
                  <summary>Gözlemin konumu</summary>
                  <p>
                    Konum seçilen rota noktasından alınır. Saha kaydının yeri
                    farklıysa düzelt.
                  </p>
                  <label>
                    Gözlem boylamı
                    <input
                      name="longitude"
                      type="number"
                      required
                      step="any"
                      min="-180"
                      max="180"
                      defaultValue={point?.[0]}
                    />
                  </label>
                  <label>
                    Gözlem enlemi
                    <input
                      name="latitude"
                      type="number"
                      required
                      step="any"
                      min="-85"
                      max="85"
                      defaultValue={point?.[1]}
                    />
                  </label>
                </details>
                <label>
                  <input
                    type="checkbox"
                    checked={measurement}
                    onChange={(event) => setMeasurement(event.target.checked)}
                  />
                  Cihazla ölçüm yaptım
                </label>
                {measurement && (
                  <div className="mission-finding-measurement">
                    <label>
                      Ölçüm cihazı
                      <input
                        name="device"
                        required
                        maxLength={150}
                        placeholder="Cihaz adı veya kayıt numarası"
                      />
                    </label>
                    <label>
                      Ölçüm türü
                      <select
                        value={metric}
                        onChange={(event) => setMetric(event.target.value)}
                      >
                        {Object.entries(sensorMetrics).map(([id, item]) => (
                          <option key={id} value={id}>
                            {item.label} · {item.unit}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Ölçüm değeri · {sensorMetrics[metric].unit}
                      <input
                        name="reading"
                        type="number"
                        required
                        step="any"
                        min={sensorMetrics[metric].min}
                        max={sensorMetrics[metric].max}
                      />
                    </label>
                  </div>
                )}
                <p>
                  Bu kayıt kullanıcı saha gözlemidir. Simülasyon, bir uçuşun
                  yapıldığını veya değişimin nedenini doğrulamaz.
                </p>
                <button className="mission-start" disabled={busy}>
                  <Check size={15} />
                  {busy ? "Kaydediliyor…" : "Saha bulgusunu kaydet"}
                </button>
              </form>
            </details>
          )}
          {evidence.findings.length > 0 && (
            <details>
              <summary>{evidence.findings.length} saha kaydı</summary>
              <ol className="mission-findings">
                {evidence.findings.map((record) => (
                  <li key={record.id}>
                    <time>{record.payload.observedAt}</time>
                    <strong>
                      Nokta {record.payload.missionFinding.waypointIndex + 1} ·{" "}
                      {
                        changeLabels[
                          record.payload.missionFinding.observedChange
                        ]
                      }
                    </strong>
                    <p>{record.payload.notes}</p>
                    {record.payload.sensor && (
                      <p>
                        {sensorMetrics[record.payload.sensor.metric].label} ·{" "}
                        <b>
                          {fmt(record.payload.sensor.value)}{" "}
                          {sensorMetrics[record.payload.sensor.metric].unit}
                        </b>{" "}
                        · {record.payload.sensor.device}
                      </p>
                    )}
                    <small>
                      Kullanıcı kaydı · görev v
                      {record.payload.missionFinding.reviewVersion} · gözlem v
                      {record.version}
                    </small>
                  </li>
                ))}
              </ol>
            </details>
          )}
          <div
            className="mission-reassessment"
            aria-label="Uyduyla yeniden değerlendirme"
          >
            <h3>Uyduyla yeniden kontrol</h3>
            {evidence.comparison ? (
              <>
                <table>
                  <caption>
                    {evidence.comparison.metric} · kayıtlı dönemlerin parsel
                    ortalaması
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Çekim</th>
                      <th scope="col">Ortalama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      evidence.comparison.baseline,
                      evidence.comparison.after,
                    ].map((item) => (
                      <tr key={item.id + item.date}>
                        <th scope="row">{item.date}</th>
                        <td>{fmt(item.metrics[evidence.comparison.metric])}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Yeni − başlangıç</th>
                      <td>
                        {evidence.comparison.delta > 0 ? "+" : ""}
                        {fmt(evidence.comparison.delta)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                <p>
                  {review.payload.simulationReview.satellite.provider} ·{" "}
                  {review.payload.simulationReview.satellite.method}. İndeks
                  farkı parsel geneline aittir. Müdahalenin etkisini veya
                  noktasal ölçümü göstermez.
                </p>
                <details>
                  <summary>Ölçüm dönemleri ve kaynaklar</summary>
                  {[
                    evidence.comparison.baseline,
                    evidence.comparison.after,
                  ].map((item) => (
                    <p key={item.id + item.date}>
                      {item.period.from.slice(0, 10)} →{" "}
                      {item.period.to.slice(0, 10)} (bitiş hariç) · analiz{" "}
                      {item.id.slice(0, 8)} · kapsam{" "}
                      {Number.isFinite(
                        item.coverage?.[evidence.comparison.metric],
                      )
                        ? fmt(
                            item.coverage[evidence.comparison.metric] * 100,
                            1,
                          ) + "%"
                        : "Veri yok"}
                    </p>
                  ))}
                </details>
              </>
            ) : (
              <p>{messages[evidence.state]}</p>
            )}
            <button
              className="mission-link"
              onClick={() => onNavigate("temporal", fieldId)}
            >
              Parselin tüm saha kayıtlarını aç
            </button>
          </div>
        </>
      ) : (
        <p>
          İncelenen rotayı saha incelemesine kaydet. Nokta bazında gözlemler ve
          sonraki uydu çekimleri bu dosyada buluşur.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
});
