import * as THREE from 'three';
import { geodeticToEcef, sampleOrbitTrajectory } from '../../satellite/orbitMath';
import { GROUND_STATION_COORDS } from '../../shared/catalog';
import { OrbitTelemetry, SatelliteProfile } from '../../shared/types';
import { buildSatelliteModel } from './models';
import { createEarthProceduralTexture } from './textures';

const EARTH_SCALE = 1 / 637.1; // Earth radius = 10 Three.js units

export function latLonAltToSceneVec(latDeg: number, lonDeg: number, altKm: number, out: THREE.Vector3): THREE.Vector3 {
  const ecef = geodeticToEcef(latDeg, lonDeg, altKm);
  return out.set(ecef.x * EARTH_SCALE, ecef.y * EARTH_SCALE, ecef.z * EARTH_SCALE);
}

export interface EarthSceneRig {
  root: THREE.Group;
  earthMesh: THREE.Mesh;
  satModel: THREE.Group;
  gsMarker: THREE.Mesh;
  visCone: THREE.Mesh;
  rfBeam: THREE.Line;
  orbitLine: THREE.Line;
  groundTrackLine: THREE.Line;
  aosMarker: THREE.Mesh;
  losMarker: THREE.Mesh;
  starField: THREE.Points;
  update: (sat: SatelliteProfile, orbit: OrbitTelemetry, carrierLocked: boolean, hardwareCompatible: boolean, dt: number) => void;
  rebuildOrbit: (sat: SatelliteProfile) => void;
}

export function buildEarthSceneRig(maxAnisotropy: number): EarthSceneRig {
  const root = new THREE.Group();
  root.name = 'EarthOrbitScene';

  // 1. Starfield background (using Points buffer)
  const starCount = 1200;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 160 + Math.random() * 140;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi);
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starField = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0x94a3b8, size: 0.45, sizeAttenuation: true }),
  );
  root.add(starField);

  // 2. Earth Globe (R = 10 units)
  const { map, roughnessMap } = createEarthProceduralTexture(maxAnisotropy);
  const earthGeo = new THREE.SphereGeometry(10, 64, 48);
  const earthMat = new THREE.MeshStandardMaterial({
    map,
    roughnessMap,
    roughness: 0.72,
    metalness: 0.08,
  });
  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  root.add(earthMesh);

  // 3. Subtle Atmospheric Fresnel Rim Shader
  const atmoGeo = new THREE.SphereGeometry(10.35, 48, 36);
  const atmoMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float rim = pow(0.62 - dot(vNormal, -vViewDir), 3.2);
        gl_FragColor = vec4(0.18, 0.65, 0.95, clamp(rim, 0.0, 0.55));
      }
    `,
  });
  const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
  root.add(atmoMesh);

  // 4. Ground Station Marker (Ankara-Polatlı) & Visibility Cone
  const gsPos = new THREE.Vector3();
  latLonAltToSceneVec(GROUND_STATION_COORDS.latDeg, GROUND_STATION_COORDS.lonDeg, 15, gsPos);

  const gsMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 1.2 }),
  );
  gsMarker.position.copy(gsPos);
  root.add(gsMarker);

  // Visibility horizon cone above Ground Station
  const coneGeo = new THREE.ConeGeometry(2.8, 3.2, 32, 1, true);
  coneGeo.translate(0, -1.6, 0);
  const visCone = new THREE.Mesh(
    coneGeo,
    new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.11,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  visCone.position.copy(gsPos);
  // Orient cone outward along Earth radial normal
  const normal = gsPos.clone().normalize();
  visCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), normal);
  root.add(visCone);

  // 5. Satellite Model (scaled appropriately for orbital scene)
  const satModel = buildSatelliteModel();
  satModel.scale.setScalar(0.42);
  root.add(satModel);

  // 6. Orbit Ring, Ground Track, AOS/LOS markers, RF Link Line
  const orbitLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 }),
  );
  root.add(orbitLine);

  const groundTrackLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.8 }),
  );
  root.add(groundTrackLine);

  const aosMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x10b981 }),
  );
  const losMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xef4444 }),
  );
  root.add(aosMarker, losMarker);

  const rfBeamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const rfBeamMat = new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.9 });
  const rfBeam = new THREE.Line(rfBeamGeo, rfBeamMat);
  root.add(rfBeam);

  const _satPos = new THREE.Vector3();
  const _tmpV = new THREE.Vector3();

  const rebuildOrbit = (sat: SatelliteProfile) => {
    const { orbitPoints, groundTrack } = sampleOrbitTrajectory(sat, 120);
    const orbVecs = orbitPoints.map((p) => latLonAltToSceneVec(p.latDeg, p.lonDeg, p.altKm, new THREE.Vector3()));
    orbitLine.geometry.dispose();
    orbitLine.geometry = new THREE.BufferGeometry().setFromPoints(orbVecs);

    const gtVecs = groundTrack.map((p) => latLonAltToSceneVec(p.latDeg, p.lonDeg, 35, new THREE.Vector3()));
    groundTrackLine.geometry.dispose();
    groundTrackLine.geometry = new THREE.BufferGeometry().setFromPoints(gtVecs);

    if (gtVecs.length >= 2) {
      aosMarker.position.copy(gtVecs[0]);
      losMarker.position.copy(gtVecs[gtVecs.length - 1]);
    }
  };

  const update = (
    _sat: SatelliteProfile,
    orbit: OrbitTelemetry,
    carrierLocked: boolean,
    hardwareCompatible: boolean,
  ) => {
    latLonAltToSceneVec(orbit.latDeg, orbit.lonDeg, orbit.altKm, _satPos);
    satModel.position.copy(_satPos);
    // Point satellite nadir telescope toward Earth center
    satModel.lookAt(0, 0, 0);
    satModel.rotateX(Math.PI / 2);

    // Update RF communication beam
    const posAttr = rfBeam.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.setXYZ(0, gsPos.x, gsPos.y, gsPos.z);
    posAttr.setXYZ(1, _satPos.x, _satPos.y, _satPos.z);
    posAttr.needsUpdate = true;

    rfBeam.visible = orbit.isAboveHorizon;
    if (!hardwareCompatible) {
      rfBeamMat.color.setHex(0xef4444);
      rfBeamMat.opacity = 0.35;
    } else if (carrierLocked) {
      rfBeamMat.color.setHex(0x10b981);
      rfBeamMat.opacity = 0.95;
    } else {
      rfBeamMat.color.setHex(0xf59e0b);
      rfBeamMat.opacity = 0.55;
    }

    _tmpV.copy(_satPos).normalize();
  };

  return {
    root,
    earthMesh,
    satModel,
    gsMarker,
    visCone,
    rfBeam,
    orbitLine,
    groundTrackLine,
    aosMarker,
    losMarker,
    starField,
    update,
    rebuildOrbit,
  };
}
