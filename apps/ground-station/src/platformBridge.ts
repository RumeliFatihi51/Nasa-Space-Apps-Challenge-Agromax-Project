import {useSimulationStore} from './modules/telemetry/simulationStore';
import {computeParcelMetrics} from './modules/gis/gisUtils';
if(window.innerWidth<900)useSimulationStore.getState().setPanels({leftPanelOpen:false,rightPanelOpen:false,bottomPanelOpen:false});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='agromax.station.context')return;
  const field=event.data.field;
  const geometry=field?.geometry;
  if(typeof field?.id!=='string'||typeof field.name!=='string')return;
  if(geometry?.type!=='Polygon'||geometry.coordinates?.length!==1) {
    useSimulationStore.getState().addLog('WARNING','GIS','Bu laboratuvar tek halkalı Polygon destekler. Çok parçalı/delikli gerçek sınır değiştirilmedi; temsili örnek açık.');return;
  }
  const coords=geometry.coordinates[0];
  if(!Array.isArray(coords)||coords.length<4||coords.length>2500||!coords.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85))return;
  const metrics=computeParcelMetrics(coords);
  useSimulationStore.getState().importParcel({id:field.id,name:field.name,coordinates:metrics.closedCoords,
    cropType:field.crop||'Ürün belirtilmedi',areaHectares:metrics.areaHectares,perimeterMeters:metrics.perimeterMeters,
    center:metrics.center,elevationM:0});
  useSimulationStore.getState().addLog('INFO','GIS','AgroMax parsel sınırı alındı. Sahne rölyefi, ürünler, RF ve spektral çıktılar simülasyondur; gerçek ölçüm değildir.');
});
window.addEventListener('keydown',event=>{if(event.key==='Escape')window.parent.postMessage({type:'agromax.station.close'},location.origin);});
window.parent.postMessage({type:'agromax.station.ready'},location.origin);

window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='agromax.station.request-snapshot')return;
  const s=useSimulationStore.getState();
  window.parent.postMessage({type:'agromax.station.snapshot',payload:{simulation:true,
    elapsedSeconds:s.simTimeSec,metric:s.activeSpectralIndex,missionName:(s.missionPlan?.name||'Simülasyon').slice(0,150),
    waypointCount:s.missionPlan?.waypoints.length||0,distanceM:s.drone.distanceFlownM,
    batteryPercent:s.drone.batteryPct,progressPercent:s.drone.missionProgressPct}},location.origin);
});
