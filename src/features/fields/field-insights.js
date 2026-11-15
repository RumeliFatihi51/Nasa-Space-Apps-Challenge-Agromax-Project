// A screening rule for which observations to inspect, not an agronomic diagnosis.
export const indicators = [
  { id: "NDVI", label: "Bitki örtüsünün canlılık sinyali", detail: "Yaprak ve bitki örtüsünün uydudan görülen yeşillik sinyalini izler." },
  { id: "NDMI", label: "Bitki örtüsünün nem sinyali", detail: "Yapraklardaki su içeriğiyle ilişkili bir sinyaldir. Toprak nemini doğrudan ölçmez." },
  { id: "NDRE", label: "Yaprakların klorofil sinyali", detail: "Klorofille ilişkili değişimleri izler. Tek başına gübre ihtiyacını göstermez." },
];

export const reviewDrop = 0.10;

export function summarizeFieldAnalysis(analysis) {
  const rows = indicators.map(indicator => {
    const { current, previous } = analysis?.comparison?.[indicator.id] || {};
    const minimum = Number.isFinite(analysis?.minimumCoverage) ? analysis.minimumCoverage : 0.7;
    const usable = period => Number.isFinite(period?.mean)
      && period.observations >= 2 && period.meanCoverage >= minimum;
    const delta = usable(current) && usable(previous)
      ? Math.round((current.mean - previous.mean) * 10000) / 10000 : null;
    return { ...indicator, current, previous, delta };
  });
  const comparable = rows.filter(row => row.delta !== null);
  const drops = comparable.filter(row => row.delta <= -reviewDrop);
  const latestDate = (analysis?.observations || [])
    .filter(row => indicators.some(({ id }) => Number.isFinite(row?.stats?.[id]?.mean)))
    .map(row => row.from?.slice(0, 10)).filter(Boolean).sort().at(-1);
  const base = { rows, latestDate };
  if (!analysis) return { ...base, tone: "neutral", title: "Henüz tarla durumu çıkaramadım",
    detail: "Bu parselin uydu analizini başlatalım.", action: "Parseli aç ve uydu analizini çalıştır." };
  const moisture = drops.find(row => row.id === "NDMI");
  const vegetation = drops.find(row => row.id === "NDVI");
  if (moisture && vegetation) return { ...base, tone: "urgent", title: "Tarlayı öncelikli kontrol et",
    detail: "Hem bitki örtüsünün yeşillik sinyali hem de nemle ilişkili sinyali önceki döneme göre düştü.",
    action: "Haritada değişimin yoğun olduğu bölgeye git. Toprağın kök derinliğindeki nemini, sulama hattını ve bitkideki belirtileri kontrol et." };
  if (drops.length) return { ...base, tone: "attention", title: "Saha kontrolü öneriyorum",
    detail: drops.map(row => row.label).join(" ve ") + " önceki döneme göre düştü.",
    action: moisture ? "Bir sonraki sulamadan önce kök bölgesindeki nemi kontrol et. İndeks düşüşünün sebebi su açığı dışında bir etken de olabilir."
      : "Değişimin görüldüğü bölgeyi normal görünen bir bölgeyle karşılaştır. Yaprakları ve toprağı yerinde incele." };
  if (comparable.some(({ id }) => id === "NDVI")) return {
    ...base, tone: "steady", title: "Son gözlemde belirgin gerileme görmedim",
    detail: "Karşılaştırabildiğim göstergelerde takip eşiğini aşan bir düşüş yok.",
    action: "Rutin takibe devam et. Sulama kararını kök bölgesi nemi ve son yağışla kontrol et.",
  };
  return { ...base, tone: "neutral", title: "Karar için daha fazla gözlem gerekli",
    detail: "Bu iki dönemi güvenle karşılaştıracak sayıda ve kapsamda gözlem yok.",
    action: "Yeni bir uydu görüntüsü geldiğinde analizi güncelle. Beklerken sulama için saha ölçümünü kullan." };
}
