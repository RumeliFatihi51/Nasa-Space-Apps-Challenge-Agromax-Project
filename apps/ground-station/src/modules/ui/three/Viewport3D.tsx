import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { GROUND_STATION_HARDWARE, SATELLITE_PROFILES } from '../../shared/catalog';
import { AgronomicOperationType, CameraPresetId } from '../../shared/types';
import { useSimulationStore } from '../../telemetry/simulationStore';
import {lonLatToLocalMeters} from '../../gis/gisUtils';
import { buildEarthSceneRig } from './earthScene';
import { Camera } from 'lucide-react';
import { ProofPanelDrawer } from '../components/ProofPanelDrawer';
import {
  buildAgroHangarAndSilosModel,
  buildDroneGcsStation,
  buildRuralRoadAndPoles,
  buildSolarMicrogridModel,
  buildTractorWithTrailerModel,
  buildWeatherMastModel,
  buildWindTurbineModel,
  createOakTreeGeometries,
  createPoplarTreeGeometries,
} from './farmAssets';
import {
  buildCloudCluster,
  buildDroneModel,
  buildGroundStationModel,
  buildIrrigationPond,
  buildIrrigationRig,
  buildSatelliteModel,
  buildSoilSensorNode,
  createCropClumpGeometry,
} from './models';
import {
  buildFieldOverlayCanvasTexture,
  createBarkTextures,
  createFoliageTexture,
  createMistSpriteTexture,
  createParcelSoilAndCropMaps,
  createSoftContactShadowTexture,
  createSurroundTerrainTexture,
  drawPcMonitorCanvas,
  drawWorldCalloutCanvas,
} from './textures';

const METERS_TO_SCENE = 0.1; // 10 meters = 1 Three.js unit

// Pre-allocated scratch math objects (Zero GC in render loop)
const _camGoalPos = new THREE.Vector3();
const _camGoalTarget = new THREE.Vector3();
const _droneWorldPos = new THREE.Vector3();
const _satWorldPos = new THREE.Vector3();
const _dishFeedWorld = new THREE.Vector3(-63.8, 3.0, 35.2);
const _overheadSatPos = new THREE.Vector3();
const _beamDir = new THREE.Vector3();
const _beamMid = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _eulerScratch = new THREE.Euler();
const _cableTmpPos = new THREE.Vector3();
const _pcArcStart = new THREE.Vector3();
const _pcArcCtrl = new THREE.Vector3();
const _pcArcEnd = new THREE.Vector3();
const _sunPosNoon = new THREE.Vector3();
const _sunPosGolden = new THREE.Vector3();

const CAMERA_PRESETS: { id: CameraPresetId; label: string }[] = [
  { id: 'GROUND_STATION_CLOSE', label: 'Genel İstasyon & Uydu' },
  { id: 'FIELD_MAP_3D', label: 'Tarla & Müdahale' },
  { id: 'ANTENNA_MECHANICAL', label: 'Anten Yakın' },
  { id: 'DRONE_CHASE', label: 'Drone Takip' },
  { id: 'EARTH_VIEW', label: 'Dünya & Yörünge' },
  { id: 'FREE_CAMERA', label: 'Serbest' },
];

const AGRONOMIC_MODES: { id: AgronomicOperationType; label: string }[] = [
  { id: 'INSPECTION', label: 'Gözlem' },
  { id: 'SPRAYING', label: 'İlaçlama' },
  { id: 'IRRIGATION', label: 'Sulama' },
  { id: 'FERTILIZATION', label: 'Gübreleme' },
];

/**
 * Shared Anatolian plateau height function so terrain mesh, distant wind turbines, and rock outcrops align cleanly.
 */
function sampleAnatolianTerrainHeight(worldX: number, worldZ: number): number {
  const dist = Math.hypot(worldX, worldZ);
  if (dist <= 104) return 0;
  const blend = Math.min(1, (dist - 104) / 155);
  const smoothBlend = blend * blend * (3 - 2 * blend);
  const ridge1 = Math.sin(worldX * 0.019 + 0.4) * Math.cos(worldZ * 0.021 - 0.3) * 10.5;
  const ridge2 = Math.sin(worldX * 0.043 + worldZ * 0.032) * 4.6;
  const ridge3 = Math.cos(worldX * 0.078 - worldZ * 0.064) * 1.6;
  return Math.max(0, (ridge1 + ridge2 + ridge3 + 9.2) * smoothBlend);
}

