import { useEffect, useRef, useState } from "react";
import { Activity, ArrowUpRight, Beaker, Database, Download, FileText, MapPin } from "lucide-react";
import { api, apiBinary } from "../../api";
import ParcelMap from "../fields/ParcelMap";
import "./terra-brain.css";

const root = "v1/terra-brain";
const kinds = {
  soil: ["Toprak profili", "field_capacity,wilting_point,root_depth_m,initial_depletion_mm,unit"],
  weather: ["Günlük meteoroloji", "date,et0_mm,effective_rain_mm,crop_coefficient,temperature_c"],
  forecast_weather: ["Hava tahmini arşivi", "date,et0_mm,effective_rain_mm,crop_coefficient,temperature_c"],
  irrigation: ["Sulama kaydı", "date,gross_mm"],
  moisture: ["Toprak nemi ölçümü", "date,top_cm,bottom_cm,moisture,unit"],
};
const jobLabels = { import: "Veri içe aktarımı", water_balance: "Su dengesi deneyi",
  evaluation: "Ölçüm karşılaştırması", replay: "Yeniden üretim", research: "Araştırma incelemesi",
  forecast: "Araştırma tahmini" };
const states = { queued: "Kuyrukta", running: "Hesaplanıyor", succeeded: "Tamamlandı",
  failed: "İşlem başarısız", canceled: "İptal edildi" };
const n = value => value == null ? "Veri yok" :
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
const seasonNow = () => new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0);

