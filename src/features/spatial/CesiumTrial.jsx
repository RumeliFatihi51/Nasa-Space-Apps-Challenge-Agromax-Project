import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Viewer, Cesium3DTileset, Color, Cartesian3, HeadingPitchRange,
  Ion, Cartographic, Math as CMath, buildModuleUrl, ClassificationType } from "cesium";
import { polygons } from "../../../shared/spatial";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./cesium-view.css";

// Google imagery is visual context; measurements remain in AgroMax's analysis layers.
export default function CesiumTrial({ field, frame, onClose }) {
  const mount = useRef(null), dialog = useRef(null), camera = useRef(null);
  const [status, setStatus] = useState("Google 3D ve gerçek yüzey yüksekliği yükleniyor…");
  useEffect(() => {
    let disposed = false, viewer, tiles, removeError, removeLoaded;
    const previous = document.activeElement;
    let ready = false;
    const fail = message => { if (!disposed) onClose(message); };
    const keyboard = event => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const controls = [...dialog.current.querySelectorAll('button, a[href], [tabindex="0"]')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    // Covers endpoint access, height sampling AND visible tile loading.
    const timer = setTimeout(() => fail("Google 3D görüntüsü zamanında alınamadı. Mapbox görünümü korunuyor."), 45000);
    async function open() {
      try {
        buildModuleUrl.setBaseUrl("/cesium/");
        Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
        viewer = new Viewer(mount.current, { globe: false, baseLayer: false, geocoder: false,
          animation: false, timeline: false, baseLayerPicker: false, homeButton: false,
          sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false,
          infoBox: false, selectionIndicator: false, requestRenderMode: true });
        viewer.resolutionScale = Math.min(1, 1.5 / window.devicePixelRatio);
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 20;
        tiles = await Cesium3DTileset.fromIonAssetId(2275207, {
          accessToken: import.meta.env.VITE_CESIUM_ION_TOKEN,
          maximumScreenSpaceError: window.innerWidth < 800 ? 32 : 20,
          cacheBytes: 64 * 1024 ** 2, maximumCacheOverflowBytes: 32 * 1024 ** 2 });
        if (disposed) { tiles.destroy(); return; }
        viewer.scene.primitives.add(tiles);
        // An ellipsoid-height target can put the camera underneath high terrain.
        const positions = await viewer.scene.sampleHeightMostDetailed([Cartographic.fromDegrees(...frame.center)]);
        if (disposed) return;
        const height = positions[0]?.height;
        if (!Number.isFinite(height)) { fail("Bu parselde Google 3D yüzey kapsamı doğrulanamadı. Mapbox görünümü korunuyor."); return; }
        camera.current = top => {
          viewer.camera.lookAt(Cartesian3.fromDegrees(...frame.center, height),
            new HeadingPitchRange(0, CMath.toRadians(top ? -90 : -35), Math.max(500, frame.span * 4)));
          viewer.scene.requestRender();
        };
        camera.current(false);
        for (const polygon of polygons(field.geometry)) for (const ring of polygon) {
          viewer.entities.add({ polyline: { positions: ring.map(point => Cartesian3.fromDegrees(...point)),
            clampToGround: true, classificationType: ClassificationType.CESIUM_3D_TILE,
            width: 3, material: Color.fromCssColorString("#d8f2a5") } });
        }
        removeError = tiles.tileFailed.addEventListener(() => {
          if (!disposed) {
            if (!ready) fail("Google 3D görüntü parçaları alınamadı. Mapbox görünümü korunuyor.");
            else setStatus("Bazı Google 3D parçaları alınamadı; Mapbox’a dönebilirsiniz.");
          }
        });
        removeLoaded = tiles.tileVisible.addEventListener(() => {
          if (!disposed && !ready) {
            ready = true; clearTimeout(timer);
            setStatus("Google 3D · Gerçek arazi görüntüsü. Analiz değerleri için Mapbox’a dönün.");
          }
        });
        viewer.scene.requestRender();
      } catch {
        fail("Google 3D açılamadı. Mapbox görünümü korunuyor.");
      }
    }
    open();
    return () => {
      disposed = true; clearTimeout(timer); removeError?.(); removeLoaded?.(); camera.current = null;
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      document.removeEventListener("keydown", keyboard);
      previous?.focus?.();
    };
  }, [field, frame, onClose]);
  return createPortal(<section ref={dialog} className="google-3d-view" role="dialog" aria-modal="true" aria-label="Google 3D arazi görünümü">
    <div ref={mount} className="google-3d-mount" />
    <div className="google-3d-toolbar">
      <div><span>AGROMAX / GOOGLE 3D</span><strong>{field.name}</strong></div>
      <div className="google-3d-controls" role="toolbar" aria-label="3D kamera ve kaynak">
        <button type="button" onClick={() => camera.current?.(false)}>Arazi açısı</button>
        <button type="button" onClick={() => camera.current?.(true)}>Üstten bak</button>
        <button type="button" onClick={() => onClose()} autoFocus>Mapbox görünümüne dön</button>
      </div>
    </div>
    <p className="google-3d-status" role="status">{status}</p>
  </section>, document.body);
}
