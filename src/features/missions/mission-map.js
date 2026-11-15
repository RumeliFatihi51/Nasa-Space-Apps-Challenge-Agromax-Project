import { useEffect, useRef } from "react";
import {
  cameraFootprint,
  flightFrame,
  simulationTrace,
} from "../../../shared/drone-mission";
import { Marker, MercatorCoordinate } from "maplibre-gl";
import {
  AmbientLight,
  Box3,
  Camera,
  DirectionalLight,
  Group,
  Matrix4,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const droneUrl = "/visuals/mission-drone.glb";
const features = (route, points) => ({
  type: "FeatureCollection",
  features: [
    ...(route.length >= 2
      ? [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates: route },
            properties: {},
          },
        ]
      : []),
    ...points.map((point, index) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: point },
      properties: { index },
    })),
  ],
});

export function useMissionRoute(map, route, points) {
  useEffect(() => {
    if (!map) return;
    map.addSource("mission-route", { type: "geojson", data: features([], []) });
    map.addLayer({
      id: "mission-trace-bg",
      type: "line",
      source: "mission-route",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": "#152b25", "line-width": 7 },
    });
    map.addLayer({
      id: "mission-trace",
      type: "line",
      source: "mission-route",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": "#89f2df",
        "line-width": 3,
        "line-dasharray": [3, 1],
      },
    });
    map.addLayer({
      id: "mission-points",
      type: "circle",
      source: "mission-route",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": ["case", ["==", ["get", "index"], 0], 8, 6],
        "circle-color": [
          "case",
          ["==", ["get", "index"], 0],
          "#ecfbb1",
          "#ffd087",
        ],
        "circle-stroke-color": "#192f29",
        "circle-stroke-width": 2,
      },
    });
    return () => {
      if (!map.getStyle()) return;
      for (const id of ["mission-points", "mission-trace", "mission-trace-bg"])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource("mission-route")) map.removeSource("mission-route");
    };
  }, [map]);
  useEffect(() => {
    map?.getSource("mission-route")?.setData(features(route, points));
  }, [map, route, points]);
}

export function useWaypointHandles(map, route, points, enabled, onMove) {
  const current = useRef(null),
    handles = useRef([]);
  current.current = { route, points, onMove };
  useEffect(() => {
    if (!map || !enabled) return;
    handles.current = current.current.points.map((point, index) => {
      // The built-in marker supports pointer, touch and arrow-key dragging.
      const handle = new Marker({
        draggable: true,
        scale: 0.75,
        color: index === 0 ? "#e6f2ae" : "#ffc77b",
        className: "mission-waypoint-handle",
      })
        .setLngLat(point)
        .addTo(map);
      const element = handle.getElement();
      element.setAttribute("role", "button");
      element.setAttribute(
        "aria-label",
        `Nokta ${index + 1} · sürükle veya yön tuşlarıyla taşı`,
      );
      element.setAttribute(
        "aria-keyshortcuts",
        "ArrowUp ArrowDown ArrowLeft ArrowRight",
      );
      element.setAttribute("data-number", String(index + 1));
      element.title = `Nokta ${index + 1} · sürükle veya yön tuşlarıyla taşı`;
      const stop = (event) => event.stopPropagation();
      element.addEventListener("click", stop);
      handle.on("drag", () => {
        const preview = current.current.points.map((value, i) =>
          i === index ? handle.getLngLat().toArray() : value,
        );
        map
          .getSource("mission-route")
          ?.setData(
            features(
              preview.length > 1 ? [...preview, preview[0]] : [],
              preview,
            ),
          );
      });
      handle.on("dragend", () => {
        const { route, points, onMove } = current.current;
        map.getSource("mission-route")?.setData(features(route, points));
        if (!onMove(index, handle.getLngLat().toArray()))
          handle.setLngLat(points[index]);
      });
      return { handle, element, stop };
    });
    return () => {
      for (const { handle, element, stop } of handles.current) {
        element.removeEventListener("click", stop);
        handle.remove();
      }
      handles.current = [];
    };
  }, [map, enabled, points.length]);
  useEffect(() => {
    for (const [index, { handle }] of handles.current.entries())
      if (points[index]) handle.setLngLat(points[index]);
  }, [map, points]);
}