export const Viewport3D: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [proofOpen, setProofOpen] = useState(false);

  const cameraPreset = useSimulationStore((s) => s.cameraPreset);
  const setCameraPreset = useSimulationStore((s) => s.setCameraPreset);
  const selectedSatelliteId = useSimulationStore((s) => s.selectedSatelliteId);
  const hardwareId = useSimulationStore((s) => s.hardwareId);
  const orbit = useSimulationStore((s) => s.orbit);
  const rf = useSimulationStore((s) => s.rf);
  const agronomicOp = useSimulationStore((s) => s.agronomicOp);
  const irrigationActive = useSimulationStore((s) => s.irrigationActive);
  const lightingMode = useSimulationStore((s) => s.lightingMode);
  const setAgronomicOp = useSimulationStore((s) => s.setAgronomicOp);
  const toggleIrrigation = useSimulationStore((s) => s.toggleIrrigation);
  const setLightingMode = useSimulationStore((s) => s.setLightingMode);

  const presetRef = useRef<CameraPresetId>(cameraPreset);
  const transitionActiveRef = useRef<boolean>(true);

  useEffect(() => {
    presetRef.current = cameraPreset;
    transitionActiveRef.current = cameraPreset !== 'FREE_CAMERA';
  }, [cameraPreset]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Software WebGL Detection (prevents multi-pass stall under SwiftShader/llvmpipe)
    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL2 bağlamı başlatılamadı.');
      return;
    }

    const initW = container.clientWidth || 800;
    const initH = container.clientHeight || 600;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.68;
    renderer.setPixelRatio(isSoftwareGl ? 0.75 : Math.min(window.devicePixelRatio, window.innerWidth<760?1.25:1.75));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(initW, initH);

    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL grafik bağlamı geçici olarak kesildi.');
    };
    const onContextRestored = () => setWebglError(null);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    // 2. Scene, Crystal-Clear Anatolian Daylight Sky & High-Contrast IBL
    const scene = new THREE.Scene();
    const SPACE_BG = new THREE.Color(0x040812);
    const DAY_HORIZON = new THREE.Color(0x8db6de);
    const GOLDEN_HORIZON = new THREE.Color(0xd29c6e);
    // Zero fog inside 185 units (1.85 km around the expanded farm); blends only distant hills
    const dayFog = new THREE.Fog(0x8db6de, 185, 560);
    scene.background = DAY_HORIZON;
    scene.fog = dayFog;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRenderTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRenderTarget.texture;
    scene.environmentIntensity = 0.55;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(45, initW / initH, 0.25, 1800);
    camera.position.set(-34, 17, 66);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.488;
    controls.minDistance = 2.5;
    controls.maxDistance = 320;
    controls.target.set(-48, 8.5, 30);

    controls.addEventListener('start', () => {
      transitionActiveRef.current = false;
      if (presetRef.current !== 'FREE_CAMERA') {
        useSimulationStore.getState().setCameraPreset('FREE_CAMERA');
      }
    });

    // Sun vectors for Noon vs Golden Hour
    _sunPosNoon.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 46), THREE.MathUtils.degToRad(138));
    _sunPosGolden.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 12), THREE.MathUtils.degToRad(242));

    // Crisp High-Contrast Sunlight + Subtle Sky Bounce
    const keyLight = new THREE.DirectionalLight(0xfff4df, 4.6);
    keyLight.position.copy(_sunPosNoon).multiplyScalar(135);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 320;
    keyLight.shadow.camera.left = -125;
    keyLight.shadow.camera.right = 125;
    keyLight.shadow.camera.top = 125;
    keyLight.shadow.camera.bottom = -125;
    keyLight.shadow.bias = -0.00025;
    keyLight.shadow.normalBias = 0.018;
    keyLight.shadow.radius = 2.0;
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0x9bc8ff, 0x3b422a, 0.72);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0xbbe4ff, 0.45);
    rimLight.position.set(-65, 32, -55);
    scene.add(rimLight);

    // Field World Root Group
    const fieldWorldGroup = new THREE.Group();
    scene.add(fieldWorldGroup);

    // Physical Sky Dome calibrated for clear, crisp Anatolian atmosphere
    const sky = new Sky();
    sky.scale.setScalar(1200);
    fieldWorldGroup.add(sky);

    // Outdoor image based lighting follows the visible physical sky, rather than an indoor room.
    const outdoorGenerator=new THREE.PMREMGenerator(renderer);
    const outdoorScene=new THREE.Scene();
    const environmentSky=sky.clone();
    environmentSky.material=sky.material.clone();
    outdoorScene.add(environmentSky);
    let outdoorTarget:THREE.WebGLRenderTarget|null=null;

    let lastEnvLighting: boolean | null = null;
    const syncLightingAndSky = (isGolden: boolean) => {
      if (lastEnvLighting === isGolden) return;
      lastEnvLighting = isGolden;

      const u = sky.material.uniforms;
      u['turbidity'].value = isGolden ? 2.8 : 1.25;
      u['rayleigh'].value = isGolden ? 1.45 : 0.75;
      u['mieCoefficient'].value = isGolden ? 0.0022 : 0.0008;
      u['mieDirectionalG'].value = isGolden ? 0.78 : 0.72;
      u['sunPosition'].value.copy(isGolden ? _sunPosGolden : _sunPosNoon);
      for(const name of ['turbidity','rayleigh','mieCoefficient','mieDirectionalG'])
        environmentSky.material.uniforms[name].value=u[name].value;
      environmentSky.material.uniforms.sunPosition.value.copy(u.sunPosition.value);
      outdoorTarget?.dispose();
      outdoorTarget=outdoorGenerator.fromScene(outdoorScene,0.04,0.1,1500);
      scene.environment=outdoorTarget.texture;

      scene.environmentIntensity = isGolden ? 0.12 : 0.16;

      if (isGolden) {
        keyLight.color.setHex(0xffae62);
        keyLight.intensity = 4.1;
        keyLight.position.copy(_sunPosGolden).multiplyScalar(135);
        hemiLight.color.setHex(0xfde68a);
        hemiLight.groundColor.setHex(0x382f22);
        dayFog.color.copy(GOLDEN_HORIZON);
        dayFog.near = 175;
        dayFog.far = 520;
      } else {
        keyLight.color.setHex(0xfff4df);
        keyLight.intensity = 4.6;
        keyLight.position.copy(_sunPosNoon).multiplyScalar(135);
        hemiLight.color.setHex(0x9bc8ff);
        hemiLight.groundColor.setHex(0x3b422a);
        dayFog.color.copy(DAY_HORIZON);
        dayFog.near = 195;
        dayFog.far = 580;
      }
    };
    syncLightingAndSky(false);

    // 3. Organic Anatolian Farmland & Distant Rolling Hills (with world-space macro color variation)
    const {
      map: surroundMap,
      normalMap: surroundNormal,
      roughnessMap: surroundRoughness,
    } = createSurroundTerrainTexture(maxAnisotropy);
    const groundMat = new THREE.MeshStandardMaterial({
      map: surroundMap,
      normalMap: surroundNormal,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughnessMap: surroundRoughness,
      roughness: 1.0,
      metalness: 0.02,
      vertexColors: true,
      dithering: true,
    });
    const groundGeo = new THREE.PlaneGeometry(760, 760, 116, 116);
    const posAttr = groundGeo.attributes.position as THREE.BufferAttribute;
    const gColors = new Float32Array(posAttr.count * 3);
    const tmpGroundColor = new THREE.Color();
    for (let i = 0; i < posAttr.count; i++) {
      const gx = posAttr.getX(i);
      const gy = posAttr.getY(i);
      // Note: groundMesh is rotated -PI/2 around X, so local +Y maps to world -Z
      const worldZ = -gy;
      const h = sampleAnatolianTerrainHeight(gx, worldZ);
      posAttr.setZ(i, h);

      // Subtle continuous macro biome tinting to break any distant texture repetition
      const macroNoise =
        Math.sin(gx * 0.017 + worldZ * 0.013) * 0.5 +
        Math.cos(gx * 0.031 - worldZ * 0.029) * 0.5;
      const elevationTint = Math.min(1, h / 18);
      tmpGroundColor.setRGB(
        0.94 + macroNoise * 0.09 + elevationTint * 0.08,
        0.96 + macroNoise * 0.06,
        0.90 + macroNoise * 0.05 + elevationTint * 0.04,
      );
      gColors[i * 3] = tmpGroundColor.r;
      gColors[i * 3 + 1] = tmpGroundColor.g;
      gColors[i * 3 + 2] = tmpGroundColor.b;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(gColors, 3));
    groundGeo.computeVertexNormals();
    groundGeo.computeTangents();

    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    fieldWorldGroup.add(groundMesh);

    // Distant Limestone Boulders scattered naturally on hillsides
    const rockGeo = new THREE.DodecahedronGeometry(1.1, 1);
    const rockPos = rockGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < rockPos.count; i++) {
      const vx = rockPos.getX(i);
      const vy = rockPos.getY(i);
      const vz = rockPos.getZ(i);
      const n = 1 + Math.sin(vx * 3.1 + vy * 2.5) * 0.18;
      rockPos.setXYZ(i, vx * n * 1.25, vy * n * 0.72, vz * n);
    }
    rockGeo.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8376, roughness: 0.92, metalness: 0.04 });
    const rockCount = 46;
    const rocksInstanced = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < rockCount; i++) {
      const ang = (i / rockCount) * Math.PI * 2 + (i % 3) * 0.35;
      const rad = 112 + ((i * 37) % 130);
      const rx = Math.cos(ang) * rad;
      const rz = Math.sin(ang) * rad;
      const ry = sampleAnatolianTerrainHeight(rx, rz);
      dummy.position.set(rx, ry + 0.35, rz);
      const sc = 0.8 + (i % 5) * 0.55;
      dummy.scale.set(sc * 1.2, sc * 0.8, sc);
      dummy.rotation.set(0.1 * i, i * 1.1, 0.08 * i);
      dummy.updateMatrix();
      rocksInstanced.setMatrixAt(i, dummy.matrix);
    }
    rocksInstanced.instanceMatrix.needsUpdate = true;
    rocksInstanced.castShadow = true;
    rocksInstanced.receiveShadow = true;
    fieldWorldGroup.add(rocksInstanced);

    // 4. Photorealistic Agricultural Infrastructure & Machinery
    // Paved Rural Road & Utility Poles (west corridor at x = -67.5)
    const { group: roadCorridorGroup, roadMat } = buildRuralRoadAndPoles(maxAnisotropy);
    fieldWorldGroup.add(roadCorridorGroup);

    // Modern Corrugated Steel AgroMax Drone Hangar + Twin Galvanized Grain Silos + Windsock
    const hangarRig = buildAgroHangarAndSilosModel(maxAnisotropy);
    hangarRig.root.position.set(-78.5, 0, 14);
    fieldWorldGroup.add(hangarRig.root);

    // Monocrystalline Solar PV Microgrid Array
    const solarArrayGroup = buildSolarMicrogridModel(maxAnisotropy);
    solarArrayGroup.position.set(-78.5, 0, 42);
    fieldWorldGroup.add(solarArrayGroup);

    // Agricultural Tractor + Tandem IBC Supply Trailer patrolling the West Farm Road
    const tractorRig = buildTractorWithTrailerModel(maxAnisotropy);
    tractorRig.root.position.set(-67.5, 0, -24);
    fieldWorldGroup.add(tractorRig.root);

    const tractorShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 8.8),
      new THREE.MeshBasicMaterial({
        map: createSoftContactShadowTexture(),
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    );
    tractorShadow.rotation.x = -Math.PI / 2;
    tractorShadow.position.set(-67.5, 0.04, -25.8);
    fieldWorldGroup.add(tractorShadow);

    // Live Meteorological & Anemometer Telemetry Mast (NE Parcel Corner)
    const weatherMastRig = buildWeatherMastModel();
    weatherMastRig.root.position.set(61.5, 0, -44.0);
    fieldWorldGroup.add(weatherMastRig.root);

    // 3 Distant Hillside Utility Wind Turbines grounded to actual terrain elevation
    const turbineCoords: [number, number][] = [
      [-132, -138],
      [36, -162],
      [148, -122],
    ];
    const windTurbines = turbineCoords.map(([tx, tz], idx) => {
      const wt = buildWindTurbineModel();
      const ty = sampleAnatolianTerrainHeight(tx, tz);
      wt.root.position.set(tx, ty - 0.5, tz);
      wt.root.rotation.y = 0.25 + idx * 0.14;
      fieldWorldGroup.add(wt.root);
      return wt;
    });

    // 3D Volumetric Cloud Cluster & Soft Ground Shadow over Bölge D (Cloud-Masked Sector)
    const cloudCluster = buildCloudCluster();
    cloudCluster.position.set(21.0, 27, 19.0);
    fieldWorldGroup.add(cloudCluster);

    const cloudShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 21),
      new THREE.MeshBasicMaterial({
        map: createSoftContactShadowTexture(),
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    cloudShadow.rotation.x = -Math.PI / 2;
    cloudShadow.position.set(21.0, 0.07, 19.0);
    fieldWorldGroup.add(cloudShadow);

    // 3 Field IoT Soil Moisture & Micro-Weather Telemetry Stations (scaled across 1168x956m field)
    const iotNodes = [
      { zoneCode: 'Bölge A', node: buildSoilSensorNode(0x10b981), x: -30.0, z: -24.0 },
      { zoneCode: 'Bölge B', node: buildSoilSensorNode(0xf59e0b), x: 25.6, z: -19.1 },
      { zoneCode: 'Bölge C', node: buildSoilSensorNode(0x06b6d4), x: -25.6, z: 21.0 },
    ];
    iotNodes.forEach(({ node, x, z }) => {
      node.root.position.set(x, 0.04, z);
      fieldWorldGroup.add(node.root);
    });

    // Satellite Optical Imaging Swath Scan Strip + Vertical Scan Curtain across Expanded Parcel
    const swathStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(116, 3.2),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    swathStrip.rotation.x = -Math.PI / 2;
    swathStrip.position.set(0, 0.16, 0);
    swathStrip.visible = false;
    fieldWorldGroup.add(swathStrip);

    const swathCurtain = new THREE.Mesh(
      new THREE.PlaneGeometry(116, 28),
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.10,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    swathCurtain.position.set(0, 14.1, 0);
    swathCurtain.visible = false;
    fieldWorldGroup.add(swathCurtain);

    // Expanded Polatlı Parcel 104 Terrain Plane (1168m x 956m = 111.66 ha => 116 x 96 scene units)
    let currentOverlayTex = buildFieldOverlayCanvasTexture(null, 'NDVI', maxAnisotropy, false);
    const { normalMap: parcelNormal, roughnessMap: parcelRoughness } =
      createParcelSoilAndCropMaps(maxAnisotropy);
    const parcelGeo = new THREE.PlaneGeometry(116, 96);
    parcelGeo.computeTangents();
    const parcelMat = new THREE.MeshStandardMaterial({
      map: currentOverlayTex,
      normalMap: parcelNormal,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughnessMap: parcelRoughness,
      roughness: 1.0,
      metalness: 0.02,
      dithering: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const parcelPlane = new THREE.Mesh(parcelGeo, parcelMat);
    parcelPlane.rotation.x = -Math.PI / 2;
    parcelPlane.position.set(0, 0.04, 0);
    parcelPlane.receiveShadow = true;
    fieldWorldGroup.add(parcelPlane);

    // Subtle crisp parcel boundary lines
    const parcelBorderPts = [
      new THREE.Vector3(-58, 0.10, -48),
      new THREE.Vector3(58, 0.10, -48),
      new THREE.Vector3(58, 0.10, 48),
      new THREE.Vector3(-58, 0.10, 48),
      new THREE.Vector3(-58, 0.10, -48),
    ];
    const parcelBorder = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(parcelBorderPts),
      new THREE.LineBasicMaterial({ color: 0x059669 }),
    );
    fieldWorldGroup.add(parcelBorder);

    // No-Fly Zone Hazard Polygon (Southeast powerline corridor)
    const nfzPts = [
      new THREE.Vector3(41, 0.14, 29),
      new THREE.Vector3(61, 0.14, 29),
      new THREE.Vector3(61, 0.14, 50),
      new THREE.Vector3(41, 0.14, 50),
      new THREE.Vector3(41, 0.14, 29),
    ];
    const nfzLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(nfzPts),
      new THREE.LineBasicMaterial({ color: 0xef4444 }),
    );
    const nfzFill = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 21),
      new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.15, side: THREE.DoubleSide }),
    );
    nfzFill.rotation.x = -Math.PI / 2;
    nfzFill.position.set(51, 0.11, 39.5);
    fieldWorldGroup.add(nfzLine, nfzFill);

    // 5. Perfectly Upright Anatolian Oak/Almond Groves & Windbreak Poplars outside expanded parcel
    const barkTex = createBarkTextures(maxAnisotropy);
    const foliageTex = createFoliageTexture(maxAnisotropy);
    const oakGeos = createOakTreeGeometries();
    const poplarGeos = createPoplarTreeGeometries();

    const foliageMat = new THREE.MeshStandardMaterial({
      map: foliageTex,
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.01,
    });
    const barkMat = new THREE.MeshStandardMaterial({
      map: barkTex.map,
      normalMap: barkTex.normalMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.01,
    });

    const oakSpots: Array<[number, number, number]> = [
      // Pond shade grove (NW, clear of road x=-67.5 and pond -74,-26)
      [-83.5, -35.5, 1.15], [-85.8, -28.0, 1.04], [-83.0, -18.5, 1.10], [-74.5, -39.5, 0.98],
      [-79.5, -13.0, 1.02], [-63.0, -45.5, 1.08],
      // Northern pasture hedgerow clusters outside z = -48
      [-51.0, -54.5, 1.08], [-42.5, -56.0, 0.96], [-31.0, -54.0, 1.14], [-18.5, -56.5, 1.04],
      [-7.0, -54.8, 0.95], [7.5, -55.2, 1.12], [19.0, -56.8, 1.00], [32.5, -54.4, 1.10],
      [44.5, -55.8, 1.16], [56.0, -53.8, 1.02],
      // Eastern pasture edge scattered groves outside x = +58
      [65.5, -32.5, 1.12], [69.0, -21.0, 0.96], [64.5, -7.5, 1.08], [68.2, 5.5, 1.16],
      [65.0, 18.0, 0.94], [69.5, 31.5, 1.06], [66.5, 45.5, 1.02],
      // Southern copse outside z = +48 (keeping Ground Station line of sight open)
      [34.5, 55.2, 1.06], [22.0, 56.8, 0.96], [8.5, 54.6, 1.14], [-6.5, 56.4, 1.02],
      [-21.0, 55.0, 0.98], [-35.5, 56.5, 1.08],
      // Distant Anatolian hillside oak clusters (grounded vertically on hills)
      [-115, -92, 1.38], [-104, -104, 1.26], [-84, -112, 1.42], [-34, -118, 1.32],
      [26, -122, 1.44], [92, -102, 1.34], [108, -84, 1.28], [122, -44, 1.38],
      [126, 26, 1.40], [104, 92, 1.34], [38, 112, 1.28], [-106, 86, 1.32],
      [-118, 18, 1.26], [-126, -32, 1.36],
    ];

    const poplarSpots: Array<[number, number, number]> = [
      // West rural road windbreak row (strictly vertical along west corridor)
      [-74.8, -68, 1.14], [-75.2, -60, 1.08], [-74.5, -52, 1.18],
      [-88.5, -6, 1.12], [-89.2, 4, 1.16], [-88.8, 26, 1.08], [-89.5, 54, 1.14],
      [-86.2, 63, 1.10], [-74.0, 66, 1.12], [-58.5, 62, 1.06],
      // North-East farm corner windbreak
      [63.5, -57.5, 1.16], [68.0, -54.8, 1.08], [72.5, -50.2, 1.20], [74.5, -43.0, 1.06],
      // Distant valley windbreaks
      [-136, -54, 1.28], [-139, -43, 1.34], [-135, -32, 1.24],
      [134, -104, 1.36], [141, -94, 1.28], [146, -82, 1.32],
      [-42, 118, 1.28], [-32, 121, 1.34], [-22, 117, 1.24],
    ];

    const oakCanopies = new THREE.InstancedMesh(oakGeos.canopyGeo, foliageMat, oakSpots.length);
    const oakTrunks = new THREE.InstancedMesh(oakGeos.trunkGeo, barkMat, oakSpots.length);
    const tint = new THREE.Color();

    oakSpots.forEach(([tx, tz, baseScale], i) => {
      const ty = sampleAnatolianTerrainHeight(tx, tz) - 0.14;
      dummy.position.set(tx, ty, tz);
      const sx = baseScale * (0.94 + (i % 3) * 0.06);
      const sy = baseScale * (0.96 + ((i + 1) % 3) * 0.06);
      dummy.scale.set(sx, sy, sx);
      dummy.rotation.set(0, (i * 2.17) % (Math.PI * 2), 0);
      dummy.updateMatrix();
      oakCanopies.setMatrixAt(i, dummy.matrix);
      oakTrunks.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.24 + (i % 5) * 0.015, 0.36 + (i % 3) * 0.05, 0.34 + (i % 4) * 0.045);
      oakCanopies.setColorAt(i, tint);
      tint.setRGB(0.95, 0.92, 0.88);
      oakTrunks.setColorAt(i, tint);
    });
    oakCanopies.instanceMatrix.needsUpdate = true;
    oakTrunks.instanceMatrix.needsUpdate = true;
    if (oakCanopies.instanceColor) oakCanopies.instanceColor.needsUpdate = true;
    if (oakTrunks.instanceColor) oakTrunks.instanceColor.needsUpdate = true;
    oakCanopies.computeBoundingSphere();
    oakTrunks.computeBoundingSphere();
    oakCanopies.castShadow = true;
    oakCanopies.receiveShadow = true;
    oakTrunks.castShadow = true;
    fieldWorldGroup.add(oakCanopies, oakTrunks);

    const poplarCanopies = new THREE.InstancedMesh(poplarGeos.canopyGeo, foliageMat, poplarSpots.length);
    const poplarTrunks = new THREE.InstancedMesh(poplarGeos.trunkGeo, barkMat, poplarSpots.length);
    poplarSpots.forEach(([tx, tz, baseScale], i) => {
      const ty = sampleAnatolianTerrainHeight(tx, tz) - 0.14;
      dummy.position.set(tx, ty, tz);
      const sx = baseScale * (0.94 + (i % 3) * 0.05);
      const sy = baseScale * (1.04 + (i % 4) * 0.06);
      dummy.scale.set(sx, sy, sx);
      dummy.rotation.set(0, (i * 1.43) % (Math.PI * 2), 0);
      dummy.updateMatrix();
      poplarCanopies.setMatrixAt(i, dummy.matrix);
      poplarTrunks.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.27 + (i % 4) * 0.012, 0.32 + (i % 3) * 0.04, 0.31 + (i % 3) * 0.04);
      poplarCanopies.setColorAt(i, tint);
      tint.setRGB(0.92, 0.89, 0.84);
      poplarTrunks.setColorAt(i, tint);
    });
    poplarCanopies.instanceMatrix.needsUpdate = true;
    poplarTrunks.instanceMatrix.needsUpdate = true;
    if (poplarCanopies.instanceColor) poplarCanopies.instanceColor.needsUpdate = true;
    if (poplarTrunks.instanceColor) poplarTrunks.instanceColor.needsUpdate = true;
    poplarCanopies.computeBoundingSphere();
    poplarTrunks.computeBoundingSphere();
    poplarCanopies.castShadow = true;
    poplarCanopies.receiveShadow = true;
    poplarTrunks.castShadow = true;
    fieldWorldGroup.add(poplarCanopies, poplarTrunks);

    // 6. Dense 6,144 Multi-Blade 3D Crop Clumps across 1168x956m Parcel with GPU Wind-Sway Shader
    const windUniforms = {
      uTime: { value: 0 },
      uWindStrength: { value: 0.09 },
      uWindDir: { value: new THREE.Vector2(-0.9, 0.43).normalize() },
    };
    const cropRows = 64;
    const cropCols = 96;
    const cropCount = cropRows * cropCols;
    const cropGeo = createCropClumpGeometry();
    const cropMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.60,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    cropMat.customProgramCacheKey = () => 'crop-wind-sway-v2';
    cropMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniforms.uTime;
      shader.uniforms.uWindStrength = windUniforms.uWindStrength;
      shader.uniforms.uWindDir = windUniforms.uWindDir;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `
        #include <common>
        uniform float uTime;
        uniform float uWindStrength;
        uniform vec2 uWindDir;
        `,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vec2 instPos = vec2(0.0);
        #ifdef USE_INSTANCING
          instPos = instanceMatrix[3].xz;
        #endif
        float hWeight = pow(clamp(transformed.y * 1.8, 0.0, 1.0), 1.35);
        float gust = sin(uTime * 2.1 + instPos.x * 0.24 + instPos.y * 0.19)
                   + 0.45 * cos(uTime * 3.4 - instPos.x * 0.41 + instPos.y * 0.33);
        transformed.xz += uWindDir * (gust * uWindStrength * hWeight);
        transformed.y -= abs(gust) * uWindStrength * 0.18 * hWeight;
        `,
      );
    };

    const cropInstanced = new THREE.InstancedMesh(cropGeo, cropMat, cropCount);
    cropInstanced.frustumCulled = false;
    for (let r = 0; r < cropRows; r++) {
      for (let c = 0; c < cropCols; c++) {
        const i = r * cropCols + c;
        const jitterX = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.22;
        const jitterZ = ((Math.cos(i * 78.233) * 19341.123) % 1) * 0.28;
        const cx = -55.8 + (c / (cropCols - 1)) * 111.6 + jitterX;
        const cz = -45.8 + (r / (cropRows - 1)) * 91.6 + jitterZ;

        // Clear circular helipad footprint at (-55.5, 31.0)
        const onHelipad = Math.hypot(cx + 55.5, cz - 31.0) < 3.2;
        dummy.position.set(cx, 0.04, cz);
        if (onHelipad) {
          dummy.scale.set(0, 0, 0);
        } else {
          const distC = Math.hypot(cx + 25.6, cz - 21.0);
          const distB = Math.hypot(cx - 25.6, cz + 19.1);
          const vigorScale = distC < 15.5 || distB < 14.5 ? 0.80 : 1.0 + ((i * 7) % 5) * 0.11;
          dummy.scale.set(vigorScale * 1.28, vigorScale * 1.08, vigorScale * 1.28);
          if (distC < 15.5) {
            tint.setHex(0x9b8e4a);
          } else if (distB < 14.5) {
            tint.setHex(0xb49f4c);
          } else {
            tint.setHSL(0.24 + ((i % 5) * 0.012), 0.46, 0.30 + ((i % 4) * 0.032));
          }
        }
        dummy.rotation.set(0, (i * 1.37) % (Math.PI * 2), 0);
        dummy.updateMatrix();
        cropInstanced.setMatrixAt(i, dummy.matrix);
        cropInstanced.setColorAt(i, tint);
      }
    }
    cropInstanced.instanceMatrix.needsUpdate = true;
    if (cropInstanced.instanceColor) cropInstanced.instanceColor.needsUpdate = true;
    cropInstanced.computeBoundingSphere();
    cropInstanced.receiveShadow = true;
    fieldWorldGroup.add(cropInstanced);

    // 420 Steppe Wildgrass & Berm Tufts along Expanded Parcel Perimeter & Pond Embankment
    const grassCount = 420;
    const edgeGrassMat = new THREE.MeshStandardMaterial({
      color: 0x8b8352,
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.01,
      side: THREE.DoubleSide,
    });
    const edgeGrassInstanced = new THREE.InstancedMesh(cropGeo, edgeGrassMat, grassCount);
    for (let i = 0; i < grassCount; i++) {
      let gx = 0;
      let gz = 0;
      if (i < 320) {
        const edge = i % 4;
        const u = ((Math.floor(i / 4)) / 80) * 2 - 1;
        const j = Math.sin(i * 7.3) * 1.4;
        if (edge === 0) { gx = u * 60.5; gz = -50.2 + j; }
        else if (edge === 1) { gx = 60.5 + j; gz = u * 50.2; }
        else if (edge === 2) { gx = u * 60.5; gz = 50.2 + j; }
        else { gx = -60.5 + j; gz = u * 50.2; }
      } else {
        const ang = ((i - 320) / 100) * Math.PI * 2;
        const rad = 6.2 + Math.sin(i * 3.1) * 0.65;
        gx = -74 + Math.cos(ang) * rad;
        gz = -26 + Math.sin(ang) * rad;
      }
      dummy.position.set(gx, 0.04, gz);
      const gs = 0.78 + (i % 4) * 0.18;
      dummy.scale.set(gs * 1.30, gs * 0.92, gs * 1.30);
      dummy.rotation.set(0, i * 2.1, 0);
      dummy.updateMatrix();
      edgeGrassInstanced.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.14 + (i % 3) * 0.02, 0.34, 0.42 + (i % 4) * 0.04);
      edgeGrassInstanced.setColorAt(i, tint);
    }
    edgeGrassInstanced.instanceMatrix.needsUpdate = true;
    if (edgeGrassInstanced.instanceColor) edgeGrassInstanced.instanceColor.needsUpdate = true;
    edgeGrassInstanced.computeBoundingSphere();
    fieldWorldGroup.add(edgeGrassInstanced);

    // Ground Station + Large GIS Command Computer Compound placed at (-62.5, 0, 35.5)
    const gsRig = buildGroundStationModel(maxAnisotropy);
    gsRig.root.position.set(-62.5, 0, 35.5);
    fieldWorldGroup.add(gsRig.root);

    // 7. Reflective Farm Irrigation Reservoir Pond near NW boundary (GPU Three.js Water or fallback)
    const pondRig = buildIrrigationPond(maxAnisotropy);
    pondRig.group.position.set(-74, 0.01, -26);
    fieldWorldGroup.add(pondRig.group);

    let realWater: Water | null = null;
    let realWaterGeo: THREE.CircleGeometry | null = null;
    if (!isSoftwareGl) {
      pondRig.fallbackWaterMesh.visible = false;
      realWaterGeo = new THREE.CircleGeometry(4.92, 48);
      realWater = new Water(realWaterGeo, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: pondRig.waterNormalMap,
        sunDirection: _sunPosNoon.clone().normalize(),
        sunColor: 0xfff5e4,
        waterColor: 0x0c4a6e,
        distortionScale: 1.65,
        fog: true,
      });
      realWater.rotation.x = -Math.PI / 2;
      realWater.position.set(-74, 0.46, -26);
      fieldWorldGroup.add(realWater);
    }

    // =========================================================================
    // OVERHEAD SKY SATELLITES, RF WAVEFRONT CORRIDOR & 3D TELEMETRY CALLOUTS
    // =========================================================================
    const overheadSatGroup = new THREE.Group();
    fieldWorldGroup.add(overheadSatGroup);

    const skyPrimarySat = buildSatelliteModel(maxAnisotropy);
    skyPrimarySat.scale.setScalar(1.85);
    overheadSatGroup.add(skyPrimarySat);

    const skyConstellationSats: THREE.Group[] = [];
    for (let i = 0; i < 2; i++) {
      const cs = buildSatelliteModel(maxAnisotropy);
      cs.scale.setScalar(0.95);
      overheadSatGroup.add(cs);
      skyConstellationSats.push(cs);
    }

    const skyRadius = 46;
    const skyArcPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const az = THREE.MathUtils.degToRad(220 - t * 145);
      const el = Math.sin(t * Math.PI) * THREE.MathUtils.degToRad(58) + THREE.MathUtils.degToRad(14);
      skyArcPts.push(
        new THREE.Vector3(
          _dishFeedWorld.x + Math.sin(az) * Math.cos(el) * skyRadius,
          _dishFeedWorld.y + Math.sin(el) * skyRadius,
          _dishFeedWorld.z - Math.cos(az) * Math.cos(el) * skyRadius,
        ),
      );
    }
    const skyOrbitArc = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(skyArcPts),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 }),
    );
    overheadSatGroup.add(skyOrbitArc);

    const dishBeamGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const dishBeamMat = new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.95 });
    const dishBeamLine = new THREE.Line(dishBeamGeo, dishBeamMat);
    fieldWorldGroup.add(dishBeamLine);

    const beamConeGeo = new THREE.CylinderGeometry(0.24, 1.45, 1, 18, 1, true);
    const beamConeMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const beamConeMesh = new THREE.Mesh(beamConeGeo, beamConeMat);
    fieldWorldGroup.add(beamConeMesh);

    // Expanding RF Wavefront Rings descending from satellite to dish LNB
    const rfWaveRingCount = 5;
    const rfWaveRingGeo = new THREE.TorusGeometry(0.85, 0.045, 8, 28);
    rfWaveRingGeo.rotateX(Math.PI / 2);
    const rfWaveRingMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const rfWaveRings: THREE.Mesh[] = [];
    for (let i = 0; i < rfWaveRingCount; i++) {
      const ring = new THREE.Mesh(rfWaveRingGeo, rfWaveRingMat);
      ring.visible = false;
      fieldWorldGroup.add(ring);
      rfWaveRings.push(ring);
    }

    // Glowing RF Data Packet Capsules streaming along the downlink beam
    const skyPulseCount = 14;
    const skyDataPulses: THREE.Mesh[] = [];
    const skyPulseGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.35, 10);
    const skyPulseMat = new THREE.MeshBasicMaterial({ color: 0x6ee7b7 });
    for (let i = 0; i < skyPulseCount; i++) {
      const sp = new THREE.Mesh(skyPulseGeo, skyPulseMat);
      sp.visible = false;
      fieldWorldGroup.add(sp);
      skyDataPulses.push(sp);
    }

    // Drone RTK-GNSS & Ruggedized Field GCS Station beside Helipad
    const droneGcsRig = buildDroneGcsStation();
    droneGcsRig.position.set(-57.6, 0.04, 32.8);
    droneGcsRig.rotation.y = 0.55;
    fieldWorldGroup.add(droneGcsRig);

    const gcsLinkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-60.6, 1.5, 36.2),
      new THREE.Vector3(-59.2, 0.45, 34.8),
      new THREE.Vector3(-57.6, 1.0, 32.8),
      new THREE.Vector3(-55.5, 0.22, 31.0),
    ]);
    const gcsLinkLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(gcsLinkCurve.getPoints(20)),
      new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.8 }),
    );
    fieldWorldGroup.add(gcsLinkLine);

    const gcsPulseGeo = new THREE.SphereGeometry(0.11, 8, 8);
    const gcsPulseMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    const gcsLinkPulses: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const gp = new THREE.Mesh(gcsPulseGeo, gcsPulseMat);
      gp.visible = false;
      fieldWorldGroup.add(gp);
      gcsLinkPulses.push(gp);
    }

    // Extracted 3D Map Projection Card above Big Command PC + Live Map-Data Stream to Drone
    const pcEmitWorld = new THREE.Vector3(
      -62.5 + gsRig.pcEmitLocalPos.x,
      gsRig.pcEmitLocalPos.y,
      35.5 + gsRig.pcEmitLocalPos.z,
    );
    const pcExtractedMapGroup = new THREE.Group();
    pcExtractedMapGroup.position.set(pcEmitWorld.x, pcEmitWorld.y + 1.45, pcEmitWorld.z);
    pcExtractedMapGroup.rotation.y = -0.28;
    const pcExtractedMapGeo = new THREE.PlaneGeometry(2.35, 1.9);
    const pcExtractedMapMat = new THREE.MeshBasicMaterial({
      map: currentOverlayTex,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
    });
    const pcExtractedMapMesh = new THREE.Mesh(pcExtractedMapGeo, pcExtractedMapMat);
    const pcMapFrameGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(2.44, 1.98, 0.05));
    const pcMapFrameMat = new THREE.LineBasicMaterial({ color: 0x34d399 });
    const pcMapFrame = new THREE.LineSegments(pcMapFrameGeo, pcMapFrameMat);
    pcExtractedMapGroup.add(pcExtractedMapMesh, pcMapFrame);
    pcExtractedMapGroup.visible = false;
    fieldWorldGroup.add(pcExtractedMapGroup);

    // Elevated Glowing Arc + Map-Data Packet Tiles flying from PC Workstation to Drone
    const pcArcSegments = 24;
    const pcToDroneArcGeo = new THREE.BufferGeometry();
    pcToDroneArcGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array((pcArcSegments + 1) * 3), 3),
    );
    const pcToDroneArcMat = new THREE.LineBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.85,
    });
    const pcToDroneArcLine = new THREE.Line(pcToDroneArcGeo, pcToDroneArcMat);
    pcToDroneArcLine.frustumCulled = false;
    pcToDroneArcLine.visible = false;
    fieldWorldGroup.add(pcToDroneArcLine);

    const pcPacketCount = 10;
    const pcPacketGeo = new THREE.BoxGeometry(0.42, 0.06, 0.34);
    const pcPacketMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const pcToDronePackets: THREE.Mesh[] = [];
    for (let i = 0; i < pcPacketCount; i++) {
      const pkt = new THREE.Mesh(pcPacketGeo, pcPacketMat);
      pkt.visible = false;
      fieldWorldGroup.add(pkt);
      pcToDronePackets.push(pkt);
    }

    // World-Space Telemetry Callout Sprites (Satellite + Ground Station + Command PC)
    const satCalloutCanvas = document.createElement('canvas');
    satCalloutCanvas.width = 480;
    satCalloutCanvas.height = 96;
    const satCalloutTex = new THREE.CanvasTexture(satCalloutCanvas);
    satCalloutTex.colorSpace = THREE.SRGBColorSpace;
    const satCalloutSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: satCalloutTex, transparent: true, depthTest: false }),
    );
    satCalloutSprite.scale.set(14.5, 2.9, 1);
    satCalloutSprite.renderOrder = 10;
    fieldWorldGroup.add(satCalloutSprite);

    const gsCalloutCanvas = document.createElement('canvas');
    gsCalloutCanvas.width = 480;
    gsCalloutCanvas.height = 96;
    const gsCalloutTex = new THREE.CanvasTexture(gsCalloutCanvas);
    gsCalloutTex.colorSpace = THREE.SRGBColorSpace;
    const gsCalloutSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: gsCalloutTex, transparent: true, depthTest: false }),
    );
    gsCalloutSprite.scale.set(11.5, 2.3, 1);
    gsCalloutSprite.position.set(-63.8, 7.0, 35.2);
    gsCalloutSprite.renderOrder = 10;
    fieldWorldGroup.add(gsCalloutSprite);

    const pcCalloutCanvas = document.createElement('canvas');
    pcCalloutCanvas.width = 480;
    pcCalloutCanvas.height = 96;
    const pcCalloutTex = new THREE.CanvasTexture(pcCalloutCanvas);
    pcCalloutTex.colorSpace = THREE.SRGBColorSpace;
    const pcCalloutSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: pcCalloutTex, transparent: true, depthTest: false }),
    );
    pcCalloutSprite.scale.set(11.5, 2.3, 1);
    pcCalloutSprite.position.set(-59.2, 7.2, 36.8);
    pcCalloutSprite.renderOrder = 10;
    fieldWorldGroup.add(pcCalloutSprite);

    let calloutTimer = 1.0;
    let lastSatCalloutKey = '';
    let lastGsCalloutKey = '';
    let lastPcCalloutKey = '';
    let lastPcMonitorKey = '';

    // =========================================================================
    // AGRICULTURAL IRRIGATION RIG (Bölge C) + SOFT SPRITE WATER MIST
    // =========================================================================
    const mistSpriteTex = createMistSpriteTexture();
    const irrigationRig = buildIrrigationRig();
    irrigationRig.root.position.set(-25.6, 0.04, 21.0);
    irrigationRig.root.scale.setScalar(1.35);
    irrigationRig.root.rotation.y = 0.25;
    fieldWorldGroup.add(irrigationRig.root);

    const waterParticleCount = 380;
    const waterPositions = new Float32Array(waterParticleCount * 3);
    const waterPhases = new Float32Array(waterParticleCount);
    for (let i = 0; i < waterParticleCount; i++) {
      waterPhases[i] = Math.random();
    }
    const waterGeo = new THREE.BufferGeometry();
    waterGeo.setAttribute('position', new THREE.BufferAttribute(waterPositions, 3));
    const waterMat = new THREE.PointsMaterial({
      color: 0xdbf4ff,
      map: mistSpriteTex,
      size: 0.42,
      transparent: true,
      opacity: 0.72,
      alphaTest: 0.02,
      depthWrite: false,
    });
    const waterPoints = new THREE.Points(waterGeo, waterMat);
    waterPoints.visible = false;
    irrigationRig.root.add(waterPoints);

    // =========================================================================
    // HEAVY 6-ARM DRONE RIG, HELIPAD, DOWNWASH RING & SOFT ATOMIZED SPRAY MIST
    // =========================================================================
    const helipad = new THREE.Mesh(
      new THREE.CylinderGeometry(2.15, 2.35, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.72, metalness: 0.22 }),
    );
    helipad.position.set(-55.5, 0.04, 31.0);
    helipad.receiveShadow = true;
    fieldWorldGroup.add(helipad);

    const helipadRing = new THREE.Mesh(
      new THREE.RingGeometry(1.62, 1.82, 32),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide }),
    );
    helipadRing.rotation.x = -Math.PI / 2;
    helipadRing.position.set(-55.5, 0.085, 31.0);
    fieldWorldGroup.add(helipadRing);

    const droneRig = buildDroneModel(maxAnisotropy);
    droneRig.root.scale.setScalar(1.18);
    droneRig.root.position.set(-55.5, 0.08, 31.0);
    fieldWorldGroup.add(droneRig.root);

    const droneShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 4.2),
      new THREE.MeshBasicMaterial({
        map: createSoftContactShadowTexture(),
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      }),
    );
    droneShadow.rotation.x = -Math.PI / 2;
    droneShadow.position.set(-55.5, 0.09, 31.0);
    fieldWorldGroup.add(droneShadow);

    const downwashRingGeo = new THREE.RingGeometry(1.1, 1.65, 32);
    downwashRingGeo.rotateX(-Math.PI / 2);
    const downwashRingMat = new THREE.MeshBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const downwashRing = new THREE.Mesh(downwashRingGeo, downwashRingMat);
    downwashRing.position.set(-55.5, 0.11, 31.0);
    downwashRing.visible = false;
    fieldWorldGroup.add(downwashRing);

    const sprayCount = 260;
    const sprayPositions = new Float32Array(sprayCount * 3);
    const sprayPhases = new Float32Array(sprayCount);
    const sprayOffsetsX = new Float32Array(sprayCount);
    const sprayOffsetsZ = new Float32Array(sprayCount);
    for (let i = 0; i < sprayCount; i++) {
      sprayPhases[i] = Math.random();
      sprayOffsetsX[i] = (Math.random() - 0.5) * 2.2;
      sprayOffsetsZ[i] = (Math.random() - 0.5) * 0.9;
    }
    const sprayGeo = new THREE.BufferGeometry();
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPositions, 3));
    const sprayMat = new THREE.PointsMaterial({
      color: 0x67e8f9,
      map: mistSpriteTex,
      size: 0.46,
      transparent: true,
      opacity: 0.78,
      alphaTest: 0.02,
      depthWrite: false,
    });
    const sprayPoints = new THREE.Points(sprayGeo, sprayMat);
    sprayPoints.visible = false;
    fieldWorldGroup.add(sprayPoints);

    const plannedRouteLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.85 }),
    );
    const actualTrackLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x10b981 }),
    );
    fieldWorldGroup.add(plannedRouteLine, actualTrackLine);

    const zoneRingsGroup = new THREE.Group();
    fieldWorldGroup.add(zoneRingsGroup);

    const swathPoolCount = 36;
    const swathPoolGeo = new THREE.CircleGeometry(1.15, 16);
    swathPoolGeo.rotateX(-Math.PI / 2);
    const swathPoolMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const swathPool: THREE.Mesh[] = [];
    for (let i = 0; i < swathPoolCount; i++) {
      const m = new THREE.Mesh(swathPoolGeo, swathPoolMat);
      m.visible = false;
      fieldWorldGroup.add(m);
      swathPool.push(m);
    }
    let swathDropIndex = 0;
    let lastSwathDropX = -9999;
    let lastSwathDropZ = -9999;
    let lastPhotoCount = 0;
    let photoFlashTimer = 0;

    // 8. Earth Orbital Scene
    const earthRig = buildEarthSceneRig(maxAnisotropy);
    earthRig.root.position.set(0, 0, 0);
    earthRig.root.visible = false;
    scene.add(earthRig.root);

    let lastSatId = '';
    let lastAnalysisKey = '';
    let lastPlanId = '';
    let lastTrackLen = -1;
    let lastParcel:object|null=null;
    let pulseClock = 0;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 10. Render Loop with Software-GL afterDraw pacing
    let frameId = 0;
    let disposed = false;
    let prevNow = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const realDt = Math.min(0.05, (now - prevNow) / 1000);
      prevNow = now;
      pulseClock += realDt;

      const s = useSimulationStore.getState();
      if(s.parcel!==lastParcel){
        lastParcel=s.parcel;
        const points=s.parcel.coordinates.map(([lon,lat])=>{const p=lonLatToLocalMeters(lon,lat,s.parcel.center);return new THREE.Vector3(p.localX*METERS_TO_SCENE,.13,p.localZ*METERS_TO_SCENE);});
        parcelBorder.geometry.dispose();parcelBorder.geometry=new THREE.BufferGeometry().setFromPoints(points);
      }
      const sat = SATELLITE_PROFILES[s.selectedSatelliteId];
      const hw = GROUND_STATION_HARDWARE[s.hardwareId];
      const preset = presetRef.current;
      const isEarthMode = preset === 'EARTH_VIEW' || preset === 'SATELLITE_TRACK';

      const isGolden = s.lightingMode === 'GOLDEN_HOUR';
      const activeHorizon = isGolden ? GOLDEN_HORIZON : DAY_HORIZON;
      earthRig.root.visible = isEarthMode;
      fieldWorldGroup.visible = !isEarthMode;
      scene.background = isEarthMode ? SPACE_BG : activeHorizon;
      scene.fog = isEarthMode ? null : dayFog;
      renderer.toneMappingExposure = isEarthMode ? 1.02 : isGolden ? 0.74 : 0.68;

      if (!isEarthMode) {
        syncLightingAndSky(isGolden);
      }

      // Live GPU wind-sway animation uniforms for 3D wheat/maize crop blades
      windUniforms.uTime.value = pulseClock;
      windUniforms.uWindStrength.value = 0.04 + s.windSpeedMs * 0.012;
      const windRad = THREE.MathUtils.degToRad(s.windDirDeg);
      windUniforms.uWindDir.value.set(Math.sin(windRad), -Math.cos(windRad));

      // Live Windsock, Weather Mast, Wind Turbines & Reservoir Water Ripples
      hangarRig.windsockGroup.rotation.y = -windRad + Math.sin(pulseClock * 3.8) * 0.08;
      weatherMastRig.windVaneGroup.rotation.y = -windRad;
      weatherMastRig.anemometerRotor.rotation.y += (1.8 + s.windSpeedMs * 1.4) * realDt;
      windTurbines.forEach((wt, idx) => {
        wt.rotorGroup.rotation.z -= (0.42 + s.windSpeedMs * 0.14 + idx * 0.03) * realDt;
      });
      if (s.localServerConnected) {
        gsRig.hvacFanGroup.rotation.x += 14 * realDt;
      }

      if (realWater) {
        realWater.material.uniforms['time'].value += realDt * 0.55;
        realWater.material.uniforms['sunDirection'].value
          .copy(isGolden ? _sunPosGolden : _sunPosNoon)
          .normalize();
      } else {
        pondRig.waterNormalMap.offset.x = (pulseClock * 0.03) % 1;
        pondRig.waterNormalMap.offset.y = (pulseClock * 0.02) % 1;
      }

      // Tractor slow patrol along the west farm service road (when simulation is running)
      if (s.isRunning && !s.isPaused) {
        const patrolZ = -42 + ((pulseClock * 1.65) % 62);
        tractorRig.root.position.z = patrolZ;
        tractorShadow.position.z = patrolZ - 1.8;
        tractorRig.wheels.forEach((w) => {
          w.rotation.x += 1.6 * realDt;
        });
      }
      const beaconMat = tractorRig.beaconMesh.material as THREE.MeshStandardMaterial;
      beaconMat.emissiveIntensity = 0.7 + 0.9 * (0.5 + 0.5 * Math.sin(pulseClock * 6.5));

      if (lastSatId !== sat.id) {
        lastSatId = sat.id;
        earthRig.rebuildOrbit(sat);
      }
      if (isEarthMode) {
        earthRig.update(sat, s.orbit, s.rf.carrierLocked, s.rf.hardwareCompatible, realDt);
      }

      // Ground Station Mechanical Tracking
      const dishScale = hw.id === 'DISH_240CM_X_PRO' ? 1.0 : 0.56;
      gsRig.dishScaleGroup.scale.setScalar(dishScale);
      gsRig.azimuthGroup.rotation.y = THREE.MathUtils.degToRad(-s.antennaAzDeg);
      gsRig.elevationGroup.rotation.x = THREE.MathUtils.degToRad(s.antennaElDeg);

      const isExportingToDrone = Boolean(s.missionPlan || s.droneDataTransferred);
      const ledMat = gsRig.serverLedMesh.material as THREE.MeshStandardMaterial;
      if (!s.localServerConnected) {
        ledMat.color.setHex(0xef4444);
        ledMat.emissive.setHex(0xef4444);
        gsRig.pcLedMat.color.setHex(0xef4444);
        gsRig.pcLedMat.emissive.setHex(0xef4444);
      } else if (
        isExportingToDrone ||
        s.acquisitionStage === 'FRAME_RECEPTION' ||
        s.acquisitionStage === 'AGROMAX_INGESTION'
      ) {
        ledMat.color.setHex(0x10b981);
        ledMat.emissive.setHex(0x10b981);
        gsRig.pcLedMat.color.setHex(0x10b981);
        gsRig.pcLedMat.emissive.setHex(0x10b981);
      } else {
        ledMat.color.setHex(0x06b6d4);
        ledMat.emissive.setHex(0x06b6d4);
        gsRig.pcLedMat.color.setHex(0x22d3ee);
        gsRig.pcLedMat.emissive.setHex(0x06b6d4);
      }
      gsRig.pcLedMat.emissiveIntensity = s.localServerConnected
        ? 1.15 + 0.45 * Math.sin(pulseClock * 5.2)
        : 0.4;

      // Overhead Sky Satellite positioning along live Az/El vector
      const satAzR = THREE.MathUtils.degToRad(s.orbit.azimuthDeg);
      const satElR = THREE.MathUtils.degToRad(Math.max(12, s.orbit.elevationDeg));
      _overheadSatPos.set(
        _dishFeedWorld.x + Math.sin(satAzR) * Math.cos(satElR) * skyRadius,
        _dishFeedWorld.y + Math.sin(satElR) * skyRadius,
        _dishFeedWorld.z - Math.cos(satAzR) * Math.cos(satElR) * skyRadius,
      );
      skyPrimarySat.position.copy(_overheadSatPos);
      skyPrimarySat.lookAt(_dishFeedWorld);
      skyPrimarySat.rotateX(Math.PI / 2);

      satCalloutSprite.position.set(_overheadSatPos.x, _overheadSatPos.y + 4.8, _overheadSatPos.z);
      satCalloutSprite.visible = s.orbit.isAboveHorizon;

      for (let i = 0; i < skyConstellationSats.length; i++) {
        const cs = skyConstellationSats[i];
        const phase = (pulseClock * 0.012 + i * 0.48) % 1.0;
        const cAz = THREE.MathUtils.degToRad(260 - phase * 170 + i * 35);
        const cEl = THREE.MathUtils.degToRad(24 + Math.sin(phase * Math.PI) * 42);
        cs.position.set(
          Math.sin(cAz) * Math.cos(cEl) * 78,
          12 + Math.sin(cEl) * 78,
          -Math.cos(cAz) * Math.cos(cEl) * 78,
        );
        cs.lookAt(0, 0, 0);
        cs.rotateX(Math.PI / 2);
      }

      // Dish RF Beam, Wavefront Rings, LNB Glow & Overhead Data Packets
      const antAzR = THREE.MathUtils.degToRad(s.antennaAzDeg);
      const antElR = THREE.MathUtils.degToRad(s.antennaElDeg);
      _beamDir.set(
        Math.sin(antAzR) * Math.cos(antElR),
        Math.sin(antElR),
        -Math.cos(antAzR) * Math.cos(antElR),
      );
      const isReceiving = s.rf.carrierLocked && s.rf.hardwareCompatible && s.orbit.isAboveHorizon;
      const beamTarget = isReceiving
        ? _overheadSatPos
        : _beamMid.copy(_dishFeedWorld).addScaledVector(_beamDir, skyRadius);

      const beamAttr = dishBeamLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      beamAttr.setXYZ(0, _dishFeedWorld.x, _dishFeedWorld.y, _dishFeedWorld.z);
      beamAttr.setXYZ(1, beamTarget.x, beamTarget.y, beamTarget.z);
      beamAttr.needsUpdate = true;

      const beamDistance = _dishFeedWorld.distanceTo(beamTarget);
      beamConeMesh.position.copy(_dishFeedWorld).lerp(beamTarget, 0.5);
      beamConeMesh.scale.set(1, beamDistance, 1);
      _beamDir.subVectors(beamTarget, _dishFeedWorld).normalize();
      beamConeMesh.quaternion.setFromUnitVectors(_upAxis, _beamDir);

      const showBeam = s.orbit.isAboveHorizon;
      dishBeamLine.visible = showBeam;
      beamConeMesh.visible = showBeam && s.rf.hardwareCompatible;

      if (!s.rf.hardwareCompatible) {
        dishBeamMat.color.setHex(0xef4444);
        dishBeamMat.opacity = 0.55;
        gsRig.feedGlowMat.color.setHex(0xef4444);
        gsRig.feedGlowMat.emissive.setHex(0xef4444);
        gsRig.feedGlowMat.emissiveIntensity = 1.2;
      } else if (isReceiving) {
        dishBeamMat.color.setHex(0x10b981);
        dishBeamMat.opacity = 0.96;
        beamConeMat.color.setHex(0x10b981);
        beamConeMat.opacity = 0.16;
        gsRig.feedGlowMat.color.setHex(0x34d399);
        gsRig.feedGlowMat.emissive.setHex(0x10b981);
        gsRig.feedGlowMat.emissiveIntensity = 1.3 + 0.7 * Math.sin(pulseClock * 8.0);
      } else {
        dishBeamMat.color.setHex(0xf59e0b);
        dishBeamMat.opacity = 0.65;
        beamConeMat.color.setHex(0xf59e0b);
        beamConeMat.opacity = 0.10;
        gsRig.feedGlowMat.color.setHex(0xfbbf24);
        gsRig.feedGlowMat.emissive.setHex(0xf59e0b);
        gsRig.feedGlowMat.emissiveIntensity = 0.9;
      }

      const streamActive = showBeam && s.rf.hardwareCompatible && (s.acquisitionStage !== 'IDLE' || s.rf.carrierLocked);
      skyPulseMat.color.setHex(isReceiving ? 0x6ee7b7 : 0xfbbf24);
      rfWaveRingMat.color.setHex(isReceiving ? 0x34d399 : 0xf59e0b);

      for (let i = 0; i < skyDataPulses.length; i++) {
        const sp = skyDataPulses[i];
        sp.visible = streamActive;
        if (streamActive) {
          const frac = (pulseClock * 0.68 + i / skyDataPulses.length) % 1.0;
          sp.position.lerpVectors(beamTarget, _dishFeedWorld, frac);
          sp.quaternion.setFromUnitVectors(_upAxis, _beamDir);
        }
      }

      for (let i = 0; i < rfWaveRings.length; i++) {
        const ring = rfWaveRings[i];
        ring.visible = streamActive;
        if (streamActive) {
          const frac = (pulseClock * 0.42 + i / rfWaveRings.length) % 1.0;
          ring.position.lerpVectors(beamTarget, _dishFeedWorld, frac);
          ring.quaternion.setFromUnitVectors(_upAxis, _beamDir);
          const rScale = 0.55 + (1 - frac) * 1.15;
          ring.scale.setScalar(rScale);
        }
      }

      gsRig.cablePulses.forEach((cp, idx) => {
        cp.visible = streamActive && s.localServerConnected;
        if (cp.visible) {
          const u = (pulseClock * 0.95 + idx / gsRig.cablePulses.length) % 1.0;
          gsRig.cableCurve.getPoint(u, _cableTmpPos);
          cp.position.copy(_cableTmpPos);
        }
      });

      gcsLinkPulses.forEach((gp, idx) => {
        gp.visible = s.localServerConnected;
        if (gp.visible) {
          const u = (pulseClock * 0.72 + idx / gcsLinkPulses.length) % 1.0;
          gcsLinkCurve.getPoint(u, _cableTmpPos);
          gp.position.copy(_cableTmpPos);
        }
      });

      // Throttled World-Space Callout Billboard + Command PC Monitor updates (~4 Hz)
      calloutTimer += realDt;
      if (calloutTimer >= 0.25) {
        calloutTimer = 0;
        const satTitle = `${sat.shortName} · ${sat.band}`;
        const satSub = isReceiving
          ? `VERİ AKIŞI ${s.rf.dataRateMbps.toFixed(1)} Mbps · El ${s.orbit.elevationDeg.toFixed(0)}°`
          : s.orbit.isAboveHorizon
            ? `YÖRÜNGE GÖRÜŞÜ · El ${s.orbit.elevationDeg.toFixed(0)}°`
            : 'UFUK ALTI BEKLEME';
        const satAccent = !s.rf.hardwareCompatible ? '#ef4444' : isReceiving ? '#34d399' : '#fbbf24';
        const satKey = `${satTitle}|${satSub}|${satAccent}`;
        if (satKey !== lastSatCalloutKey) {
          lastSatCalloutKey = satKey;
          drawWorldCalloutCanvas(satCalloutCanvas, satTitle, satSub, satAccent);
          satCalloutTex.needsUpdate = true;
        }

        const gsTitle = `YER İSTASYONU · ${hw.dishDiameterM}m ÇANAK`;
        const gsSub = !s.rf.hardwareCompatible
          ? 'UYUMSUZ BANT / DONANIM'
          : isReceiving
            ? `SNR ${s.rf.snrDb.toFixed(1)} dB · ${s.rf.receivedMb.toFixed(0)}/${s.rf.totalExpectedMb} MB (%${s.rf.completionPct.toFixed(0)})`
            : s.localServerConnected
              ? `SUNUCU ÇEVRİMİÇİ · Az ${s.antennaAzDeg.toFixed(0)}°`
              : 'YEREL SUNUCU ÇEVRİMDIŞI';
        const gsAccent = !s.rf.hardwareCompatible || !s.localServerConnected ? '#ef4444' : isReceiving ? '#34d399' : '#38bdf8';
        const gsKey = `${gsTitle}|${gsSub}|${gsAccent}`;
        if (gsKey !== lastGsCalloutKey) {
          lastGsCalloutKey = gsKey;
          drawWorldCalloutCanvas(gsCalloutCanvas, gsTitle, gsSub, gsAccent);
          gsCalloutTex.needsUpdate = true;
        }

        const pcTitle = 'KOMUTA BİLGİSAYARI · CANLI HARİTA';
        const pcSub = isExportingToDrone
          ? `HARİTA -> DRONE AKTARIMI (${s.missionPlan?.waypoints.length ?? 0} NOKTA)`
          : s.spectralAnalysis
            ? `${s.activeSpectralIndex} ÇIKTISI · ${s.spectralAnalysis.priorityZones.length} ÖNCELİK ZONU`
            : 'PARSEL 104 · 111.7 ha HAZIR';
        const pcAccent = !s.localServerConnected ? '#ef4444' : isExportingToDrone ? '#34d399' : '#38bdf8';
        const pcKey = `${pcTitle}|${pcSub}|${pcAccent}`;
        if (pcKey !== lastPcCalloutKey) {
          lastPcCalloutKey = pcKey;
          drawWorldCalloutCanvas(pcCalloutCanvas, pcTitle, pcSub, pcAccent);
          pcCalloutTex.needsUpdate = true;
        }

        const visitedCnt = s.missionPlan ? s.missionPlan.waypoints.filter((w) => w.visited).length : 0;
        const monitorKey = `${s.spectralAnalysis?.datasetId ?? 'none'}|${s.activeSpectralIndex}|${s.missionPlan?.id ?? 'none'}|${visitedCnt}|${s.rf.completionPct.toFixed(0)}|${s.localServerConnected}|${isExportingToDrone}`;
        if (monitorKey !== lastPcMonitorKey) {
          lastPcMonitorKey = monitorKey;
          drawPcMonitorCanvas(
            gsRig.monitorCanvas,
            s.spectralAnalysis,
            s.activeSpectralIndex,
            s.missionPlan,
            s.rf.completionPct,
            s.localServerConnected,
            isExportingToDrone,
          );
          gsRig.monitorTex.needsUpdate = true;
        }
      }

      // Gentle 3D Cloud Drift & Shadow over Bölge D
      const cloudScale = (s.activeFaults.includes('HIGH_CLOUD_COVER') ? 1.55 : 1.0) * 1.35;
      cloudCluster.scale.setScalar(cloudScale);
      cloudShadow.scale.setScalar(cloudScale);
      const driftX = 21.0 + Math.sin(pulseClock * 0.14) * 3.2;
      const driftZ = 19.0 + Math.cos(pulseClock * 0.11) * 2.0;
      cloudCluster.position.set(driftX, 27, driftZ);
      cloudShadow.position.set(driftX, 0.07, driftZ);

      const isDownloadingFrame =
        (s.acquisitionStage === 'FRAME_RECEPTION' || s.acquisitionStage === 'CRC_ERROR_CHECK') &&
        s.rf.hardwareCompatible;
      swathStrip.visible = isDownloadingFrame;
      swathCurtain.visible = isDownloadingFrame;
      if (isDownloadingFrame) {
        const scanZ = -47 + (Math.min(100, s.rf.completionPct) / 100) * 94;
        swathStrip.position.z = scanZ;
        swathCurtain.position.z = scanZ;
      }

      const cSensor = s.soilSensors.find((x) => x.zoneCode === 'Bölge C');
      if (cSensor) {
        const cHex = cSensor.soilMoisturePct >= 24 ? 0x10b981 : s.irrigationActive ? 0x06b6d4 : 0xf59e0b;
        iotNodes[2].node.statusLedMat.color.setHex(cHex);
        iotNodes[2].node.statusLedMat.emissive.setHex(cHex);
      }

      // Update Multispectral Field Texture when analysis, index, or irrigation state changes
      const analysisKey = `${s.spectralAnalysis?.datasetId ?? 'none'}_${s.activeSpectralIndex}_${s.activeFaults.join(',')}_${s.irrigationActive}`;
      if (analysisKey !== lastAnalysisKey) {
        lastAnalysisKey = analysisKey;
        const newTex = buildFieldOverlayCanvasTexture(
          s.spectralAnalysis,
          s.activeSpectralIndex,
          maxAnisotropy,
          s.irrigationActive,
        );
        parcelMat.map = newTex;
        parcelMat.needsUpdate = true;
        pcExtractedMapMat.map = newTex;
        pcExtractedMapMat.needsUpdate = true;
        currentOverlayTex.dispose();
        currentOverlayTex = newTex;

        while (zoneRingsGroup.children.length > 0) {
          const child = zoneRingsGroup.children[0] as THREE.Mesh;
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
          zoneRingsGroup.remove(child);
        }
        if (s.spectralAnalysis) {
          s.spectralAnalysis.priorityZones.forEach((z) => {
            const xScene = (z.centerNormalized[0] - 0.5) * 116;
            const zScene = (z.centerNormalized[1] - 0.5) * 96;
            const ringColor =
              z.category === 'NORMAL'
                ? 0x10b981
                : z.category === 'LOW_NDVI'
                  ? 0xf59e0b
                  : z.category === 'LOW_NDMI'
                    ? 0x06b6d4
                    : 0x94a3b8;
            const ringGeo = new THREE.RingGeometry(z.radiusMeters * METERS_TO_SCENE * 0.65, z.radiusMeters * METERS_TO_SCENE * 0.72, 32);
            const ringMesh = new THREE.Mesh(
              ringGeo,
              new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
            );
            ringMesh.rotation.x = -Math.PI / 2;
            ringMesh.position.set(xScene, 0.14, zScene);
            zoneRingsGroup.add(ringMesh);
          });
        }
      }

      // Update Irrigation Rig & Water Spray Mist Particles on Bölge C
      waterPoints.visible = s.irrigationActive;
      if (s.irrigationActive) {
        irrigationRig.wheels.forEach((w) => {
          w.rotation.x += 0.35 * realDt;
        });
        const wAttr = waterGeo.getAttribute('position') as THREE.BufferAttribute;
        const nozzleCount = irrigationRig.nozzlePositions.length;
        for (let i = 0; i < waterParticleCount; i++) {
          waterPhases[i] = (waterPhases[i] + realDt * 1.45) % 1.0;
          const p = waterPhases[i];
          const noz = irrigationRig.nozzlePositions[i % nozzleCount];
          const spreadAng = (i * 2.3999) % (Math.PI * 2);
          const spreadR = p * 1.55;
          const wx = noz.x + Math.cos(spreadAng) * spreadR;
          const wz = noz.z + Math.sin(spreadAng) * spreadR;
          const wy = noz.y * (1 - p * p) + 0.05;
          wAttr.setXYZ(i, wx, wy, wz);
        }
        wAttr.needsUpdate = true;
      }

      // Update Planned Route & Actual Flight Trail
      const planKey = s.missionPlan ? `${s.missionPlan.id}_${s.missionPlan.waypoints.length}` : 'none';
      if (planKey !== lastPlanId) {
        lastPlanId = planKey;
        plannedRouteLine.geometry.dispose();
        if (s.missionPlan && s.missionPlan.waypoints.length > 0) {
          const pts = s.missionPlan.waypoints.map(
            (w) => new THREE.Vector3(w.localX * METERS_TO_SCENE, Math.max(0.2, w.altitudeM * METERS_TO_SCENE), w.localZ * METERS_TO_SCENE),
          );
          plannedRouteLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
          (plannedRouteLine.material as THREE.LineBasicMaterial).color.setHex(s.missionPlan.isFeasible ? 0x0284c7 : 0xef4444);
        } else {
          plannedRouteLine.geometry = new THREE.BufferGeometry();
        }
      }

      if (s.drone.actualTrack.length !== lastTrackLen) {
        lastTrackLen = s.drone.actualTrack.length;
        actualTrackLine.geometry.dispose();
        if (s.drone.actualTrack.length >= 2) {
          const tPts = s.drone.actualTrack.map(
            (p) => new THREE.Vector3(p.localX * METERS_TO_SCENE, Math.max(0.25, p.altitudeM * METERS_TO_SCENE), p.localZ * METERS_TO_SCENE),
          );
          actualTrackLine.geometry = new THREE.BufferGeometry().setFromPoints(tPts);
        } else {
          actualTrackLine.geometry = new THREE.BufferGeometry();
        }
      }

      // Update 3D Drone Position, Tilt, Rotor Blur Discs & Spray Particles
      const droneX = s.drone.localX * METERS_TO_SCENE;
      const droneY = 0.08 + s.drone.altitudeM * METERS_TO_SCENE;
      const droneZ = s.drone.localZ * METERS_TO_SCENE;
      _droneWorldPos.set(droneX, droneY, droneZ);
      droneRig.root.position.copy(_droneWorldPos);
      droneRig.root.rotation.y = THREE.MathUtils.degToRad(-s.drone.headingDeg);

      _eulerScratch.set(
        THREE.MathUtils.degToRad(s.drone.pitchDeg),
        0,
        THREE.MathUtils.degToRad(s.drone.rollDeg),
      );
      droneRig.bodyTiltGroup.rotation.copy(_eulerScratch);

      const isApplicator =
        s.selectedDroneProfileId === 'PRECISION_APPLICATOR' ||
        s.agronomicOp === 'SPRAYING' ||
        s.agronomicOp === 'FERTILIZATION';
      droneRig.sprayBoomGroup.visible = isApplicator;

      const rotorsSpinning = s.drone.flightMode !== 'HAZIR_BEKLEME' && s.drone.flightMode !== 'GOREV_TAMAMLANDI';
      const spinSpeed = rotorsSpinning ? 28 * realDt : 0;
      droneRig.rotors.forEach((r, idx) => {
        r.rotation.y += idx % 2 === 0 ? spinSpeed : -spinSpeed;
      });
      droneRig.rotorBlurMats.forEach((bm) => {
        bm.opacity = rotorsSpinning ? 0.34 : 0.0;
      });

      const isSprayingNow =
        isApplicator &&
        s.drone.altitudeM > 1.5 &&
        (s.drone.flightMode === 'ROTA_SEYRI' || s.drone.flightMode === 'BOLGE_INCELEME');

      sprayPoints.visible = isSprayingNow;
      if (isSprayingNow) {
        sprayMat.color.setHex(s.agronomicOp === 'FERTILIZATION' ? 0xfbbf24 : 0x67e8f9);
        const sAttr = sprayGeo.getAttribute('position') as THREE.BufferAttribute;
        const hRad = THREE.MathUtils.degToRad(s.drone.headingDeg);
        const cosH = Math.cos(hRad);
        const sinH = Math.sin(hRad);
        for (let i = 0; i < sprayCount; i++) {
          sprayPhases[i] = (sprayPhases[i] + realDt * 1.9) % 1.0;
          const p = sprayPhases[i];
          const lx = sprayOffsetsX[i] * (0.8 + p * 0.9);
          const lz = sprayOffsetsZ[i] * (0.5 + p * 0.8);
          const wx = droneX + lx * cosH - lz * sinH;
          const wz = droneZ + lx * sinH + lz * cosH;
          const wy = Math.max(0.06, droneY * (1 - p));
          sAttr.setXYZ(i, wx, wy, wz);
        }
        sAttr.needsUpdate = true;
      }

      droneShadow.position.set(droneX, 0.09, droneZ);
      const shadowScale = Math.max(0.45, 1.0 - s.drone.altitudeM * 0.008);
      droneShadow.scale.setScalar(shadowScale);

      const showDownwash = rotorsSpinning && s.drone.altitudeM < 25;
      downwashRing.visible = showDownwash;
      if (showDownwash) {
        const dwPhase = (pulseClock * 2.4) % 1.0;
        downwashRing.position.set(droneX, 0.11, droneZ);
        downwashRing.scale.setScalar(0.85 + dwPhase * 0.85);
        downwashRingMat.opacity = (1 - dwPhase) * Math.max(0.1, 1 - s.drone.altitudeM / 25) * 0.35;
      }

      if (s.drone.photosCollected > lastPhotoCount) {
        lastPhotoCount = s.drone.photosCollected;
        photoFlashTimer = 0.35;
      } else if (s.drone.photosCollected < lastPhotoCount) {
        lastPhotoCount = s.drone.photosCollected;
      }
      if (photoFlashTimer > 0) {
        photoFlashTimer = Math.max(0, photoFlashTimer - realDt);
      }

      const droneAirborne = s.drone.altitudeM > 1.2;
      droneRig.fovConeMesh.visible = droneAirborne;
      if (droneAirborne) {
        const coneHeight = Math.max(0.5, droneY - 0.1);
        const footprintRadius = Math.max(1.2, coneHeight * 0.58);
        droneRig.fovConeMesh.scale.set(footprintRadius, coneHeight, footprintRadius);
        if (photoFlashTimer > 0) {
          droneRig.fovConeMat.color.setHex(0x34d399);
          droneRig.fovConeMat.opacity = 0.36;
        } else {
          droneRig.fovConeMat.color.setHex(0x22d3ee);
          droneRig.fovConeMat.opacity = 0.13;
        }
      }

      if (s.drone.flightElapsedSec < 0.25 && s.drone.flightMode === 'HAZIR_BEKLEME') {
        for (let i = 0; i < swathPoolCount; i++) swathPool[i].visible = false;
        swathDropIndex = 0;
        lastSwathDropX = -9999;
      } else if (isSprayingNow && Math.hypot(droneX - lastSwathDropX, droneZ - lastSwathDropZ) >= 1.65) {
        const decal = swathPool[swathDropIndex % swathPoolCount];
        decal.position.set(droneX, 0.08, droneZ);
        decal.visible = true;
        swathPoolMat.color.setHex(s.agronomicOp === 'FERTILIZATION' ? 0xfbbf24 : 0x38bdf8);
        swathDropIndex += 1;
        lastSwathDropX = droneX;
        lastSwathDropZ = droneZ;
      }

      // Update 3D Extracted Map Card above Command PC + Elevated Map-Packet Stream to Drone
      const mapExtractVisible =
        s.localServerConnected &&
        Boolean(s.spectralAnalysis || s.missionPlan || s.droneDataTransferred || s.acquisitionStage === 'AGROMAX_INGESTION');
      pcExtractedMapGroup.visible = mapExtractVisible;
      pcToDroneArcLine.visible = mapExtractVisible;
      if (mapExtractVisible) {
        pcExtractedMapGroup.position.y = pcEmitWorld.y + 1.5 + Math.sin(pulseClock * 2.2) * 0.12;
        pcExtractedMapGroup.rotation.y = -0.28 + Math.sin(pulseClock * 0.85) * 0.16;
        pcMapFrameMat.color.setHex(isExportingToDrone ? 0x10b981 : 0x38bdf8);
        pcToDroneArcMat.color.setHex(isExportingToDrone ? 0x10b981 : 0x38bdf8);
        pcPacketMat.color.setHex(isExportingToDrone ? 0x34d399 : 0x38bdf8);

        _pcArcStart.set(pcEmitWorld.x, pcEmitWorld.y + 0.45, pcEmitWorld.z);
        _pcArcEnd.set(droneX, droneY + 0.6, droneZ);
        _pcArcCtrl
          .copy(_pcArcStart)
          .lerp(_pcArcEnd, 0.5)
          .setY(Math.max(_pcArcStart.y, _pcArcEnd.y) + 6.5);

        const arcAttr = pcToDroneArcGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i <= pcArcSegments; i++) {
          const t = i / pcArcSegments;
          const omt = 1 - t;
          const px = omt * omt * _pcArcStart.x + 2 * omt * t * _pcArcCtrl.x + t * t * _pcArcEnd.x;
          const py = omt * omt * _pcArcStart.y + 2 * omt * t * _pcArcCtrl.y + t * t * _pcArcEnd.y;
          const pz = omt * omt * _pcArcStart.z + 2 * omt * t * _pcArcCtrl.z + t * t * _pcArcEnd.z;
          arcAttr.setXYZ(i, px, py, pz);
        }
        arcAttr.needsUpdate = true;

        for (let i = 0; i < pcToDronePackets.length; i++) {
          const pkt = pcToDronePackets[i];
          pkt.visible = true;
          const t = (pulseClock * 0.52 + i / pcToDronePackets.length) % 1.0;
          const omt = 1 - t;
          pkt.position.set(
            omt * omt * _pcArcStart.x + 2 * omt * t * _pcArcCtrl.x + t * t * _pcArcEnd.x,
            omt * omt * _pcArcStart.y + 2 * omt * t * _pcArcCtrl.y + t * t * _pcArcEnd.y,
            omt * omt * _pcArcStart.z + 2 * omt * t * _pcArcCtrl.z + t * t * _pcArcEnd.z,
          );
          pkt.rotation.y = pulseClock * 1.4 + i;
        }
      } else {
        for (let i = 0; i < pcToDronePackets.length; i++) {
          pcToDronePackets[i].visible = false;
        }
      }

      // Smooth Damped Camera Presets
      if (transitionActiveRef.current && preset !== 'FREE_CAMERA') {
        if (preset === 'EARTH_VIEW') {
          _camGoalPos.set(16, 13, 21);
          _camGoalTarget.set(0, 0, 0);
        } else if (preset === 'SATELLITE_TRACK') {
          _satWorldPos.copy(earthRig.satModel.position);
          _camGoalPos.copy(_satWorldPos).addScaledVector(_satWorldPos.clone().normalize(), 4.2);
          _camGoalPos.y += 1.6;
          _camGoalTarget.copy(_satWorldPos);
        } else if (preset === 'GROUND_STATION_CLOSE') {
          _camGoalPos.set(-34, 17, 66);
          _camGoalTarget.set(-48, 8.5, 30);
        } else if (preset === 'ANTENNA_MECHANICAL') {
          _camGoalPos.set(-54.0, 5.2, 43.0);
          _camGoalTarget.set(-60.6, 2.5, 35.8);
        } else if (preset === 'DATA_FLOW_VIEW') {
          _camGoalPos.set(-44, 16, 56);
          _camGoalTarget.set(-54, 5.5, 34);
        } else if (preset === 'FIELD_MAP_3D') {
          _camGoalPos.set(0, 82, 76);
          _camGoalTarget.set(0, 0, 2);
        } else if (preset === 'DRONE_CHASE') {
          const hRad = THREE.MathUtils.degToRad(s.drone.headingDeg);
          _camGoalPos.set(
            droneX - Math.sin(hRad) * 9.5,
            droneY + 4.2,
            droneZ + Math.cos(hRad) * 9.5,
          );
          _camGoalTarget.set(droneX, droneY, droneZ);
        } else if (preset === 'DRONE_ONBOARD') {
          const hRad = THREE.MathUtils.degToRad(s.drone.headingDeg);
          _camGoalPos.set(droneX, droneY + 0.35, droneZ);
          _camGoalTarget.set(
            droneX + Math.sin(hRad) * 18,
            Math.max(0, droneY - 8),
            droneZ - Math.cos(hRad) * 18,
          );
        }

        const lambda = 4.8;
        const alpha = 1 - Math.exp(-lambda * realDt);
        camera.position.lerp(_camGoalPos, alpha);
        controls.target.lerp(_camGoalTarget, alpha);
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    const resizeObs = new ResizeObserver(() => {
      if (!container || disposed) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObs.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObs.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      parcelBorder.geometry.dispose();(parcelBorder.material as THREE.Material).dispose();
      outdoorTarget?.dispose();outdoorGenerator.dispose();environmentSky.material.dispose();
      envRenderTarget.dispose();
      currentOverlayTex.dispose();
      surroundMap.dispose();
      surroundNormal.dispose();
      surroundRoughness.dispose();
      parcelNormal.dispose();
      parcelRoughness.dispose();
      mistSpriteTex.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      rockGeo.dispose();
      rockMat.dispose();
      parcelGeo.dispose();
      parcelMat.dispose();
      barkTex.map.dispose();
      barkTex.normalMap.dispose();
      foliageTex.dispose();
      oakGeos.canopyGeo.dispose();
      oakGeos.trunkGeo.dispose();
      poplarGeos.canopyGeo.dispose();
      poplarGeos.trunkGeo.dispose();
      foliageMat.dispose();
      barkMat.dispose();
      cropGeo.dispose();
      cropMat.dispose();
      edgeGrassMat.dispose();
      roadMat.dispose();
      helipad.geometry.dispose();
      (helipad.material as THREE.Material).dispose();
      helipadRing.geometry.dispose();
      (helipadRing.material as THREE.Material).dispose();
      downwashRingGeo.dispose();
      downwashRingMat.dispose();
      swathStrip.geometry.dispose();
      (swathStrip.material as THREE.Material).dispose();
      swathCurtain.geometry.dispose();
      (swathCurtain.material as THREE.Material).dispose();
      cloudShadow.geometry.dispose();
      (cloudShadow.material as THREE.Material).dispose();
      tractorShadow.geometry.dispose();
      (tractorShadow.material as THREE.Material).dispose();
      realWaterGeo?.dispose();
      waterGeo.dispose();
      waterMat.dispose();
      sprayGeo.dispose();
      sprayMat.dispose();
      swathPoolGeo.dispose();
      swathPoolMat.dispose();
      skyPulseGeo.dispose();
      skyPulseMat.dispose();
      rfWaveRingGeo.dispose();
      rfWaveRingMat.dispose();
      gcsPulseGeo.dispose();
      gcsPulseMat.dispose();
      gsRig.monitorTex.dispose();
      pcExtractedMapGeo.dispose();
      pcExtractedMapMat.dispose();
      pcMapFrameGeo.dispose();
      pcMapFrameMat.dispose();
      pcToDroneArcGeo.dispose();
      pcToDroneArcMat.dispose();
      pcPacketGeo.dispose();
      pcPacketMat.dispose();
      satCalloutTex.dispose();
      (satCalloutSprite.material as THREE.SpriteMaterial).dispose();
      gsCalloutTex.dispose();
      (gsCalloutSprite.material as THREE.SpriteMaterial).dispose();
      pcCalloutTex.dispose();
      (pcCalloutSprite.material as THREE.SpriteMaterial).dispose();
      renderer.dispose();
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  const sat = SATELLITE_PROFILES[selectedSatelliteId];
  const hw = GROUND_STATION_HARDWARE[hardwareId];

  return (
    <div className="relative w-full h-full bg-[#09111e] overflow-hidden select-none">
      {/* Isolated WebGL mount container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Subtle peripheral atmospheric vignette (non-blocking, zero backdrop-filter) */}
      <div className="pointer-events-none absolute inset-0 agromax-viewport-vignette z-[5]" />

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#09111e] text-slate-200 p-6 z-20">
          <div className="max-w-md border border-slate-700 bg-[#0d1522] p-5 rounded-lg">
            <h3 className="text-sm font-semibold text-amber-400">3D Görselleştirme Uyarısı</h3>
            <p className="mt-2 text-xs text-slate-300">{webglError}</p>
          </div>
        </div>
      )}

      {/* Clean Non-Overlapping Top HUD Row */}
      <div className="absolute top-3 inset-x-3 z-10 flex flex-wrap items-start justify-between gap-2 pointer-events-none">
        {/* Top-Left: Camera Presets & Sky Lighting */}
        <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
          <div className="flex flex-wrap items-center gap-0.5 agromax-hud border border-slate-700/80 rounded-md p-1">
            {CAMERA_PRESETS.map((p) => {
              const active = cameraPreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setCameraPreset(p.id)}
                  className={`px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-0.5 agromax-hud border border-slate-700/80 rounded-md p-1 text-[11px]">
            <button
              type="button"
              onClick={() => setLightingMode('NOON')}
              className={`px-2 py-1 rounded font-medium transition-colors whitespace-nowrap shrink-0 ${
                lightingMode === 'NOON' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Öğle
            </button>
            <button
              type="button"
              onClick={() => setLightingMode('GOLDEN_HOUR')}
              className={`px-2 py-1 rounded font-medium transition-colors whitespace-nowrap shrink-0 ${
                lightingMode === 'GOLDEN_HOUR' ? 'bg-amber-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Altın Saat
            </button>
          </div>
        </div>

        {/* Top-Right: Telemetry Pill, Proof Toggle & Agronomic Intervention Bar */}
        <div className="flex flex-col items-end gap-1.5 pointer-events-auto">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <div className="agromax-hud border border-slate-700/80 rounded-md px-2.5 py-1.5 text-[11px] text-slate-200 flex items-center gap-2 whitespace-nowrap">
              <span className="font-mono-tabular font-medium text-cyan-300">
                {sat.shortName} · El {orbit.elevationDeg.toFixed(0)}°
              </span>
              <span className="text-slate-600">|</span>
              <span className="font-mono-tabular text-emerald-300">
                {hw.dishDiameterM}m → {rf.receivedMb.toFixed(0)}/{rf.totalExpectedMb} MB
              </span>
            </div>

            <button
              type="button"
              onClick={() => setProofOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                proofOpen
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'agromax-hud border-slate-700/80 text-cyan-300 hover:bg-slate-800'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Kanıt &amp; Kamera</span>
            </button>
          </div>

          <div className="flex items-center gap-1 agromax-hud border border-slate-700/80 rounded-md p-1">
            {AGRONOMIC_MODES.map((m) => {
              const active = m.id === 'IRRIGATION' ? irrigationActive : agronomicOp === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => (m.id === 'IRRIGATION' ? toggleIrrigation() : setAgronomicOp(m.id))}
                  className={`px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? m.id === 'IRRIGATION'
                        ? 'bg-cyan-600 text-white'
                        : m.id === 'SPRAYING'
                          ? 'bg-emerald-600 text-white'
                          : m.id === 'FERTILIZATION'
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-700 text-white'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {proofOpen && <ProofPanelDrawer onClose={() => setProofOpen(false)} />}
        </div>
      </div>
    </div>
  );
};