function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TerraBrain({ fields, initialField, initialRun, latest, connected, canWrite, onNavigate }) {
  const drawn = fields.filter(field => field.geometry && !field.deletedAt);
  const field = drawn.find(item => item.id === initialField) || drawn[0];
  const [season, setSeason] = useState(() => field?.demo ? 2025 : seasonNow());
  const [mode, setMode] = useState(initialRun || latest ? "reports" : field?.demo ? "experiment" : "data");
  const [enabled, setEnabled] = useState(connected ? null : false);
  const [openingRun, setOpeningRun] = useState(!!initialRun || latest);
  const [openingId, setOpeningId] = useState(initialRun);
  const [fault, setFault] = useState(null);
  useEffect(() => {
    if (!connected) return;
    const control = new AbortController();
    api(root + "/status", undefined, "GET", { signal: control.signal })
      .then(status => setEnabled(status.enabled))
      .catch(error => { if (!control.signal.aborted) setFault(error); });
    return () => control.abort();
  }, [connected]);
  useEffect(() => {
    if (!enabled || (!initialRun && !latest) || !field) return;
    const control = new AbortController();
    const target = initialRun ? "/jobs/" + encodeURIComponent(initialRun) :
      "/fields/" + encodeURIComponent(field.id) + "/twin";
    api(root + target, undefined, "GET", { signal: control.signal })
      .then(({ job, twin }) => {
        job ||= twin;
        if (!job) { setMode("data"); return; }
        if (job.fieldId !== field.id) throw new Error("Bu çalışma seçili parsele ait değil.");
        setSeason(job.season);
        setOpeningId(job.id);
      }).catch(error => { if (!control.signal.aborted) setFault(error); })
      .finally(() => { if (!control.signal.aborted) setOpeningRun(false); });
    return () => control.abort();
  }, [enabled, initialRun, latest, field?.id]);
  return <div className="terra">
    <header className="terra-hero">
      <span className="px-kicker">AgroMax Terra Brain</span>
      <h1>Araştırma</h1>
      <p>Trakya kışlık buğdayında saha verilerini incele, iki sulama planının su dengesini karşılaştır.</p>
    </header>
    {fault ? <p className="terra-notice" role="alert">{fault.message}</p> : enabled === null ?
      <p className="terra-notice" role="status">Araştırma erişimi kontrol ediliyor…</p> : !enabled ?
      <p className="terra-notice">Araştırma pilotu bu işletmede etkin değil.</p> : !field ?
      <section className="terra-notice"><p>Araştırma için sınırı çizilmiş bir parsel seç.</p>
        <button className="secondary" onClick={() => onNavigate("fields")}>Parselleri aç <ArrowUpRight size={16} /></button>
      </section> : <>
      <div className="terra-context">
        <label><MapPin size={16} /> Parsel<select value={field.id}
          onChange={event => { const next = drawn.find(item => item.id === event.target.value); setSeason(next?.demo ? 2025 : seasonNow()); setOpeningId(""); onNavigate("terra-brain", event.target.value); }}>
          {drawn.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select></label>
        <label>Sezon başlangıç yılı<input type="number" min={1980} max={2100} value={season}
          onChange={event => { setSeason(event.target.value); setOpeningId(""); }} /></label>
      </div>
      <nav className="terra-nav" aria-label="Araştırma çalışma alanı">
        {[["data", "Veri ve harita", Database], ["experiment", "Deney ve tahmin", Beaker],
          ["reports", "Araştırma raporları", FileText], ["jobs", "İş durumu", Activity]]
          .map(([id, label, Icon]) => <button type="button" key={id}
            aria-pressed={mode === id} onClick={() => setMode(id)}><Icon size={17} />{label}</button>)}
      </nav>
      {openingRun ? <p role="status">Araştırma açılıyor…</p> :
        Number(season) >= 1980 && Number(season) <= 2100 ?
        <Pilot key={field.id + ":" + season} field={field} season={Number(season)} mode={mode} setMode={setMode}
          initialRun={openingId} canWrite={canWrite && !field.demo} onNavigate={onNavigate} /> :
        <p className="terra-notice">1980–2100 aralığında bir sezon gir.</p>}
    </>}
  </div>;
}

function Pilot({ field, season, mode, setMode, initialRun, canWrite, onNavigate }) {
  const path = root + "/fields/" + encodeURIComponent(field.id);
  const query = "?season=" + season;
  const [records, setRecords] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [jobId, setJobId] = useState(initialRun || "");
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const [sampleDepth, setSampleDepth] = useState("");
  const [demoBalance, setDemoBalance] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [pollKey, setPollKey] = useState(0);
  const request = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    const opts = { signal: controller.signal };
    Promise.all([api(path + "/observations" + query + "&limit=50", undefined, "GET", opts),
      api(path + "/jobs" + query, undefined, "GET", opts)])
      .then(([observations, runs]) => {
        setRecords(observations);
        setJobs(runs.jobs);
        setNextCursor(runs.nextCursor);
      }).catch(error => { if (!controller.signal.aborted) setError(error); });
    return () => controller.abort();
  }, [path, query, refresh]);
  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    let timer;
    async function poll() {
      try {
        const { job: result } = await api(root + "/jobs/" + encodeURIComponent(jobId), undefined, "GET",
          { signal: controller.signal });
        if (result.fieldId !== field.id || result.season !== season)
          throw new Error("Çalışma bu parsel veya sezona ait değil.");
        setJob(result);
        if (["running", "queued"].includes(result.state)) timer = setTimeout(poll, 2200);
        else setRefresh(count => count + 1);
      } catch (error) { if (!controller.signal.aborted) setError(error); }
    }
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [jobId, field.id, season, pollKey]);
  const scope = { season, geometryVersion: records?.geometryVersion };
  const upload = async (data, dry) => {
    const body = { ...scope, ...data, schemaVersion: 1 };
    if (!dry) return submit("imports", body);
    await act(async () => {
      const preview = await api(path + "/imports?dryRun=true", body);
      setMessage(preview.rowCount + " satır biçim, sezon ve birim kontrolünü geçti.");
    });
  };
  async function act(work) {
    setBusy(true); setError(null); setMessage("");
    try { await work(); } catch (error) { setError(error); } finally { setBusy(false); }
  }
  async function submit(endpoint, body) {
    await act(async () => {
      const signature = JSON.stringify(body);
      if (request.current?.signature !== signature) request.current = { signature, key: crypto.randomUUID() };
      const { job: next } = await api(path + "/" + endpoint, body, "POST",
        { headers: { "Idempotency-Key": request.current.key } });
      request.current = null;
      setJob(next);
      setJobId(next.id);
      setMode(endpoint === "imports" ? "jobs" : "reports");
    });
  }
  const run = data => submit("runs", { ...scope, ...data });
  const list = records?.observations || [];
  const result = job?.result;
  const isOpen = ["queued", "running"].includes(job?.state);
  const visibleJobs = mode === "reports" ? jobs.filter(item => item.kind !== "import") : jobs;
  const selectJob = id => { setJob(null); setJobId(id); setError(null); setPollKey(key => key + 1); };
  return <>
    {field.demo && <p className="terra-provenance">Kaynak: sentetik eğitim verisi · 2025–2026 buğday sezonu</p>}
    {error && <div className="terra-notice" role="alert">
      {error.message}
      {!!error.details?.errors?.length && <ul>{error.details.errors.map(line =>
        <li key={line.row}>Satır {line.row} · {line.reason}</li>)}</ul>}
    </div>}
    {message && <p className="terra-notice" role="status">{message}</p>}
    {!records && !error && <p role="status">Parsel verileri yükleniyor…</p>}
    {mode === "data" && <div className="terra-grid">
      <section className="terra-surface">
        <h2>Parsel ve veri sürümleri</h2>
        <ParcelMap geometry={field.geometry} height={285} compact />
        <div className="terra-table"><table>
          <thead><tr><th>Veri</th><th>Kaynak / yöntem</th><th>Tarih</th><th>Satır</th></tr></thead>
          <tbody>{list.map(item => <tr key={item.id}><td>{kinds[item.kind][0]}</td>
            <td>{item.metadata.source}<small>{item.metadata.measurementMethod}</small></td>
            <td>{item.metadata.observedOn}</td><td>{item.rowCount}</td></tr>)}</tbody>
        </table></div>
        {records && !list.length && <p>Bu parsel sınırı ve sezonda saha kaydı yok.</p>}
        {records?.nextCursor && <button className="secondary" disabled={busy} onClick={() => act(async () => {
          const next = await api(path + "/observations" + query + "&limit=50&cursor=" + encodeURIComponent(records.nextCursor));
          setRecords(current => ({ ...next, observations: [...current.observations,
            ...next.observations.filter(item => !current.observations.some(old => old.id === item.id))] }));
        })}>Daha fazla veri sürümü</button>}
        <button className="secondary" onClick={() => onNavigate("fields", field.id)}>Uydu analizini aç <ArrowUpRight size={15} /></button>
      </section>
      {canWrite && records && <ImportForm onUpload={upload} onError={setError} busy={busy} />}
    </div>}
    {mode === "experiment" && <div className="terra-grid">
      <section className="terra-surface">
        <h2>İki sulama planı</h2>
        <p>İki plan aynı toprak profili, günlük meteoroloji ve başlangıç su açığıyla hesaplanır.</p>
        {field.demo && <form className="terra-experiment-form" onSubmit={event => {
          event.preventDefault();
          act(async () => {
            const query = sampleDepth === "" ? "" : "?irrigation=" + encodeURIComponent(sampleDepth);
            const sample = await api(path + "/demo-balance" + query, undefined, "GET");
            setDemoBalance(sample);
          });
        }}>
          <label>Alternatif planda sulama (mm)
            <input type="number" min="0" max="80" step="1" value={sampleDepth} placeholder="Parselin örnek miktarı"
              onChange={event => { setSampleDepth(event.target.value); setDemoBalance(null); }} />
          </label>
          <div className="terra-actions">
            <button className="primary" disabled={busy}>Sulama planlarını karşılaştır</button>
            {jobs.find(item => item.kind === "water_balance" && item.state === "succeeded") && <button
              className="secondary" type="button" onClick={() => {
                selectJob(jobs.find(item => item.kind === "water_balance" && item.state === "succeeded").id);
                setMode("reports");
              }}>Hazır araştırma raporunu aç</button>}
          </div>
        </form>}
        {canWrite && records && <ExperimentForm field={field} datasets={list} onRun={run} busy={busy} />}
      </section>
      <section className="terra-surface">
        <h2>Yöntem ve kapsam</h2>
        <p>FAO‑56 günlük kök bölgesi su dengesi, Trakya kışlık buğdayı araştırma pilotu.</p>
        <p>Kayıtlı deney ve arşivlenmiş hava tahminiyle 1, 3 ve 7 günlük araştırma tahmini oluşturabilirsin. Model saha doğrulaması bekliyor.</p>
        <button className="secondary" onClick={() => setMode("data")}>Saha kayıtlarına git</button>
      </section>
    </div>}
    {mode === "experiment" && demoBalance && <section className="terra-surface" aria-label="Sulama karşılaştırması">
      <h2>Sulama karşılaştırması</h2>
      <BalanceResult result={demoBalance.result} example />
    </section>}
    {["reports", "jobs"].includes(mode) && <div className="terra-results">
      <section className="terra-surface">
        <div className="terra-heading"><h2>{mode === "reports" ? "Kayıtlı araştırmalar" : "Araştırma işleri"}</h2>
          {canWrite && records && mode === "reports" && <button className="secondary" disabled={busy}
            onClick={() => run({ kind: "research" })}>Veri boşluklarını incele</button>}</div>
        {visibleJobs.length ? <div className="terra-table"><table>
          <thead><tr><th>Çalışma</th><th>Durum</th><th>Oluşturulma</th><th>Aç</th></tr></thead>
          <tbody>{visibleJobs.map(item => <tr key={item.id}>
            <td>{jobLabels[item.kind]}</td><td>{states[item.state]}</td>
            <td>{new Date(item.createdAt).toLocaleString("tr-TR")}</td>
            <td><button className="secondary" aria-pressed={jobId === item.id}
              onClick={() => selectJob(item.id)}>Aç</button></td>
          </tr>)}</tbody>
        </table></div> : <p>Bu sezonda gösterilecek kayıt yok.</p>}
        {nextCursor && <button className="secondary" disabled={busy} onClick={() => act(async () => {
          const next = await api(path + "/jobs" + query + "&cursor=" + encodeURIComponent(nextCursor));
          setJobs(items => [...items, ...next.jobs.filter(item => !items.some(old => old.id === item.id))]);
          setNextCursor(next.nextCursor);
        })}>Daha fazla kayıt</button>}
      </section>
      {job && <section className="terra-surface" aria-label="Seçili araştırma sonucu">
        <div className="terra-heading"><h2>{jobLabels[job.kind]}</h2><span role="status">{states[job.state]}</span></div>
        {records?.geometryVersion && job.geometryVersion !== records.geometryVersion &&
          <p className="terra-notice">Bu çalışma parselin önceki sınır sürümüne ait.</p>}
        {job.error && <p className="terra-notice">{job.error.message}</p>}
        {isOpen && canWrite && <button className="secondary" disabled={busy} onClick={() => act(async () => {
          const { job: updated } = await api(root + "/jobs/" + job.id + "/cancel", {});
          setJob(updated); setPollKey(key => key + 1);
        })}>İptal et</button>}
        {result?.result && <BalanceResult key={job.id} result={result.result} optimization={result.optimization} example={field.demo} />}
        {job.kind === "import" && result && <p>{result.rowCount} satır kaydedildi.</p>}
        {result?.kind === "evaluation" && <Evaluation result={result} />}
        {result?.kind === "forecast" && <Forecast result={result} />}
        {result?.kind === "research" && <>
          <p>{result.missing.length ? "Eksik veri türleri · " + result.missing.map(kind => kinds[kind][0]).join(", ") :
            "İlk inceleme için dört veri türü de mevcut."}</p>
          {!!result.claims?.length && <div className="terra-table"><table>
            <thead><tr><th>İndeks</th><th>Önceki</th><th>Güncel</th><th>Fark</th><th>Geçerli kapsam</th></tr></thead>
            <tbody>{result.claims.map(({id, metric, evidence}) => <tr key={id}>
              <td>{metric}<small>{evidence.source}</small></td><td>{n(evidence.previous.mean)}</td>
              <td>{n(evidence.current.mean)}</td><td>{n(evidence.delta)}</td>
              <td>%{n(evidence.current.meanCoverage * 100)}</td>
            </tr>)}</tbody>
          </table></div>}
          {!!result.questions?.length && <ul>{result.questions.map(question => <li key={question}>{question}</li>)}</ul>}
          {result.limitations && <p>{result.limitations}</p>}
          {result.analysisId && <button className="secondary" onClick={() =>
            onNavigate("field-insights", field.id, { analysis: result.analysisId })}>İlişkili uydu analizini aç</button>}
        </>}
        {!!job.sources?.length && <details className="terra-sources"><summary>Girdi kaynakları ve sürümler</summary>
          <ul>{job.sources.map(source => <li key={source.id}><strong>{kinds[source.kind][0]}</strong> · {source.metadata.source}
            <small>{source.metadata.measurementMethod} · {source.metadata.observedOn} · {source.metadata.normalizedUnit}</small>
            <code>{source.digest}</code></li>)}</ul></details>}
        {job.state === "succeeded" && job.kind !== "import" && <div className="terra-actions">
          <button className="secondary" disabled={busy} onClick={() => act(async () =>
            saveFile(await apiBinary(root + "/jobs/" + job.id + "/report"), "terra-" + job.id + "-v1.json"))}>
            <Download size={15} /> Sürümlü rapor</button>
          {canWrite && result?.result && job.geometryVersion === scope.geometryVersion && <>
            <button className="secondary" disabled={busy} onClick={() => run({ kind: "replay", runId: job.id })}>Yeniden üret</button>
            <EvaluationForm datasets={list} scenarios={result.result.scenarios} onRun={value =>
              run({ kind: "evaluation", runId: job.id, ...value })} busy={busy} />
            <ForecastForm datasets={list} scenarios={result.result.scenarios} onRun={value =>
              run({ kind: "forecast", runId: job.id, ...value })} busy={busy} />
          </>}
        </div>}
      </section>}
    </div>}
  </>;
}