export function useMissionOverlays(
  map,
  frame,
  plan,
  telemetry,
  elapsed,
  camera,
) {
  useEffect(() => {
    if (!map) return;
    map.addSource("mission-progress", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    const layers = [
      {
        id: "mission-travelled",
        type: "line",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#fff6be", "line-width": 3 },
      },
      {
        id: "mission-optics",
        type: "fill",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": "#74ead4",
          "fill-opacity": 0.2,
          "fill-outline-color": "#9bffee",
        },
      },
    ];
    for (const layer of layers)
      map.addLayer({ ...layer, source: "mission-progress" });
    return () => {
      if (!map.getStyle()) return;
      for (const layer of layers)
        if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      if (map.getSource("mission-progress"))
        map.removeSource("mission-progress");
    };
  }, [map]);
  // Keep geographic worker updates below the WebGL animation rate.
  const tick = telemetry
    ? elapsed >= plan.duration
      ? plan.duration
      : Math.floor(elapsed * 6) / 6
    : null;
  useEffect(() => {
    const source = map?.getSource("mission-progress");
    if (!source) return;
    const shapes = [];
    if (plan && !plan.error && tick !== null) {
      const position = flightFrame(plan, tick);
      const trace = simulationTrace(plan, tick, position.point);
      if (trace.length > 1)
        shapes.push({ type: "LineString", coordinates: trace });
      const footprint = camera && cameraFootprint(frame, position);
      if (footprint) shapes.push(footprint);
    }
    source.setData({
      type: "FeatureCollection",
      features: shapes.map((geometry) => ({
        type: "Feature",
        properties: {},
        geometry,
      })),
    });
  }, [map, plan, tick, camera, frame]);
}

export function useMissionCamera(
  map,
  plan,
  telemetry,
  elapsed,
  mode,
  reduced,
  flat,
) {
  const tick = telemetry
    ? Math.min(plan.duration, Math.floor(elapsed * 6) / 6)
    : null;
  useEffect(() => {
    if (!map || !plan || plan.error || tick === null || mode === "free") return;
    const frame = flightFrame(plan, tick);
    const chase = mode === "chase" && !flat;
    const target = chase
      ? { center: frame.point, pitch: 63, bearing: frame.heading, zoom: 18.7 }
      : { center: frame.point };
    if (reduced) map.jumpTo(target);
    else
      map.easeTo({
        ...target,
        duration:
          target.zoom && Math.abs(map.getZoom() - target.zoom) > 0.35
            ? 430
            : 160,
      });
  }, [map, plan, tick, mode, reduced, flat]);
}

function releaseModel(model) {
  const textures = new Set(),
    materials = new Set(),
    geometries = new Set();
  model.traverse((node) => {
    if (!node.isMesh) return;
    geometries.add(node.geometry);
    for (const material of [node.material].flat()) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material))
      if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) {
    texture.source.data?.close?.();
    texture.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
}

