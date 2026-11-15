import { useMemo, useState } from "react";
import { containsPoint, metricFrame } from "../../../shared/spatial";
import { mergeMissionRecords } from "../../../shared/mission-evidence";
import ParcelMap from "../fields/ParcelMap";
import QgcPlanPanel from "./QgcPlanPanel";
import "./flight-planner.css";

export default function FlightPlanner({ field, fields, onField, context, records, canWrite }) {
  const frame = useMemo(() => metricFrame(field.geometry), [field.geometry]);
  const [home, setHome] = useState(null);
  const [preview, setPreview] = useState(null);
  const [notice, setNotice] = useState("");
  const [added, setAdded] = useState([]);
  const allRecords = useMemo(() => mergeMissionRecords(records, added), [records, added]);
  const layers = useMemo(() => {
    const point = preview?.payload.home || home;
    return [
      ...(point ? [{ name: "Kalkış ve dönüş", color: "#a84623",
        geometry: { type: "Point", coordinates: point } }] : []),
      ...(preview ? [{ name: "Tarama rotası", color: "#e9bf4b",
        geometry: { type: "LineString", coordinates: preview.flight.route } }] : []),
    ];
  }, [home, preview]);

  function selectHome(point) {
    if (!containsPoint(field.geometry, point)) {
      setNotice("Kalkış için seçili parselin içinde bir noktaya dokun.");
      return;
    }
    setHome(point);
    setNotice("Kalkış noktası seçildi. Koordinatlar plana otomatik işlendi.");
  }
  return <div className="flight-planner">
    <header>
      <div><p>DRONE · GÖREV HAZIRLIĞI</p><h1>Uçuş planı</h1>
        <p>Tarlanı seç, kalkış yerini haritada işaretle ve QGroundControl planını indir.</p></div>
      <label>Parsel seç<select aria-label="Parsel seç" value={field.id} onChange={event => onField(event.target.value)}>
        {fields.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
    </header>
    <section className="flight-desktop-app" aria-label="AgroMax QGroundControl masaüstü">
      <img src="/brand/agromax-icon-32.png" width="32" height="32" alt="" />
      <div><strong>AgroMax Masaüstü</strong>
        <p>AgroMax ve QGroundControl’e aynı uygulama penceresinden eriş.</p>
        <details><summary>Windows kurulumu ve plan açma</summary>
          <p>Masaüstü sürümünde bu düğme aynı pencerede QGroundControl planını açar.
            Planı indirdikten sonra üst çubuktaki <b>İndirilen planı aç</b> düğmesini kullan.</p>
          <a href="https://github.com/RumeliFatihi51/agromax-platform-upgrade/releases"
            target="_blank" rel="noreferrer">Windows uygulamasını indir</a>
        </details>
      </div>
      <a className="flight-desktop-launch" href="agromax-qgc://open">Masaüstünde aç</a>
    </section>
    <div className="flight-planner-layout">
      <section className="flight-planner-map" aria-label="Uçuş planı haritası">
        <ParcelMap fields={[field]} activeFieldId={field.id} height="clamp(400px, 72vh, 850px)"
          onMapPoint={selectHome} projectLayers={layers} />
        <div className="flight-planner-map-note">
          <strong>{preview ? "Tarama rotası hazır" : home ? "Kalkış noktası seçildi" : "Haritada kalkış noktasını seç"}</strong>
          <p>Enlem ve boylam seçtiğin noktadan otomatik alınır.</p>
          {!home && containsPoint(field.geometry, frame.center) &&
            <button className="secondary" onClick={() => selectHome(frame.center)}>Parsel merkezini başlangıç seç</button>}
          {notice && <p role="status">{notice}</p>}
        </div>
      </section>
      <aside className="flight-planner-settings" aria-label="Uçuş planı ayarları">
        <QgcPlanPanel field={field} geometryHash={context.geometryHash} active records={allRecords}
          points={[]} canWrite={canWrite} onRecords={items => setAdded(current => mergeMissionRecords(current, items))}
          homePoint={home} onPreview={setPreview} />
      </aside>
    </div>
  </div>;
}
