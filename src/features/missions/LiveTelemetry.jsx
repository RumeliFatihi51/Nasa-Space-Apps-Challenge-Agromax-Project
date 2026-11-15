import { useEffect, useRef, useState } from "react";
import { Radio, Unplug, Video } from "lucide-react";
import { localSerialAvailable, openSerialTelemetry } from "./serial-telemetry";

const labels = {
  offline: "Port kapalı",
  connecting: "Seri port açılıyor…",
  waiting: "PX4 veya ArduPilot sinyali bekleniyor",
  stale: "Telemetri zaman aşımına uğradı",
  ready: "Cihaz sinyali alınıyor",
  fault: "Bağlantı kesildi",
};
const value = (input, unit = "") =>
  Number.isFinite(input)
    ? input.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + unit
    : "Veri yok";

export default function LiveTelemetry({ onSample }) {
  const [baud, setBaud] = useState(57600),
    [sample, setSample] = useState({ state: "offline" }),
    [error, setError] = useState("");
  const [camera, setCamera] = useState(null),
    [cameraState, setCameraState] = useState("idle"),
    [cameraError, setCameraError] = useState("");
  const connection = useRef(null);
  const capture = useRef(null),
    video = useRef(null);
  useEffect(
    () => () => {
      connection.current?.abort();
      onSample(null);
    },
    [onSample],
  );
  useEffect(() => () => capture.current?.abort(), []);
  useEffect(() => {
    if (camera && video.current) video.current.srcObject = camera;
  }, [camera]);
  const active = !["offline", "fault"].includes(sample.state);
  function disconnect() {
    connection.current?.abort();
    connection.current = null;
    setSample({ state: "offline" });
    setError("");
    onSample(null);
  }
  async function connect() {
    const controller = new AbortController();
    connection.current = controller;
    setSample({ state: "connecting" });
    setError("");
    try {
      await openSerialTelemetry(baud, controller.signal, (next) => {
        if (controller.signal.aborted) return;
        setSample(next);
        onSample(next);
      });
    } catch (cause) {
      if (controller.signal.aborted) return;
      const cancelled = cause?.name === "NotFoundError";
      setSample({ state: cancelled ? "offline" : "fault" });
      setError(
        cancelled
          ? "Seri port seçilmedi."
          : "Port okunamadı. USB bağlantısını kontrol et ve cihazı kullanan diğer uygulamaları kapat.",
      );
      onSample(null);
    } finally {
      if (connection.current === controller) connection.current = null;
    }
  }
  function closeCamera() {
    capture.current?.abort();
    capture.current = null;
    setCamera(null);
    setCameraError("");
    setCameraState("idle");
  }
  async function openCamera() {
    const controller = new AbortController();
    capture.current = controller;
    setCameraState("opening");
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
      });
      const stop = () => stream.getTracks().forEach((track) => track.stop());
      if (controller.signal.aborted) {
        stop();
        return;
      }
      controller.signal.addEventListener("abort", stop, { once: true });
      const [track] = stream.getVideoTracks();
      if (!track) {
        stop();
        throw new Error("Görüntü kanalı bulunamadı.");
      }
      track.addEventListener(
        "ended",
        () => {
          closeCamera();
          setCameraError("Yerel video bağlantısı kesildi.");
        },
        { once: true },
      );
      setCamera(stream);
      setCameraState("ready");
    } catch {
      if (controller.signal.aborted) return;
      closeCamera();
      setCameraError(
        "Video kaynağı açılamadı. Tarayıcı iznini ve USB video alıcısını kontrol et.",
      );
    }
  }
  const p = sample.position;
  const facts = [
    [
      "Cihaz",
      sample.vehicle
        ? sample.vehicle + " · Sistem " + sample.system
        : "Veri yok",
    ],
    ["İrtifa · deniz seviyesi", value(p?.altitudeMslM, " m")],
    ["İrtifa · kalkış noktasına göre", value(p?.altitudeAboveHomeM, " m")],
    ["Yer hızı", value(p?.groundSpeedMps, " m/sn")],
    ["Yön", value(p?.headingDegrees, "°")],
    [
      "Batarya",
      Number.isFinite(sample.batteryPercent)
        ? "%" + value(sample.batteryPercent)
        : "Veri yok",
    ],
    [
      "Motor etkinleştirme",
      sample.armed === null || sample.armed === undefined
        ? "Veri yok"
        : sample.armed
          ? "Etkin"
          : "Kapalı",
    ],
    [
      "Görev durumu",
      sample.mission
        ? [sample.mission.state, "Sıra " + sample.mission.sequence]
            .filter(Boolean)
            .join(" · ")
        : "Veri yok",
    ],
    [
      "Son konum paketi",
      p ? new Date(p.receivedAt).toLocaleTimeString("tr-TR") : "Veri yok",
    ],
  ];
  return (
    <section className="mission-live" aria-label="Canlı cihaz telemetrisi">
      <h3>
        <Radio size={17} /> MAVLink · salt okunur
      </h3>
      <div
        className="mission-link-state"
        data-state={sample.state}
        role="status"
      >
        {labels[sample.state]}
      </div>
      <p>
        PX4 veya ArduPilot telemetri portunu USB ile bağla. Uçuş kontrolcüsünün
        ayarındaki port hızını seç.
      </p>
      {localSerialAvailable() ? (
        <div className="mission-serial-controls">
          <label>
            Seri port hızı
            <select
              value={baud}
              disabled={active}
              onChange={(event) => setBaud(Number(event.target.value))}
            >
              {[9600, 38400, 57600, 115200, 230400, 460800, 921600].map(
                (speed) => (
                  <option key={speed} value={speed}>
                    {speed} baud
                  </option>
                ),
              )}
            </select>
          </label>
          {active ? (
            <button onClick={disconnect}>
              <Unplug size={15} /> Bağlantıyı kes
            </button>
          ) : (
            <button onClick={connect}>USB portu seç</button>
          )}
        </div>
      ) : (
        <p>
          USB seri erişim, destekleyen masaüstü Chrome veya Edge tarayıcısında
          HTTPS ya da localhost üzerinden açılır.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <dl>
        {facts.map(([label, text]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      {sample.state === "ready" && !p && (
        <p>Cihaz sinyali var. Güncel konum paketi bekleniyor.</p>
      )}
      {p && (
        <p>
          WGS84 · {p.longitude.toFixed(6)}, {p.latitude.toFixed(6)}
        </p>
      )}
      <details
        className="mission-video"
        onToggle={(event) => {
          if (!event.currentTarget.open && capture.current) closeCamera();
        }}
      >
        <summary>
          <Video size={16} /> Yerel video alıcısı
        </summary>
        <p>
          USB video alıcını tarayıcının kamera ayarından seç. Görüntü bu cihazda
          kalır ve telemetriyle otomatik eşleşmez.
        </p>
        {navigator.mediaDevices?.getUserMedia &&
          (cameraState === "idle" ? (
            <button onClick={openCamera}>Yerel görüntüyü aç</button>
          ) : (
            <button onClick={closeCamera}>
              {cameraState === "opening"
                ? "İsteği iptal et"
                : "Görüntüyü kapat"}
            </button>
          ))}
        {cameraState === "opening" && (
          <p role="status">Tarayıcı video izni bekleniyor…</p>
        )}
        {cameraError && <p role="alert">{cameraError}</p>}
        {camera && (
          <>
            <video
              ref={video}
              aria-label="Yerel video görüntüsü"
              autoPlay
              playsInline
              muted
            />
            <small>
              {camera.getVideoTracks()[0]?.label ||
                "Tarayıcının seçtiği video kaynağı"}
            </small>
          </>
        )}
      </details>
      <p>
        Telemetri yerel tarayıcıda işlenir. Görev aktarımı ve uçuş komutları
        kapalı.
      </p>
    </section>
  );
}