export function useAircraft(
  map,
  telemetry,
  enabled,
  onStatus,
  chase,
  seconds,
  clock,
  plan,
  reduced,
) {
  const current = useRef(telemetry);
  current.current = { telemetry, chase, seconds, clock, plan, reduced };
  useEffect(() => {
    if (!map || !enabled) return;
    const scene = new Scene(),
      vehicle = new Group(),
      modelRoot = new Group();
    const view = new Camera();
    const key = new DirectionalLight("#fff4d9", 2.5);
    key.position.set(-2, 4, 1);
    scene.add(new AmbientLight("#e7f4ff", 1.7), key, vehicle);
    vehicle.add(modelRoot);
    let renderer,
      model,
      mounted = true;
    const rotors = [];
    const matrix = new Matrix4(),
      translation = new Matrix4(),
      scale = new Matrix4();
    const layer = {
      id: "mission-aircraft",
      type: "custom",
      renderingMode: "3d",
      onAdd(_, gl) {
        renderer = new WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: true,
        });
        renderer.autoClear = false;
        new GLTFLoader().load(
          droneUrl,
          ({ scene: asset }) => {
            if (!mounted) {
              releaseModel(asset);
              return;
            }
            model = asset;
            const bounds = new Box3().setFromObject(asset),
              size = bounds.getSize(new Vector3());
            asset.position.sub(bounds.getCenter(new Vector3()));
            modelRoot.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
            modelRoot.add(asset);
            asset.traverse((node) => {
              if (node.name.startsWith("MissionRotor_")) rotors.push(node);
            });
            onStatus("ready");
            map.triggerRepaint();
          },
          undefined,
          () => {
            if (mounted) onStatus("error");
          },
        );
      },
      render(_, options) {
        const state = current.current;
        const reading = state.clock?.snapshot();
        const seconds = reading?.time ?? state.seconds;
        const frame =
          reading && !state.plan?.error
            ? flightFrame(state.plan, seconds)
            : state.telemetry;
        const chase = state.chase;
        if (!frame || !model) return;
        const base = map.queryTerrainElevation(frame.point);
        const origin = MercatorCoordinate.fromLngLat(
          frame.point,
          (base ?? 0) + frame.altitude + 1,
        );
        const displayMetres = Math.max(
          1.4,
          Math.min(25, (chase ? 24 : 17) * 2 ** (17 - map.getZoom())),
        );
        const s = origin.meterInMercatorCoordinateUnits() * displayMetres;
        matrix
          .fromArray(options.defaultProjectionData.mainMatrix)
          .multiply(translation.makeTranslation(origin.x, origin.y, origin.z))
          .multiply(scale.makeScale(s, -s, s));
        view.projectionMatrix.copy(matrix);
        vehicle.rotation.set(
          Math.PI / 2,
          0,
          (-frame.heading * Math.PI) / 180,
          "ZYX",
        );
        modelRoot.rotation.x = Math.min(0.15, frame.speed * 0.024);
        for (const [index, rotor] of rotors.entries())
          rotor.rotation.y =
            (index % 2 ? 1 : -1) * (state.reduced ? 0 : seconds) * 28;
        renderer.resetState();
        renderer.render(scene, view);
        if (reading?.playing && !state.reduced) map.triggerRepaint();
      },
      onRemove() {
        renderer?.dispose();
      },
    };
    onStatus("loading");
    try {
      map.addLayer(layer);
    } catch {
      onStatus("error");
    }
    return () => {
      mounted = false;
      if (map.getStyle() && map.getLayer(layer.id)) map.removeLayer(layer.id);
      if (model) releaseModel(model);
    };
  }, [map, enabled, onStatus]);
  useEffect(() => {
    if (enabled) map?.triggerRepaint();
  }, [map, telemetry, enabled, chase]);
}

export function useAircraftMarker(map, telemetry, visible) {
  const marker = useRef(null);
  const live = !!telemetry?.live;
  useEffect(() => {
    if (!map || !visible) return;
    const element = document.createElement("span");
    element.className =
      "mission-aircraft-marker" + (live ? " mission-device-marker" : "");
    element.setAttribute("aria-hidden", "true");
    const pin = new Marker({ element, rotationAlignment: "map" });
    marker.current = pin;
    return () => {
      pin.remove();
      marker.current = null;
    };
  }, [map, visible, live]);
  useEffect(() => {
    if (visible && telemetry && marker.current) {
      const pin = marker.current;
      pin.setLngLat(telemetry.point).setRotation(telemetry.heading ?? 0);
      if (!pin.getElement().isConnected) pin.addTo(map);
    }
  }, [map, telemetry, visible]);
}