function ImportForm({ onUpload, onError, busy }) {
  const [kind, setKind] = useState("soil");
  return <form className="terra-surface terra-form" onSubmit={async event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const file = values.get("csv");
    if (!file?.size || file.size > 200_000) return onError(new Error("En çok 200 KB boyutunda UTF‑8 CSV seç."));
    try {
      const dry = event.nativeEvent.submitter?.value === "check";
      await onUpload({ kind, csv: await file.text(), source: values.get("source"),
        measurementMethod: values.get("method"),
        origin: kind === "moisture" ? "measurement" : kind === "forecast_weather" ? "provider" : values.get("origin"),
        observedOn: values.get("observed"), permissionConfirmed: values.get("permission") === "on" },
      dry);
    } catch (error) { onError(error); }
  }}>
    <h2>Saha verisi ekle</h2>
    <label>Veri türü<select value={kind} onChange={event => setKind(event.target.value)}>
      {Object.entries(kinds).map(([id, [label]]) => <option key={id} value={id}>{label}</option>)}
    </select></label>
    <button className="secondary" type="button" onClick={() => saveFile(
      new Blob([kinds[kind][1] + "\n"], { type: "text/csv;charset=utf-8" }), "terra-" + kind + "-v1.csv")}>
      <Download size={15} /> CSV şablonu</button>
    <label>UTF‑8 CSV<input name="csv" type="file" accept=".csv,text/csv" required /></label>
    <label>Kaynak adı<input name="source" maxLength={160} required /></label>
    <label>Ölçüm veya hesap yöntemi<input name="method" maxLength={160} required /></label>
    {kind !== "moisture" && kind !== "forecast_weather" && <label>Kaynak türü<select name="origin">
      <option value="measurement">Saha ölçümü</option><option value="provider">Sağlayıcı</option>
      <option value="declaration">Beyan</option>
    </select></label>}
    <label>{kind === "forecast_weather" ? "Tahmin yayın tarihi" : "Kaynak gözlem tarihi"}
      <input type="date" name="observed" required /></label>
    <label className="terra-check"><input type="checkbox" name="permission" required /> Veriyi araştırmada kullanma iznim var.</label>
    <div className="terra-actions"><button className="secondary" value="check" disabled={busy}>Dosyayı kontrol et</button>
      <button className="primary" value="save" disabled={busy}>İşleme al</button></div>
  </form>;
}

