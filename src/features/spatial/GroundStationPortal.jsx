import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { api } from "../../api";
import "./ground-station-portal.css";
export default function GroundStationPortal({
  field,
  onClose,
  canWrite = false,
}) {
  const frame = useRef(null),
    close = useRef(null),
    pending = useRef(false);
  const [source, setSource] = useState(null);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const previous = document.activeElement,
      overflow = document.body.style.overflow;
    const controller = new AbortController();
    let context;
    const load = api(`platform/fields/${field.id}`, undefined, "GET", {
      signal: controller.signal,
    })
      .then((value) => (context = value.context))
      .catch((error) => {
        if (!controller.signal.aborted) setNotice(error.message);
      });
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const key = (event) => {
      if (event.key === "Escape") onClose();
    };
    const receive = async (event) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      if (event.data?.type === "agromax.station.ready") {
        try {
          await load;
          if (controller.signal.aborted || !context) return;
          setSource(context.latestAnalysis);
          setReady(true);
          frame.current.contentWindow.postMessage(
            {
              type: "agromax.station.context",
              field: {
                id: field.id,
                name: field.name,
                geometry: context.field.geometry,
                crop: context.field.crop,
              },
              geometryHash: context.geometryHash,
              latestAnalysis: context.latestAnalysis,
              comparison: context.comparison,
            },
            location.origin,
          );
        } catch (error) {
          if (!controller.signal.aborted) setNotice(error.message);
        }
      }
      if (
        event.data?.type === "agromax.station.snapshot" &&
        pending.current &&
        context &&
        canWrite
      ) {
        pending.current = false;
        try {
          const { record } = await api("platform/records", {
            fieldId: field.id,
            kind: "laboratory_run",
            name:
              "Laboratuvar simülasyonu · " + new Date().toLocaleString("tr-TR"),
            payload: {
              ...event.data.payload,
              geometryHash: context.geometryHash,
              simulation: true,
            },
          });
          if (!controller.signal.aborted)
            setNotice(
              "Temsili çalışma kaydedildi · v" +
                record.version +
                " · Filiz ve kanıt paketinde erişilebilir.",
            );
        } catch (error) {
          if (!controller.signal.aborted) setNotice(error.message);
        } finally {
          if (!controller.signal.aborted) setBusy(false);
        }
      }
      if (event.data?.type === "agromax.station.close") onClose();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("message", receive);
    return () => {
      controller.abort();
      pending.current = false;
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", key);
      window.removeEventListener("message", receive);
      if (previous?.isConnected) previous.focus();
    };
  }, [field.id, onClose, canWrite]);
  function save() {
    pending.current = true;
    setBusy(true);
    setNotice("");
    frame.current?.contentWindow?.postMessage(
      { type: "agromax.station.request-snapshot" },
      location.origin,
    );
  }
  return (
    <section
      className="station-portal"
      role="dialog"
      aria-modal="true"
      aria-label="Uydu ve Drone Simülasyon Laboratuvarı"
    >
      <header>
        <div>
          <small>AGROMAX / SİMÜLASYON LABORATUVARI</small>
          <strong>{field.name}</strong>
        </div>
        <span>
          Temsili sahne · Simüle RF, uydu ve uçuş verileri
          {source && (
            <small title={source.source}>
              Platform kaydı · {source.observationCount} gözlem
            </small>
          )}
        </span>
        <button disabled={!ready || busy || !canWrite} onClick={save}>
          {busy ? "Kaydediliyor…" : "Çalışmayı platforma kaydet"}
        </button>
        <button ref={close} onClick={onClose}>
          <X size={18} />
          Stüdyoya dön
        </button>
      </header>
      {notice && (
        <p className="station-save-notice" role="status">
          {notice}
        </p>
      )}
      {!ready && (
        <p className="station-loading" role="status">
          3D operasyon sahnesi hazırlanıyor…
        </p>
      )}
      <iframe
        ref={frame}
        src="/ground-station/index.html"
        title="Uydu ve Drone Kontrol Merkezi"
        sandbox="allow-scripts allow-same-origin allow-downloads"
        allow="fullscreen"
      />
    </section>
  );
}
