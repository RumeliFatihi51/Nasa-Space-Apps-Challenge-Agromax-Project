import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GROUND_STATION_HARDWARE, SATELLITE_PROFILES } from '../../shared/catalog';
import { useSimulationStore } from '../../telemetry/simulationStore';
import {
  buildDroneModel,
  buildGroundStationModel,
  buildIrrigationRig,
  buildSatelliteModel,
} from './models';
import { createSoftContactShadowTexture } from './textures';

interface StreetViewArOverlayProps {
  panorama: google.maps.StreetViewPanorama | null;
  parcelBearingDeg: number;
  followDrone: boolean;
}

const CAM_HEIGHT_M = 2.5;
const FIELD_DISTANCE_M = 48;
const FIELD_SCALE = 0.085; // maps ±320m parcel coords to ±27m around field center
const ALTITUDE_SCALE = 0.24; // keeps 14m..55m flight visibly framed above horizon

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _fieldCenter = new THREE.Vector3();
const _dishFeedWorld = new THREE.Vector3();
const _overheadSatPos = new THREE.Vector3();
const _beamDir = new THREE.Vector3();
const _beamMid = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _droneWorldPos = new THREE.Vector3();
const _eulerScratch = new THREE.Euler();
const _cableTmpPos = new THREE.Vector3();

function createMistSpriteTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
  grad.addColorStop(0.45, 'rgba(230, 248, 255, 0.52)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function shortestAngleDiffDeg(target: number, current: number): number {
  return ((target - current + 540) % 360) - 180;
}