function ExperimentForm({ field, datasets, onRun, busy }) {
  const [applications, setApplications] = useState([]);
  const pick = (kind, name, optional = false) => <label>{kinds[kind][0]}
    <select name={name} required={!optional}>
      <option value="">{optional ? "Kayıt seçilmedi · A planı sulamasız" : "Veri sürümü seç"}</option>
      {datasets.filter(item => item.kind === kind).map(item =>
        <option key={item.id} value={item.id}>{item.metadata.observedOn} · {item.metadata.source}</option>)}
    </select>
  </label>;
  return <form className="terra-form" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = key => Number(data.get(key));
    const irrigation = applications.map(item => ({ date: data.get("date-" + item), grossMm: value("mm-" + item) }));
    onRun({ kind: "water_balance", soilId: data.get("soil"), weatherId: data.get("weather"),
      ...(data.get("irrigation") && { irrigationId: data.get("irrigation") }),
      parameters: { sowingDate: data.get("sowing"), depletionFraction: value("fraction") / 100,
        systemEfficiency: value("efficiency") / 100, baseTemperatureC: value("base"),
        waterCostMinorPerM3: Math.round(value("cost") * 100), maxVolumeM3: value("volume"),
        maxCostMinor: Math.round(value("budget") * 100) },
      baseline: { name: "A · Temel plan", irrigation: [] },
      alternative: { name: "B · Alternatif plan", irrigation },
      ...(data.get("optimize") && { optimization: { allowedDays: [...new Set(irrigation.map(row => row.date))],
        depthsMm: [...new Set(irrigation.map(row => row.grossMm))], maxApplications: Math.min(3, irrigation.length) } }) });
  }}>
    {pick("soil", "soil")}{pick("weather", "weather")}{pick("irrigation", "irrigation", true)}
    <label>Ekim tarihi<input name="sowing" type="date" defaultValue={field.sowingDate || ""} required /></label>
    <fieldset><legend>B planının sulama günleri</legend>
      {!applications.length && <p>Sulama günü ekle.</p>}
      {applications.map(id => <div className="terra-application" key={id}>
        <label>Gün<input name={"date-" + id} type="date" required /></label>
        <label>Brüt su (mm)<input name={"mm-" + id} type="number" min="0.1" max="350" step="0.1" required /></label>
        <button type="button" className="secondary" onClick={() =>
          setApplications(all => all.filter(item => item !== id))}>Kaldır</button>
      </div>)}
      <button type="button" className="secondary" onClick={() =>
        setApplications(all => [...all, crypto.randomUUID()])}>Sulama günü ekle</button>
      {applications.length > 0 && applications.length <= 14 && <label className="terra-check">
        <input name="optimize" type="checkbox" /> Bu günlerde bütçeye uyan diğer kombinasyonları tara
      </label>}
    </fieldset>
    <details open><summary>Model ve maliyet girdileri</summary>
      <div className="terra-parameters">
        <label>Stres eşiği (% kullanılabilir su)<input name="fraction" type="number" min="1" max="99" placeholder="Örn. 55" required /></label>
        <label>Sulama verimi (%)<input name="efficiency" type="number" min="1" max="100" required /></label>
        <label>Isıl zaman tabanı (°C)<input name="base" type="number" min="-10" max="20" step="0.1" required /></label>
        <label>Su fiyatı (₺/m³)<input name="cost" type="number" min="0" max="1000" step="0.01" required /></label>
        <label>Su sınırı (m³)<input name="volume" type="number" min="0" max="100000000" step="0.1" required /></label>
        <label>Bütçe sınırı (₺)<input name="budget" type="number" min="0" max="10000000000" step="0.01" required /></label>
      </div>
    </details>
    <button className="primary" disabled={busy || !applications.length || !datasets.some(d => d.kind === "soil") ||
      !datasets.some(d => d.kind === "weather")}>Deneyi çalıştır</button>
  </form>;
}

