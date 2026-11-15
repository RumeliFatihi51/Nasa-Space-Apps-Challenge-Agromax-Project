import { Activity, BatteryMedium, Drone, Radio } from "lucide-react";
import { useEffect } from "react";

const fmt = (value, digits = 1) =>
  Number.isFinite(value)
    ? value.toLocaleString("tr-TR", { maximumFractionDigits: digits })
    : "—";
const deviceStates = {
  offline: "Port kapalı",
  connecting: "Port açılıyor",
  waiting: "Sinyal bekleniyor",
  ready: "Cihaz sinyali",
  stale: "Veri güncel değil",
  fault: "Bağlantı kesildi",
};

export default function MissionHud({ simulation, live, device, onOpen, map }) {
  useEffect(() => {
    if (!map || typeof ResizeObserver === "undefined") return;
    const host = map.getContainer().closest(".mission-map");
    const attribution = map
      .getContainer()
      .querySelector(".maplibregl-ctrl-bottom-right");
    if (!host || !attribution) return;
    const update = () =>
      host.style.setProperty(
        "--mission-attribution-height",
        Math.ceil(attribution.getBoundingClientRect().height) + "px",
      );
    const observer = new ResizeObserver(update);
    observer.observe(attribution);
    update();
    return () => {
      observer.disconnect();
      host.style.removeProperty("--mission-attribution-height");
    };
  }, [map]);
  if (!simulation && !live) return null;
  const height = live
    ? device?.position?.altitudeAboveHomeM
    : simulation?.altitude;
  const speed = live ? device?.position?.groundSpeedMps : simulation?.speed;
  const battery = live ? device?.batteryPercent : simulation?.battery;
  return (
    <button
      className="mission-hud"
      onClick={onOpen}
      aria-label="Uçuş özetinden telemetriyi aç"
      data-live={live}
    >
      <span className="mission-hud-heading">
        {live ? <Radio size={13} /> : <Drone size={14} />}
        <span>{live ? "CİHAZ" : "SİMÜLASYON"}</span>
        <b>
          {live
            ? deviceStates[device?.state] || "Cihaz bağlı değil"
            : simulation.phase}
        </b>
        <Activity size={13} />
      </span>
      <span className="mission-hud-readings">
        <span>
          <small>{live ? "Kalkışa göre" : "Zemine göre · AGL"}</small>
          <strong>
            {fmt(height)}
            <i> m</i>
          </strong>
        </span>
        <span>
          <small>Yer hızı</small>
          <strong>
            {fmt(speed)}
            <i> m/sn</i>
          </strong>
        </span>
        <span data-low={Number.isFinite(battery) && battery < 25}>
          <small>
            <BatteryMedium size={12} />
            {live ? "Batarya" : "Batarya varsayımı"}
          </small>
          <strong>
            {fmt(battery, 0)}
            <i> %</i>
          </strong>
        </span>
      </span>
    </button>
  );
}
