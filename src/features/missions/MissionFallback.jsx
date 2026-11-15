import { useEffect, useRef } from "react";
import L from "leaflet";
import { defaultBasemap } from "../fields/basemaps";

export default function MissionFallback({
  geometry,
  points,
  route,
  telemetry,
  onPoint,
}) {
  const node = useRef(null),
    overlays = useRef(null),
    update = useRef(onPoint);
  update.current = onPoint;
  useEffect(() => {
    const map = L.map(node.current, { scrollWheelZoom: false, maxZoom: 20 });
    const { url, options } = defaultBasemap;
    L.tileLayer(url, options).addTo(map);
    const boundary = L.geoJSON(geometry, {
      style: { color: "#fff1bf", fillOpacity: 0.12, weight: 2 },
    }).addTo(map);
    map.fitBounds(boundary.getBounds(), { padding: [28, 28], maxZoom: 18 });
    overlays.current = L.layerGroup().addTo(map);
    map.on("click", (event) =>
      update.current([event.latlng.lng, event.latlng.lat]),
    );
    return () => {
      overlays.current = null;
      map.remove();
    };
  }, [geometry]);
  useEffect(() => {
    const group = overlays.current;
    if (!group) return;
    group.clearLayers();
    const latlng = (point) => [point[1], point[0]];
    if (route.length > 1)
      L.polyline(route.map(latlng), {
        color: "#7aebd7",
        weight: 3,
        dashArray: "6 5",
      }).addTo(group);
    points.forEach((point) =>
      L.circleMarker(latlng(point), {
        radius: 5,
        color: "#192e26",
        fillColor: "#ffd087",
        fillOpacity: 1,
      }).addTo(group),
    );
    if (telemetry)
      L.circleMarker(latlng(telemetry.point), {
        radius: 7,
        color: "#fff",
        fillColor: telemetry.live ? "#5dc2ff" : "#4ae5c2",
        fillOpacity: 1,
      }).addTo(group);
  }, [geometry, points, route, telemetry]);
  return (
    <div
      ref={node}
      className="mission-fallback"
      aria-label="2D görev haritası"
    />
  );
}