function BalanceResult({ result, optimization, example }) {
  const [a, b] = result.scenarios;
  const [index, setIndex] = useState(0);
  const day = Math.min(index, a.days.length - 1);
  const x = i => 48 + i * 642 / Math.max(1, a.days.length - 1);
  const y = mm => 178 - mm / result.capacityMm * 150;
  const rows = [["Son gün açığı (mm)", a.finalDepletionMm, b.finalDepletionMm],
    ["Stres günü", a.stressDays, b.stressDays], ["Brüt sulama (m³)", a.volumeM3, b.volumeM3],
    ["Hesaplanan maliyet (₺)", a.costMinor / 100, b.costMinor / 100]];
  return <>
    <section className="terra-advice" aria-label="Sulama asistanı">
      <span className="terra-kicker">Sulama asistanı · {example ? "Eğitim senaryosu" : "Model sonucu"}</span>
      <h3>{a.stressDays === 0 && a.volumeM3 === 0 ? "Bu senaryoda sulamaya gerek görünmüyor" :
        a.stressDays === 0 ? "Temel planda su stresi görünmüyor" :
        b.stressDays < a.stressDays ? "Alternatif plan su stresi günlerini azaltıyor" :
        "Su stresi sürüyor, planı tekrar gözden geçir"}</h3>
      <p>{a.stressDays === 0 ? "Temel planda model stres günü hesaplamadı." :
        `Model, temel planda ${n(a.stressDays)} ve alternatif planda ${n(b.stressDays)} stres günü hesapladı.`}</p>
      <p>{example ? "Bu sonuç sentetik toprak ve hava girdilerine dayanır." :
        "Uygulamadan önce kök bölgesi nemini, yağışı ve su bütçesini kontrol et. Model saha doğrulaması bekliyor."}</p>
    </section>
    <figure className="terra-chart">
      <figcaption>Günlük kök bölgesi su açığı (mm)</figcaption>
      <svg viewBox="0 0 714 206" role="img" aria-label="A ve B sulama planlarının günlük su açığı">
        {[0, 0.5, 1].map(part => <g key={part}>
          <line x1="48" x2="690" y1={y(part * result.capacityMm)} y2={y(part * result.capacityMm)} className="terra-gridline" />
          <text x="40" y={y(part * result.capacityMm) + 4} textAnchor="end">{n(part * result.capacityMm)}</text>
        </g>)}
        <line x1={x(day)} x2={x(day)} y1="26" y2="178" className="terra-focusline" />
        {[a, b].map((scenario, i) => <g key={scenario.name} className={"terra-line-" + i}>
          <polyline points={scenario.days.map((point, j) => x(j) + "," + y(point.depletionMm)).join(" ")} />
          <circle cx={x(day)} cy={y(scenario.days[day].depletionMm)} r="4" />
        </g>)}
        <text x="48" y="199">{a.days[0].date}</text>
        <text x="690" y="199" textAnchor="end">{a.days.at(-1).date}</text>
      </svg>
      <label htmlFor="terra-chart-day">Grafik günü</label>
      <output htmlFor="terra-chart-day">{a.days[day].date}</output>
      <input id="terra-chart-day" type="range" min="0" max={a.days.length - 1} value={day}
        aria-valuetext={a.days[day].date} onChange={event => setIndex(Number(event.target.value))} />
      <div className="terra-chart-values">
        <span>A · {n(a.days[day].depletionMm)} mm</span><span>B · {n(b.days[day].depletionMm)} mm</span>
      </div>
    </figure>
    <div className="terra-table"><table>
      <thead><tr><th>Sonuç</th><th scope="col">A · Temel</th><th scope="col">B · Alternatif</th><th scope="col">B − A</th></tr></thead>
      <tbody>{rows.map(([label, first, second]) => <tr key={label}><th scope="row">{label}</th>
        <td>{n(first)}</td><td>{n(second)}</td><td>{n(second - first)}</td></tr>)}
      <tr><th scope="row">Su ve bütçe sınırı</th><td>{a.feasible ? "Uygun" : "Aşıldı"}</td>
        <td>{b.feasible ? "Uygun" : "Aşıldı"}</td><td>—</td></tr></tbody>
    </table></div>
    <p>ET₀ ±%10 duyarlılığında son gün su açığı A için {n(a.sensitivity.minDepletionMm)}–{n(a.sensitivity.maxDepletionMm)} mm,
      B için {n(b.sensitivity.minDepletionMm)}–{n(b.sensitivity.maxDepletionMm)} mm.</p>
    {optimization && <details className="terra-sources">
      <summary>Sulama takvimi taraması · {optimization.evaluated} aday{optimization.truncated ? " · Kısmi tarama" : ""}</summary>
      {optimization.best && <>
        <p>En az stresli uygun aday · {optimization.best.stressDays} stres günü · {n(optimization.best.volumeM3)} m³ · {n(optimization.best.costMinor / 100)} ₺</p>
        {optimization.best.irrigation.length ? <ul>{optimization.best.irrigation.map(row =>
          <li key={row.date}>{row.date} · {n(row.grossMm)} mm</li>)}</ul> : <p>Seçilen aday sulama içermiyor.</p>}
      </>}
    </details>}
  </>;
}

