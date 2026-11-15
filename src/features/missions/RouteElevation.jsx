import { memo, useMemo } from "react";
import { Mountain } from "lucide-react";
import { routeGroundProfile } from "../../../shared/drone-mission";
import { useTerrainSample } from "../spatial/map-terrain";

const fmt = (value, digits = 1) =>
  Number.isFinite(value)
    ? value.toLocaleString("tr-TR", { maximumFractionDigits: digits })
    : "Veri yok";

export default memo(function RouteElevation({ plan, frame, droneTerrain }) {
  const dem = useTerrainSample(frame, !plan.error && !droneTerrain);
  const terrain = droneTerrain ?? dem;
  const profile = useMemo(
    () => routeGroundProfile(plan, frame, terrain),
    [plan, frame, terrain],
  );
  if (plan.error) return null;
  const range = profile?.coverage
    ? Math.max(1, profile.maximum - profile.minimum)
    : 1;
  const low = profile?.coverage
    ? (profile.maximum + profile.minimum - range) / 2
    : 0;
  let follows = false;
  const line = profile?.samples
    .map((sample) => {
      if (sample.elevation === null) {
        follows = false;
        return "";
      }
      const x = 38 + (388 * sample.distance) / plan.distance,
        y = 93 - (73 * (sample.elevation - low)) / range;
      const command = (follows ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
      follows = true;
      return command;
    })
    .join(" ");
  return (
    <section
      className="mission-history mission-elevation"
      aria-label="Rota boyunca zemin profili"
    >
      <h3>
        <Mountain size={16} /> Rota boyunca zemin profili
      </h3>
      {!terrain && <p role="status">Yükseklik verisi alınıyor…</p>}
      {dem?.error && !droneTerrain && (
        <p role="status">Bölgesel yükseklik verisine ulaşılamadı.</p>
      )}
      {profile && profile.coverage > 0 && (
        <>
          <svg
            viewBox="0 0 454 117"
            role="img"
            aria-label="Rota mesafesine göre DEM zemin profili"
          >
            {[20, 56.5, 93].map((y, index) => (
              <g key={y}>
                <line x1="38" y1={y} x2="426" y2={y} />
                <text x="33" y={y + 3} textAnchor="end">
                  {fmt(low + range * (1 - index / 2))} m
                </text>
              </g>
            ))}
            <path d={line} />
            {profile.samples.map((sample, index) =>
              sample.elevation === null ? null : (
                <circle
                  key={index}
                  cx={38 + (388 * sample.distance) / plan.distance}
                  cy={93 - (73 * (sample.elevation - low)) / range}
                  r={profile.samples.length > 30 ? 1 : 2}
                />
              ),
            )}
            <text x="38" y="110">
              0 m
            </text>
            <text x="426" y="110" textAnchor="end">
              {fmt(plan.distance, 0)} m
            </text>
          </svg>
          <p>
            {droneTerrain ? "Kayıtlı drone DTM" : "Mapzen Terrain Tiles"} · DEM
            grid aralığı {fmt(terrain.resolution)} m · geçerli örnek %
            {fmt(profile.coverage * 100, 0)}
          </p>
          <p>
            Zemin kotu {fmt(profile.minimum)}–{fmt(profile.maximum)} m. Kaynakta
            olmayan örnekler grafikte boş kalır.
          </p>
        </>
      )}
      {profile?.coverage === 0 && (
        <p>Bu rota boyunca geçerli yükseklik örneği yok.</p>
      )}
      <p>
        Bu profil zemin örneklerinden hesaplanır. Ağaç, enerji hattı, yapı ve
        hava sahası kontrolü saha doğrulaması gerektirir.
      </p>
    </section>
  );
});
