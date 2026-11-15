import { useEffect, useRef, useState } from "react";
import { apiBinaryResponse } from "../../api";
import MissionControl from "./MissionControl";
import "./flight-deck.css";

const base = "http://127.0.0.1:5189";
const labels = { upload: "Görevi yükle ve geri oku", verify: "Cihazdaki görevi doğrula", start: "Görevi başlat", pause: "Görevi duraklat", rtl: "Kalkış noktasına dön" };
const fmt = (n, unit) => Number.isFinite(n) ? n.toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + unit : "Veri yok";

export default function FlightDeck(props) {
  const connectionPanel = useRef(null);
  const [token, setToken] = useState("");
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [uploaded, setUploaded] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [notice, setNotice] = useState("");
  const files = props.records.filter(record => record.kind === "flight_plan" &&
    record.status !== "archived" && record.fieldId === props.field.id &&
    record.fieldSnapshot?.geometryHash === props.context.geometryHash);
  const plan = files.find(item => item.id === selected);
  const planKey = plan ? plan.id + ":" + plan.version : "";
  const live = status?.connected === true;
  const health = status?.telemetry?.health;
  const ready = live && health && ["gyro", "accelerometer", "magnetometer", "position", "home"].every(key => health[key] === true);
  const mayCommand = props.canWrite && live && status?.commandsEnabled && !busy;
  const verified = uploaded?.key === planKey && uploaded?.epoch === status?.epoch &&
    uploaded?.fingerprint === status?.verified?.fingerprint && !!status?.verified && !status?.uncertain;

  useEffect(() => {
    if (!session) return;
    let timer;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch(base + "/status", {
          headers: { Authorization: "Bearer " + session },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3500)]),
        });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || "Bağlantı reddedildi.");
        if (value.schema !== 1 || !["live", "sitl"].includes(value.mode)) throw new Error("Köprü sürümü uyumsuz.");
        if (!controller.signal.aborted) { setStatus(value); setError(""); }
      } catch {
        if (!controller.signal.aborted) { setStatus(null); setError("Yerel köprüye ulaşılamadı. Köprüyü, tarayıcının yerel ağ iznini ve eşleştirme anahtarını kontrol et."); }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 1000);
      }
    }
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [session]);
  useEffect(() => { setConfirmation(""); setAcknowledged(false); }, [planKey, status?.epoch]);

  async function send(action) {
    setBusy(true); setError(""); setNotice("");
    const command = { id: crypto.randomUUID(), action, epoch: status.epoch, confirmed: true,
      fingerprint: status.verified?.fingerprint };
    try {
      if (action === "upload") {
        setUploaded(null);
        const response = await apiBinaryResponse(`platform/records/${plan.id}/qgc-plan?version=${plan.version}`);
        command.plan = await response.json();
      }
      const response = await fetch(base + "/command", {
        method: "POST", headers: { Authorization: "Bearer " + session, "Content-Type": "application/json" },
        body: JSON.stringify(command), signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || result.message || "Komut doğrulanamadı.");
      if (action === "upload" || action === "verify") {
        const response = await fetch(base + "/status", { headers: { Authorization: "Bearer " + session }, signal: AbortSignal.timeout(3500) });
        if (!response.ok) throw new Error("İşlem sonrası durum alınamadı.");
        const value = await response.json();
        setStatus(value);
        if (action === "upload") setUploaded({ key: planKey, epoch: value.epoch, fingerprint: value.verified?.fingerprint });
      }
      setNotice(labels[action] + " · cihaz onayladı. Uçuş durumunu telemetriden takip et.");
    } catch (cause) {
      setUploaded(null);
      setError(cause.message || "Komut sonucu alınamadı. Cihazı kontrol et.");
    } finally { setBusy(false); setConfirmation(""); setAcknowledged(false); }
  }
  const position = live ? status.telemetry?.position : null;
  const externalDevice = position ? { state: "ready",
    position: { ...position, groundSpeedMps: status.telemetry?.velocity?.groundSpeedMps },
    batteryPercent: status.telemetry?.battery?.remainingPercent,
    armed: status.telemetry.armed } : { state: "stale" };
  return <div className="flight-deck">
    <header className="flight-deck-heading">
      <div><p>AGROMAX · UÇUŞ MERKEZİ</p><h1>Tarladan uçuşa.</h1><p>Planla, simülatörde incele, görevi doğrula ve uçuşu takip et.</p></div>
      <span className="flight-link-badge" data-ready={live}>{!session ? "Köprü bağlı değil" : !status ? "Köprüye ulaşılamıyor" : status.mode === "sitl" ? "SITL · " + (live ? "Telemetri güncel" : "Cihaz bekleniyor") : "Gerçek cihaz · " + (live ? "Salt okunur telemetri" : "Güncel sinyal bekleniyor")}</span>
    </header>
    <details className="flight-connection" ref={connectionPanel}>
      <summary>Cihaz bağlantısı ve görev aktarımı · {live ? "Telemetri alınıyor" : "Bağlantıyı aç"}</summary>
      <div className="flight-steps"><span>01 · Görev planı</span><span>02 · Cihaz bağlantısı</span><span>03 · Geri okuma</span><span>04 · Uçuş takibi</span></div>
      <details open={!session}>
        <summary>Saha köprüsü bağlantısı</summary>
        <p>Bilgisayarında AgroMax Flight Bridge’i çalıştır. Konsolda gösterilen anahtarla bu tarayıcıyı eşleştir. Gerçek cihaz modu bu sürümde salt okunur, görev komutları yerel SITL testine açıktır.</p>
        <form onSubmit={event => { event.preventDefault(); setSession(token); setToken(""); setUploaded(null); }}>
          <label>Eşleştirme anahtarı<input type="password" autoComplete="off" required minLength={20} value={token} onChange={event => setToken(event.target.value)} /></label>
          <button className="primary" disabled={busy}>Köprüye bağlan</button>
          {session && <button type="button" className="secondary" disabled={busy} onClick={() => { setSession(null); setStatus(null); setUploaded(null); }}>Bağlantıyı kapat</button>}
        </form>
      </details>
      <dl className="flight-facts">
        <div><dt>Motorlar</dt><dd>{!live ? "Veri yok" : status.telemetry.armed === true ? "Etkin" : "Kapalı"}</dd></div>
        <div><dt>İrtifa · kalkışa göre</dt><dd>{fmt(position?.altitudeAboveHomeM, " m")}</dd></div>
        <div><dt>Hız</dt><dd>{fmt(status?.telemetry?.velocity?.groundSpeedMps, " m/sn")}</dd></div>
        <div><dt>Batarya</dt><dd>{fmt(status?.telemetry?.battery?.remainingPercent, " %")}</dd></div>
        <div><dt>Görev noktası</dt><dd>{status?.telemetry?.progress ? status.telemetry.progress.current + " / " + status.telemetry.progress.total : "Veri yok"}</dd></div>
        <div><dt>Görev eşleşmesi</dt><dd>{verified ? "Geri okunarak doğrulandı" : "Doğrulama gerekli"}</dd></div>
      </dl>
      <div className="flight-transfer">
        <label>Kayıtlı uçuş planı<select value={plan?.id || ""} onChange={event => { setSelected(event.target.value); setUploaded(null); }}>
          <option value="">Bir uçuş planı seç</option>
          {files.map(file => <option key={file.id} value={file.id}>{file.name} · v{file.version}</option>)}
        </select></label>
        <button className="secondary" disabled={!mayCommand || !plan || status?.telemetry?.armed !== false} onClick={() => setConfirmation("upload")}>Yükle ve doğrula</button>
        <button className="secondary" disabled={!mayCommand || !uploaded || !plan || status?.telemetry?.armed !== false} onClick={() => setConfirmation("verify")}>Yeniden doğrula</button>
        <button className="primary" disabled={!mayCommand || !verified || !ready || !status?.telemetry?.identity || status?.telemetry?.armed !== true || !(status?.telemetry?.battery?.remainingPercent >= 30)} onClick={() => setConfirmation("start")}>Görevi başlat</button>
        <button className="secondary" disabled={!mayCommand} onClick={() => setConfirmation("pause")}>Duraklat</button>
        <button className="secondary" disabled={!mayCommand || !health?.home} onClick={() => setConfirmation("rtl")}>Eve dön</button>
      </div>
      {!files.length && <p>Haritadaki “.plan” panelinden uçuş planını oluştur ve kaydet. Bu parselin güncel sınırına ait planlar burada görünür.</p>}
      {session && <p>Bağlantı kontrolü {ready ? "· Konum ve kalibrasyon bilgileri hazır." : "· Güncel konum, kalkış noktası ve sensör kalibrasyonu bekleniyor."} Başlatma için görev eşleşmesi ve motorların yer istasyonundan etkinleştirilmesi gerekir.</p>}
      {confirmation && <div className="flight-confirm" role="group" aria-label="Uçuş işlemini onayla">
        <strong>{labels[confirmation]}</strong>
        <p>{plan?.name} · {props.field.name} · {status?.mode === "sitl" ? "SITL oturumu" : "Gerçek cihaz"} · Cihaz {status?.telemetry?.identity?.uid || "Kimlik bekleniyor"} · Yazılım {status?.telemetry?.identity?.version || "Veri yok"}</p>
        <label><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /> Hedef cihazı, görevi ve mevcut durumu kontrol ettim.</label>
        <button className="primary" disabled={!acknowledged || !mayCommand} onClick={() => send(confirmation)}>Onayla ve gönder</button>
        <button className="secondary" disabled={busy} onClick={() => setConfirmation("")}>Vazgeç</button>
      </div>}
      {busy && <p role="status">Cihaz yanıtı bekleniyor…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!!status?.events?.length && <details><summary>Bağlantı oturumunun işlem defteri</summary><ol>{status.events.slice(-10).toReversed().map((event, i) =>
        <li key={i}>{new Date(event.time * 1000).toLocaleTimeString("tr-TR")} · {labels[event.action] || event.action} · {{ requested: "Gönderim kaydı oluşturuldu", acknowledged: "Cihaz onayladı", uncertain: "Sonuç belirsiz, cihazı kontrol et" }[event.state] || event.state}</li>)}</ol></details>}
    </details>
    <MissionControl {...props} externalDevice={session ? externalDevice : undefined}
      onExternalTelemetry={() => {
        if (!connectionPanel.current) return;
        connectionPanel.current.open = true;
        connectionPanel.current.scrollIntoView({ block: "nearest" });
      }} />
  </div>;
}