function EvaluationForm({ datasets, scenarios, onRun, busy }) {
  const measurements = datasets.filter(item => item.kind === "moisture");
  if (!measurements.length) return <p>Ölçümle karşılaştırmak için toprak nemi CSV’si ekle.</p>;
  return <form className="terra-form terra-eval" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onRun({ moistureId: data.get("moisture"), scenarioName: data.get("scenario") });
  }}>
    <label>Ölçüm sürümü<select name="moisture" required>
      {measurements.map(item => <option value={item.id} key={item.id}>{item.metadata.observedOn} · {item.metadata.source}</option>)}
    </select></label>
    <label>Senaryo<select name="scenario">
      {scenarios.map(item => <option key={item.name}>{item.name}</option>)}
    </select></label>
    <button className="secondary" disabled={busy}>Ölçümle karşılaştır</button>
  </form>;
}

function Evaluation({ result }) {
  return <>
    <p>{result.scenario} · {result.count} eşleşen gün · Ortalama mutlak hata {n(result.maeMm)} mm · Yanlılık {n(result.biasMm)} mm</p>
    {!!result.pairs.length && <div className="terra-table"><table>
      <thead><tr><th>Gün</th><th>Ölçümden (mm)</th><th>Model (mm)</th><th>Hata (mm)</th></tr></thead>
      <tbody>{result.pairs.map(point => <tr key={point.date}>
        <td>{point.date}</td><td>{n(point.observedMm)}</td><td>{n(point.modelMm)}</td><td>{n(point.errorMm)}</td>
      </tr>)}</tbody></table></div>}
    {!!result.excluded.length && <details><summary>Eşleşme dışı ölçümler ({result.excluded.length})</summary>
      <ul>{result.excluded.map(point => <li key={point.date}>{point.date} · {point.reason}</li>)}</ul></details>}
  </>;
}

