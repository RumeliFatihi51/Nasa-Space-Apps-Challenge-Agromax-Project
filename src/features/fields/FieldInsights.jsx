import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Leaf, Map, TriangleAlert } from "lucide-react";
import { api } from "../../api";
import useWorkspaceSync from "../../sync/useWorkspaceSync";
import AnalysisReport from "./AnalysisReport";
import { reviewDrop, summarizeFieldAnalysis } from "./field-insights.js";
import "./field-insights.css";

const number = (value, signed = false) => Number.isFinite(value)
  ? new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3, signDisplay: signed ? "exceptZero" : "auto" }).format(value)
  : "Veri yok";
const date = value => new Date(value).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });

export function FieldStatus({ field, analysis, loading, error, onOpen, children }) {
  const summary = summarizeFieldAnalysis(analysis);
  const tone = loading || error ? "neutral" : summary.tone;
  const Icon = ["attention", "urgent"].includes(tone) ? TriangleAlert : tone === "steady" ? Leaf : BookOpen;
  const title = error ? "Tarla özeti alınamadı" : loading ? "Tarla özeti yükleniyor…" :
    !field ? "İlk parselinin analizini burada gör" : summary.title;
  const detail = error ? "Kayıtları yeniden sorgulamak için analiz ekranını aç." :
    loading ? null : !field ? "Uydu gözlemleri geldikçe tarlan için kısa bir durum mesajı burada görünür." : summary.detail;
  return <section className="field-status" data-tone={tone} aria-label="Tarla durumu">
    <span className="field-status-icon"><Icon size={22} aria-hidden="true" /></span>
    <div className="field-status-copy" aria-live="polite">
      <p className="field-status-kicker">{field?.name || "Tarla durumu"} · Tarla asistanı</p>
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
      {!loading && !error && field && summary.action && <p className="field-status-next"><b>Sonraki adım</b> {summary.action}</p>}
      {!loading && !error && (analysis?.demo || summary.latestDate) && <small>
        {analysis?.demo ? "Sentetik gözlem" : "Son uydu gözlemi"}{summary.latestDate && " · " + date(summary.latestDate)}
      </small>}
    </div>
    {children}
    {onOpen && <button type="button" className="primary field-status-action" onClick={onOpen}>
      Anlaşılır analizi aç <ArrowRight size={17} aria-hidden="true" />
    </button>}
  </section>;
}

export default function FieldInsights({ fields, fieldId, archiveId, onNavigate, onFieldChange }) {
  const field = fields.find(item => item.id === fieldId) || (fieldId ? null : fields.find(item => item.geometry) || fields[0]);
  const id = field?.id;
  const revision = useWorkspaceSync();
  const [retry, setRetry] = useState(0);
  const [record, setRecord] = useState(null);
  const requestKey = id ? JSON.stringify([id, archiveId, retry, revision]) : null;
  const current = record?.key === requestKey ? record : null;

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const path = archiveId ? "analyses/" + encodeURIComponent(archiveId) : "records/" + encodeURIComponent(id) + "/analysis";
    api(path, undefined, "GET", { signal: controller.signal }).then(payload => {
      if (controller.signal.aborted) return;
      if (archiveId && (payload.job?.field?.id !== id || payload.job.state !== "completed" || !payload.job.analysis)) {
        throw new Error("Bu parsel için geçmiş sonuç bulunamadı.");
      }
      setRecord({ key: requestKey, analysis: archiveId ? payload.job.analysis : payload.analysis });
    }).catch(() => {
      if (!controller.signal.aborted) setRecord({ key: requestKey, error: true });
    });
    return () => controller.abort();
  }, [id, archiveId, requestKey]);

  const analysis = current?.analysis;
  const { rows } = summarizeFieldAnalysis(analysis);
  return <div className="field-insights">
    <header className="field-insights-heading">
      <div>
        <p>Uydu gözlemleri</p>
        <h1>Anlaşılır analiz</h1>
        <p>Tarlada ne değişti, bu ne anlama geliyor ve sahada neye bakabilirsin?</p>
      </div>
      {!!fields.length && <label>Parsel seç
        <select value={id || ""} onChange={event => onFieldChange(event.target.value)}>
          {!id && <option value="" disabled>Bir parsel seç</option>}
          {fields.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
      </label>}
    </header>
    <FieldStatus field={field} analysis={analysis} loading={!!id && !current} error={current?.error}>
      {current?.error && <button type="button" className="secondary" onClick={() => setRetry(value => value + 1)}>Tekrar dene</button>}
    </FieldStatus>
    {field?.geometry && <section className="field-insights-research">
      <div><h2>Sulama kararını Terra Brain’de karşılaştır</h2>
        <p>Toprak, yağış ve su açığına göre iki planın etkisini gör.</p></div>
      <button type="button" className="primary" onClick={() => onNavigate("terra-brain", id)}>Araştırmayı aç <ArrowRight size={17} /></button>
    </section>}
    {archiveId && id && <p className="field-insights-note">Geçmiş analiz kaydı{analysis && " gösteriliyor"}. <button type="button" className="text-button"
      onClick={() => onFieldChange(id)}>Son analize dön</button></p>}
    {analysis && <>
      <section className="field-insights-data">
        <h2>Uydu tarlada ne gördü?</h2>
        <p>{analysis.range?.from && analysis.range?.to && <>{date(analysis.range.from)} – {date(analysis.range.to)} · </>}{analysis.source}</p>
        <dl className="field-insights-readings">
          {rows.map(row => <div key={row.id}>
            <dt>{row.label} <small>{row.id}</small></dt>
            <dd>
              <strong>{row.delta === null ? "Yeterli karşılaştırma yok" :
                Math.abs(row.delta) < reviewDrop ? "Sınırlı değişim" : row.delta < 0 ? "Azaldı" : "Arttı"}</strong>
              <p>{row.detail}</p>
            </dd>
          </div>)}
        </dl>
        <div className="table-wrap">
          <table>
            <caption>Karşılaştırmada kullanılan değerler</caption>
            <thead><tr><th scope="col">Gösterge</th><th scope="col">Önceki dönem</th><th scope="col">Son dönem</th><th scope="col">Değişim</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.id}><th scope="row">{row.id}</th>
              <td>{number(row.previous?.mean)}</td><td>{number(row.current?.mean)}</td><td>{number(row.delta, true)}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="field-insights-note">Karşılaştırma her dönemde en az iki yeterli kapsama sahip gözlem gerektirir.
          { " " }{number(reviewDrop)} indeks puanı, saha kontrolüne dikkat çekmek için kullanılan bir eştir. Uydu sinyali tek başına hastalık, sulama veya gübre ihtiyacı teşhisi koymaz.</p>
      </section>
      <AnalysisReport analysis={analysis} onAssistant={() => onNavigate("assistant", id)} />
    </>}
    {(!field || current) && <div className="field-insights-actions">
      <button type="button" className="secondary" onClick={() => onNavigate("fields", id || "")}>
        <Map size={17} aria-hidden="true" /> {analysis ? "Uydu haritası ve teknik indeksler" : field ? "Parseli aç ve uydu analizi başlat" : "Parselleri aç"}
      </button>
      {id && <button type="button" className="secondary" onClick={() => onNavigate("history", id)}>Analiz geçmişi</button>}
      {id && <button type="button" className="secondary" onClick={() => onNavigate("terra-brain", id)}>Parsel araştırması</button>}
    </div>}
  </div>;
}