export const StreetViewArOverlay: React.FC<StreetViewArOverlayProps> = ({
  panorama,
  parcelBearingDeg,
  followDrone,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(panorama);
  const bearingRef = useRef<number>(parcelBearingDeg);
  const followDroneRef = useRef<boolean>(followDrone);

  useEffect(() => {
    panoramaRef.current = panorama;
  }, [panorama]);

  useEffect(() => {
    bearingRef.current = parcelBearingDeg;
  }, [parcelBearingDeg]);

  useEffect(() => {
    followDroneRef.current = followDrone;
  }, [followDrone]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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
        alpha: true,
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);

    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.pointerEvents = 'none';
    container.appendChild(canvas);

    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    // Transparent Scene + Subtle IBL Reflections (never set scene.background)
    const scene = new THREE.Scene();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    scene.environmentIntensity = 0.72;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      62,
      (container.clientWidth || 800) / (container.clientHeight || 600),
      0.2,
      800,
    );
    camera.position.set(0, CAM_HEIGHT_M, 0);
    camera.rotation.order = 'YXZ';

    // Natural Anatolian Outdoor Sun + Sky Fill Lighting
    const sunLight = new THREE.DirectionalLight(0xfff4df, 3.05);
    sunLight.position.set(48, 72, 34);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 220;
    sunLight.shadow.camera.left = -75;
    sunLight.shadow.camera.right = 75;
    sunLight.shadow.camera.top = 75;
    sunLight.shadow.camera.bottom = -75;
    sunLight.shadow.bias = -0.0003;
    sunLight.shadow.normalBias = 0.02;
    sunLight.shadow.radius = 2.6;
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0xc2e2ff, 0x6f6449, 1.05);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.42);
    rimLight.position.set(-45, 22, -45);
    scene.add(rimLight);

    // Real-ground Shadow Catcher Plane (transparent except where 3D rigs cast shadows)
    const shadowCatcherGeo = new THREE.PlaneGeometry(320, 320);
    const shadowCatcherMat = new THREE.ShadowMaterial({ opacity: 0.44 });
    const shadowCatcher = new THREE.Mesh(shadowCatcherGeo, shadowCatcherMat);
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = 0.0;
    shadowCatcher.receiveShadow = true;
    scene.add(shadowCatcher);

    // Ground Station Compound placed roadside/field-edge in front-right view
    const gsRig = buildGroundStationModel(maxAnisotropy);
    gsRig.root.scale.setScalar(0.82);
    scene.add(gsRig.root);

    // Overhead Tracked Satellite + Sky RF Downlink Beam + Streaming Data Packets
    const skyPrimarySat = buildSatelliteModel();
    skyPrimarySat.scale.setScalar(1.65);
    scene.add(skyPrimarySat);

    const dishBeamGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const dishBeamMat = new THREE.LineBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.92,
    });
    const dishBeamLine = new THREE.Line(dishBeamGeo, dishBeamMat);
    scene.add(dishBeamLine);

    const beamConeGeo = new THREE.CylinderGeometry(0.16, 1.25, 1, 16, 1, true);
    const beamConeMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const beamConeMesh = new THREE.Mesh(beamConeGeo, beamConeMat);
    scene.add(beamConeMesh);

    const skyPulseCount = 12;
    const skyDataPulses: THREE.Mesh[] = [];
    const skyPulseGeo = new THREE.SphereGeometry(0.28, 10, 10);
    const skyPulseMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    for (let i = 0; i < skyPulseCount; i++) {
      const sp = new THREE.Mesh(skyPulseGeo, skyPulseMat);
      sp.visible = false;
      scene.add(sp);
      skyDataPulses.push(sp);
    }

    // Irrigation Linear System in Bölge C
    const irrigationRig = buildIrrigationRig();
    irrigationRig.root.scale.setScalar(0.75);
    scene.add(irrigationRig.root);

    const mistTex = createMistSpriteTexture();
    const waterParticleCount = 320;
    const waterPositions = new Float32Array(waterParticleCount * 3);
    const waterPhases = new Float32Array(waterParticleCount);
    for (let i = 0; i < waterParticleCount; i++) {
      waterPhases[i] = Math.random();
    }
    const waterGeo = new THREE.BufferGeometry();
    waterGeo.setAttribute('position', new THREE.BufferAttribute(waterPositions, 3));
    const waterMat = new THREE.PointsMaterial({
      map: mistTex,
      color: 0xdbeafe,
      size: 0.48,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    const waterPoints = new THREE.Points(waterGeo, waterMat);
    waterPoints.visible = false;
    irrigationRig.root.add(waterPoints);

    // Helipad Pad + Autonomous Drone Rig
    const helipadGeo = new THREE.CylinderGeometry(1.4, 1.55, 0.06, 24);
    const helipadMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
      metalness: 0.15,
    });
    const helipad = new THREE.Mesh(helipadGeo, helipadMat);
    helipad.receiveShadow = true;
    scene.add(helipad);

    const droneRig = buildDroneModel();
    droneRig.root.scale.setScalar(1.45);
    scene.add(droneRig.root);

    const softShadowTex = createSoftContactShadowTexture();
    const droneShadowGeo = new THREE.PlaneGeometry(3.6, 3.6);
    const droneShadowMat = new THREE.MeshBasicMaterial({
      map: softShadowTex,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    const droneShadow = new THREE.Mesh(droneShadowGeo, droneShadowMat);
    droneShadow.rotation.x = -Math.PI / 2;
    scene.add(droneShadow);

    // Atomized Spray / Fertilizer Mist Particle Cloud
    const sprayCount = 260;
    const sprayPositions = new Float32Array(sprayCount * 3);
    const sprayPhases = new Float32Array(sprayCount);
    const sprayOffsetsX = new Float32Array(sprayCount);
    const sprayOffsetsZ = new Float32Array(sprayCount);
    for (let i = 0; i < sprayCount; i++) {
      sprayPhases[i] = Math.random();
      sprayOffsetsX[i] = (Math.random() - 0.5) * 3.0;
      sprayOffsetsZ[i] = (Math.random() - 0.5) * 1.2;
    }
    const sprayGeo = new THREE.BufferGeometry();
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPositions, 3));
    const sprayMat = new THREE.PointsMaterial({
      map: mistTex,
      color: 0x67e8f9,
      size: 0.62,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
    });
    const sprayPoints = new THREE.Points(sprayGeo, sprayMat);
    sprayPoints.visible = false;
    scene.add(sprayPoints);

    // Planned Route & Live Flight Trail in 3D Sky Space
    const plannedRouteLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.72 }),
    );
    const actualTrackLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.92 }),
    );
    scene.add(plannedRouteLine, actualTrackLine);

    // Subtle AR Priority Zone Ground Rings
    const zoneRingsGroup = new THREE.Group();
    scene.add(zoneRingsGroup);

    let lastAnalysisKey = '';
    let lastPlanKey = '';
    let lastTrackLen = -1;
    let lastPhotoCount = 0;
    let photoFlashTimer = 0;
    let pulseClock = 0;

    function syncCameraToStreetView() {
      const pano = panoramaRef.current;
      const w = container?.clientWidth || 800;
      const h = container?.clientHeight || 600;
      const aspect = w / Math.max(1, h);
      camera.aspect = aspect;

      if (pano) {
        const pov = pano.getPov();
        const rawZoom = pano.getZoom();
        const heading = Number.isFinite(pov?.heading) ? pov.heading : bearingRef.current;
        const pitch = Number.isFinite(pov?.pitch) ? pov.pitch : 4;
        const zoom =
          typeof rawZoom === 'number' && Number.isFinite(rawZoom)
            ? Math.max(0, Math.min(4.5, rawZoom))
            : 1;

        camera.position.set(0, CAM_HEIGHT_M, 0);
        camera.rotation.y = -THREE.MathUtils.degToRad(heading);
        camera.rotation.x = THREE.MathUtils.degToRad(pitch);
        camera.rotation.z = 0;

        const hFovHalfTan = Math.pow(2, 1 - zoom);
        const vFovDeg = THREE.MathUtils.radToDeg(
          2 * Math.atan(hFovHalfTan / Math.max(0.5, aspect)),
        );
        camera.fov = Math.max(12, Math.min(108, vFovDeg));
      } else {
        camera.position.set(0, CAM_HEIGHT_M, 0);
        camera.rotation.y = -THREE.MathUtils.degToRad(bearingRef.current);
        camera.rotation.x = THREE.MathUtils.degToRad(4);
        camera.rotation.z = 0;
        camera.fov = 62;
      }
      camera.updateProjectionMatrix();
    }

    const povListener = panorama?.addListener('pov_changed', syncCameraToStreetView);
    const zoomListener = panorama?.addListener('zoom_changed', syncCameraToStreetView);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

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
          frameId = window.setTimeout(cb, 70);
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
      const hw = GROUND_STATION_HARDWARE[s.hardwareId];
      const isGolden = s.lightingMode === 'GOLDEN_HOUR';

      renderer.toneMappingExposure = isGolden ? 1.12 : 1.05;
      sunLight.color.setHex(isGolden ? 0xffc680 : 0xfff4df);
      sunLight.intensity = isGolden ? 2.65 : 3.05;

      // Anchor Field Center & Roadside Ground Station relative to parcelBearingDeg
      const bRad = THREE.MathUtils.degToRad(bearingRef.current);
      _fwd.set(Math.sin(bRad), 0, -Math.cos(bRad));
      _right.set(Math.cos(bRad), 0, Math.sin(bRad));
      _fieldCenter.copy(_fwd).multiplyScalar(FIELD_DISTANCE_M);

      // Ground Station parked at 15m forward + 7.5m right from Street View camera
      gsRig.root.position
        .copy(_fwd)
        .multiplyScalar(15.5)
        .addScaledVector(_right, 7.6);
      gsRig.root.position.y = 0;
      gsRig.root.rotation.y = -bRad + 0.35;

      // Irrigation rig parked at Bölge C relative offset
      irrigationRig.root.position.set(
        _fieldCenter.x - 140 * FIELD_SCALE,
        0,
        _fieldCenter.z + 128 * FIELD_SCALE,
      );
      irrigationRig.root.rotation.y = -bRad + 0.25;

      // Helipad at takeoff (-295m, 185m)
      helipad.position.set(
        _fieldCenter.x - 295 * FIELD_SCALE,
        0.03,
        _fieldCenter.z + 185 * FIELD_SCALE,
      );

      // Ground Station Dish Slewing & Server Status
      const dishScale = hw.id === 'DISH_240CM_X_PRO' ? 1.0 : 0.62;
      gsRig.dishScaleGroup.scale.setScalar(dishScale);
      gsRig.azimuthGroup.rotation.y = THREE.MathUtils.degToRad(-s.antennaAzDeg) - gsRig.root.rotation.y;
      gsRig.elevationGroup.rotation.x = THREE.MathUtils.degToRad(s.antennaElDeg);

      const ledMat = gsRig.serverLedMesh.material as THREE.MeshStandardMaterial;
      if (!s.localServerConnected) {
        ledMat.color.setHex(0xef4444);
        ledMat.emissive.setHex(0xef4444);
      } else if (
        s.acquisitionStage === 'FRAME_RECEPTION' ||
        s.acquisitionStage === 'AGROMAX_INGESTION'
      ) {
        ledMat.color.setHex(0x10b981);
        ledMat.emissive.setHex(0x10b981);
      } else {
        ledMat.color.setHex(0x06b6d4);
        ledMat.emissive.setHex(0x06b6d4);
      }

      gsRig.root.updateMatrixWorld(true);
      gsRig.feedHornMesh.getWorldPosition(_dishFeedWorld);

      // Overhead Sky Satellite positioned in the real Street View sky above horizon
      const satAzR = THREE.MathUtils.degToRad(s.orbit.azimuthDeg);
      const satElR = THREE.MathUtils.degToRad(Math.max(16, s.orbit.elevationDeg));
      const skyRadius = 74;
      _overheadSatPos.set(
        _dishFeedWorld.x + Math.sin(satAzR) * Math.cos(satElR) * skyRadius,
        _dishFeedWorld.y + Math.sin(satElR) * skyRadius,
        _dishFeedWorld.z - Math.cos(satAzR) * Math.cos(satElR) * skyRadius,
      );
      skyPrimarySat.position.copy(_overheadSatPos);
      skyPrimarySat.lookAt(_dishFeedWorld);
      skyPrimarySat.rotateX(Math.PI / 2);

      // Dish RF Beam & Overhead Data Packets
      const antAzR = THREE.MathUtils.degToRad(s.antennaAzDeg);
      const antElR = THREE.MathUtils.degToRad(s.antennaElDeg);
      _beamDir.set(
        Math.sin(antAzR) * Math.cos(antElR),
        Math.sin(antElR),
        -Math.cos(antAzR) * Math.cos(antElR),
      );
      const isReceiving =
        s.rf.carrierLocked && s.rf.hardwareCompatible && s.orbit.isAboveHorizon;
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
        dishBeamMat.opacity = 0.5;
      } else if (isReceiving) {
        dishBeamMat.color.setHex(0x10b981);
        dishBeamMat.opacity = 0.92;
        beamConeMat.color.setHex(0x10b981);
        beamConeMat.opacity = 0.16;
      } else {
        dishBeamMat.color.setHex(0xf59e0b);
        dishBeamMat.opacity = 0.58;
        beamConeMat.color.setHex(0xf59e0b);
        beamConeMat.opacity = 0.09;
      }

      const streamActive =
        showBeam &&
        s.rf.hardwareCompatible &&
        (s.acquisitionStage !== 'IDLE' || s.rf.carrierLocked);
      skyPulseMat.color.setHex(isReceiving ? 0x34d399 : 0xfbbf24);
      for (let i = 0; i < skyDataPulses.length; i++) {
        const sp = skyDataPulses[i];
        sp.visible = streamActive;
        if (streamActive) {
          const frac = (pulseClock * 0.65 + i / skyDataPulses.length) % 1.0;
          sp.position.lerpVectors(beamTarget, _dishFeedWorld, frac);
        }
      }

      gsRig.cablePulses.forEach((cp, idx) => {
        cp.visible = streamActive && s.localServerConnected;
        if (cp.visible) {
          const u = (pulseClock * 0.9 + idx / gsRig.cablePulses.length) % 1.0;
          gsRig.cableCurve.getPoint(u, _cableTmpPos);
          cp.position.copy(_cableTmpPos);
        }
      });

      // Irrigation Spray Mist Particles
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
          const spreadR = p * 1.5;
          wAttr.setXYZ(
            i,
            noz.x + Math.cos(spreadAng) * spreadR,
            noz.y * (1 - p * p) + 0.05,
            noz.z + Math.sin(spreadAng) * spreadR,
          );
        }
        wAttr.needsUpdate = true;
      }

      // Priority Zone Ground Rings in AR
      const analysisKey = `${s.spectralAnalysis?.datasetId ?? 'none'}_${bearingRef.current.toFixed(1)}`;
      if (analysisKey !== lastAnalysisKey) {
        lastAnalysisKey = analysisKey;
        while (zoneRingsGroup.children.length > 0) {
          const child = zoneRingsGroup.children[0] as THREE.Mesh;
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
          zoneRingsGroup.remove(child);
        }
        if (s.spectralAnalysis) {
          s.spectralAnalysis.priorityZones.forEach((z) => {
            const xOff = (z.centerNormalized[0] - 0.5) * 640 * FIELD_SCALE;
            const zOff = (z.centerNormalized[1] - 0.5) * 580 * FIELD_SCALE;
            const ringColor =
              z.category === 'NORMAL'
                ? 0x10b981
                : z.category === 'LOW_NDVI'
                  ? 0xf59e0b
                  : z.category === 'LOW_NDMI'
                    ? 0x06b6d4
                    : 0x94a3b8;
            const rOuter = z.radiusMeters * FIELD_SCALE * 0.72;
            const ringGeo = new THREE.RingGeometry(rOuter * 0.85, rOuter, 36);
            const ringMesh = new THREE.Mesh(
              ringGeo,
              new THREE.MeshBasicMaterial({
                color: ringColor,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.85,
              }),
            );
            ringMesh.rotation.x = -Math.PI / 2;
            ringMesh.position.set(_fieldCenter.x + xOff, 0.08, _fieldCenter.z + zOff);
            zoneRingsGroup.add(ringMesh);
          });
        }
      }

      // Drone Planned Route & Live Track Lines
      const planKey = s.missionPlan
        ? `${s.missionPlan.id}_${s.missionPlan.waypoints.length}_${bearingRef.current.toFixed(1)}`
        : 'none';
      if (planKey !== lastPlanKey) {
        lastPlanKey = planKey;
        plannedRouteLine.geometry.dispose();
        if (s.missionPlan && s.missionPlan.waypoints.length > 0) {
          const pts = s.missionPlan.waypoints.map(
            (w) =>
              new THREE.Vector3(
                _fieldCenter.x + w.localX * FIELD_SCALE,
                Math.max(0.25, w.altitudeM * ALTITUDE_SCALE),
                _fieldCenter.z + w.localZ * FIELD_SCALE,
              ),
          );
          plannedRouteLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
          (plannedRouteLine.material as THREE.LineBasicMaterial).color.setHex(
            s.missionPlan.isFeasible ? 0x38bdf8 : 0xef4444,
          );
        } else {
          plannedRouteLine.geometry = new THREE.BufferGeometry();
        }
      }

      if (s.drone.actualTrack.length !== lastTrackLen) {
        lastTrackLen = s.drone.actualTrack.length;
        actualTrackLine.geometry.dispose();
        if (s.drone.actualTrack.length >= 2) {
          const tPts = s.drone.actualTrack.map(
            (p) =>
              new THREE.Vector3(
                _fieldCenter.x + p.localX * FIELD_SCALE,
                Math.max(0.3, p.altitudeM * ALTITUDE_SCALE),
                _fieldCenter.z + p.localZ * FIELD_SCALE,
              ),
          );
          actualTrackLine.geometry = new THREE.BufferGeometry().setFromPoints(tPts);
        } else {
          actualTrackLine.geometry = new THREE.BufferGeometry();
        }
      }

      // Autonomous Drone Rig Positioning, Banking, Rotors & Atomized Spray Cloud
      const droneX = _fieldCenter.x + s.drone.localX * FIELD_SCALE;
      const droneY = 0.08 + s.drone.altitudeM * ALTITUDE_SCALE;
      const droneZ = _fieldCenter.z + s.drone.localZ * FIELD_SCALE;
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

      const rotorsSpinning =
        s.drone.flightMode !== 'HAZIR_BEKLEME' &&
        s.drone.flightMode !== 'GOREV_TAMAMLANDI';
      const spinSpeed = rotorsSpinning ? 30 * realDt : 0;
      droneRig.rotors.forEach((r, idx) => {
        r.rotation.y += idx % 2 === 0 ? spinSpeed : -spinSpeed;
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
          sprayPhases[i] = (sprayPhases[i] + realDt * 1.95) % 1.0;
          const p = sprayPhases[i];
          const lx = sprayOffsetsX[i] * (0.85 + p * 1.05);
          const lz = sprayOffsetsZ[i] * (0.6 + p * 0.9);
          sAttr.setXYZ(
            i,
            droneX + lx * cosH - lz * sinH,
            Math.max(0.08, droneY * (1 - p)),
            droneZ + lx * sinH + lz * cosH,
          );
        }
        sAttr.needsUpdate = true;
      }

      droneShadow.position.set(droneX, 0.04, droneZ);
      droneShadow.scale.setScalar(Math.max(0.45, 1.0 - s.drone.altitudeM * 0.008));

      // Optical Camera Shutter Flash & Downward FOV Pyramid
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
        const footprintRadius = Math.max(1.1, coneHeight * 0.56);
        droneRig.fovConeMesh.scale.set(footprintRadius, coneHeight, footprintRadius);
        if (photoFlashTimer > 0) {
          droneRig.fovConeMat.color.setHex(0x34d399);
          droneRig.fovConeMat.opacity = 0.38;
        } else {
          droneRig.fovConeMat.color.setHex(0x22d3ee);
          droneRig.fovConeMat.opacity = 0.14;
        }
      }

      // Optional Auto-Follow Drone POV on real Google Street View Panorama
      const activePano = panoramaRef.current;
      if (followDroneRef.current && activePano && (droneAirborne || s.isRunning)) {
        const dx = _droneWorldPos.x;
        const dz = _droneWorldPos.z;
        const dy = _droneWorldPos.y - CAM_HEIGHT_M;
        const horiz = Math.max(1, Math.hypot(dx, dz));
        const targetHeading = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
        const targetPitch = Math.max(-35, Math.min(55, THREE.MathUtils.radToDeg(Math.atan2(dy, horiz))));

        const curr = activePano.getPov();
        const currH = Number.isFinite(curr?.heading) ? curr.heading : targetHeading;
        const currP = Number.isFinite(curr?.pitch) ? curr.pitch : targetPitch;
        const alpha = 1 - Math.exp(-3.6 * realDt);
        const nextH = (currH + shortestAngleDiffDeg(targetHeading, currH) * alpha + 360) % 360;
        const nextP = currP + (targetPitch - currP) * alpha;

        if (
          Math.abs(shortestAngleDiffDeg(targetHeading, currH)) > 0.12 ||
          Math.abs(targetPitch - currP) > 0.12
        ) {
          activePano.setPov({
            heading: nextH,
            pitch: nextP,
          });
        }
      }

      syncCameraToStreetView();
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
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObs.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObs.disconnect();
      if (povListener) google.maps.event.removeListener(povListener);
      if (zoomListener) google.maps.event.removeListener(zoomListener);
      shadowCatcherGeo.dispose();
      shadowCatcherMat.dispose();
      helipadGeo.dispose();
      helipadMat.dispose();
      droneShadowGeo.dispose();
      droneShadowMat.dispose();
      softShadowTex.dispose();
      mistTex.dispose();
      waterGeo.dispose();
      waterMat.dispose();
      sprayGeo.dispose();
      sprayMat.dispose();
      dishBeamGeo.dispose();
      dishBeamMat.dispose();
      beamConeGeo.dispose();
      beamConeMat.dispose();
      skyPulseGeo.dispose();
      skyPulseMat.dispose();
      plannedRouteLine.geometry.dispose();
      (plannedRouteLine.material as THREE.Material).dispose();
      actualTrackLine.geometry.dispose();
      (actualTrackLine.material as THREE.Material).dispose();
      renderer.dispose();
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
    };
  }, [panorama]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-[4] overflow-hidden"
    />
  );
};