function ForecastForm({ datasets, scenarios, onRun, busy }) {
  const eligible = datasets.filter(item => item.kind === "forecast_weather" &&
    item.metadata.observedOn === scenarios[0]?.days.at(-1)?.date);
  if (!eligible.length) return <p>Araştırma tahmini için son model gününde yayımlanmış hava tahmini CSV’si ekle.</p>;
  return <form className="terra-form terra-eval" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onRun({ weatherId: data.get("weather"), future: { name: data.get("scenario"), irrigation: [] } });
  }}>
    <label>Hava tahmini arşivi<select name="weather" required>
      {eligible.map(item => <option value={item.id} key={item.id}>{item.metadata.observedOn} · {item.metadata.source}</option>)}
    </select></label>
    <label>Başlangıç senaryosu<select name="scenario">
      {scenarios.map(item => <option key={item.name}>{item.name}</option>)}
    </select></label>
    <button className="secondary" disabled={busy}>Sulamasız araştırma tahmini oluştur</button>
  </form>;
}

function Forecast({ result }) {
  return <>
    <p>Hava verisi yayın günü {result.issuedOn} · Araştırma tahmini · Kalibre edilmiş tahmin aralığı bekleniyor.</p>
    <div className="terra-table"><table>
      <thead><tr><th>Ufuk</th><th>Gün</th><th>Model açığı (mm)</th><th>Sabit referans (mm)</th></tr></thead>
      <tbody>{result.horizons.map(row => <tr key={row.horizon}>
        <td>{row.horizon} gün</td><td>{row.date}</td><td>{n(row.modelMm)}</td><td>{n(row.persistenceMm)}</td>
      </tr>)}</tbody>
    </table></div>
  </>;
}
